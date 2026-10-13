import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// --- The mock ---------------------------------------------------------------
// vi.mock is hoisted above the imports below by Vitest. The factory replaces
// ./db.js's `supabase` with a vi.fn we configure per test. server.js (imported
// next) picks up the mocked supabase, so no real DB is ever contacted.
// This is the "mock db.js" half of the hybrid strategy -- the open GitHub issue
// is about the real-DB smoke suite, which is separate and not done here.
vi.mock('./db.js', () => ({
  supabase: { from: vi.fn() },
}))

// Import AFTER the mock so server.js sees the mocked supabase.
import { supabase } from './db.js'
import { app } from './server.js'
import { resetCache } from './cache.js'

// Build a chainable, awaitable mock for ONE supabase query.
// The real client lets you `await supabase.from(t).select(...).eq(...)` and
// resolves to `{ data, error }`. We mimic that: every builder method returns
// the chain, and `then` (what `await` calls) resolves to `result`.
function queryReturning(result) {
  const chain = {}
  for (const m of ['select', 'eq', 'lte', 'gt', 'order', 'range']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve) => resolve(result)
  return chain
}

// --- Fixtures (PostgREST shape, pre-transform) ------------------------------
// These match what the real Supabase query in server.js would return, so the
// tests exercise the full transform -> validate -> route pipeline.

const buildingsData = [
  {
    id: 1, code: 'DBH', name: 'Donald Bren Hall',
    lat: 33.6446, lng: -117.8432,
    rooms: [{ room_number: '1425' }, { room_number: '1300' }],
  },
  {
    id: 2, code: 'SSL', name: 'Science Library',
    lat: 33.6460, lng: -117.8440,
    rooms: [{ room_number: '100' }],
  },
]

const meetingsData = [
  {
    course_title: 'COMPSCI161', day_of_week: 1,
    start_time: '11:00:00', end_time: '11:50:00',
    rooms: { room_number: '1425', buildings: { code: 'DBH' } },
  },
]

// Busy rows from /api/availability's second query. Only the nested room+code
// are selected, so that's all the fixture needs.
const busyData = [
  { rooms: { room_number: '1425', buildings: { code: 'DBH' } } },
]

// Configure supabase.from(table) to return the right canned query per table.
// Call this at the start of each happy-path test, or inline a custom variant.
function stubHappyQueries({ buildings = buildingsData, busy = busyData, meetings = meetingsData } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'buildings') return queryReturning({ data: buildings, error: null })
    if (table === 'class_meetings') {
      // The route distinguishes the two class_meetings queries by the columns
      // it selects, but both resolve the same way here. busy is used by
      // /api/availability, meetings by /api/schedule. We can't tell them apart
      // from `table` alone, so tests that hit both pick one shape; in practice
      // each route makes only one class_meetings query, so this is fine.
      return queryReturning({ data: meetings, error: null })
    }
    return queryReturning({ data: [], error: null })
  })
}

beforeEach(() => {
  resetCache()
  supabase.from.mockReset()
})


// --- /api/health ------------------------------------------------------------

describe('GET /api/health', () => {
  it('returns 200 { status: "ok" }', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})


// --- /api/buildings ---------------------------------------------------------

describe('GET /api/buildings', () => {
  it('returns 200 with the contract shape: [{ id, code, name, lat, lng, rooms: [...] }]', async () => {
    stubHappyQueries()
    const res = await request(app).get('/api/buildings')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    // DBH row matches the API contract exactly (rooms flattened + sorted).
    expect(res.body[0]).toEqual({
      id: 1, code: 'DBH', name: 'Donald Bren Hall',
      lat: 33.6446, lng: -117.8432,
      rooms: ['1300', '1425'],   // numerically sorted, bare strings
    })
  })

  it('returns 500 when the DB query errors', async () => {
    supabase.from.mockReturnValue(queryReturning({ data: null, error: { message: 'boom' } }))
    const res = await request(app).get('/api/buildings')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load buildings' })
  })

  // The silent-drift guard: an empty [] from Supabase (revoked RLS, wrong key,
  // empty table) must NOT be cached and served. validBuildings refuses it.
  it('returns 500 on an empty buildings list (silent-drift guard)', async () => {
    supabase.from.mockReturnValue(queryReturning({ data: [], error: null }))
    const res = await request(app).get('/api/buildings')
    expect(res.status).toBe(500)
  })

  // filter-then-validate: if every row is unusable (the HHCR-only case),
  // usableBuildings drops them all and validBuildings([]) still refuses.
  it('returns 500 when every row is skipped by usableBuildings', async () => {
    supabase.from.mockReturnValue(queryReturning({
      data: [{ id: 9, code: 'HHCR', name: 'Unknown', lat: null, lng: null, rooms: [{ room_number: '101' }] }],
      error: null,
    }))
    const res = await request(app).get('/api/buildings')
    expect(res.status).toBe(500)
  })

  // Cache: a second request within the TTL must not query Supabase again.
  it('serves the second request from cache (no second DB query)', async () => {
    stubHappyQueries()
    await request(app).get('/api/buildings')
    const callsAfterFirst = supabase.from.mock.calls.length
    await request(app).get('/api/buildings')
    expect(supabase.from.mock.calls.length).toBe(callsAfterFirst)
  })
})


// --- /api/schedule ----------------------------------------------------------

describe('GET /api/schedule', () => {
  it('returns 400 when building is missing', async () => {
    const res = await request(app).get('/api/schedule?year=2026&quarter=Fall')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/building, year and quarter are required/)
  })

  it('returns 400 when year is missing', async () => {
    const res = await request(app).get('/api/schedule?building=DBH&quarter=Fall')
    expect(res.status).toBe(400)
  })

  it('returns 400 when quarter is missing', async () => {
    const res = await request(app).get('/api/schedule?building=DBH&year=2026')
    expect(res.status).toBe(400)
  })

  it('returns 200 with the contract shape: bare array of { room, day, start_time, end_time, course }', async () => {
    stubHappyQueries()
    const res = await request(app).get('/api/schedule?building=DBH&year=2026&quarter=Fall')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toEqual({
      room: '1425', day: 'M',
      start_time: '11:00:00', end_time: '11:50:00',
      course: 'COMPSCI161',
    })
  })

  it('returns 500 when the DB query errors', async () => {
    supabase.from.mockReturnValue(queryReturning({ data: null, error: { message: 'boom' } }))
    const res = await request(app).get('/api/schedule?building=DBH&year=2026&quarter=Fall')
    expect(res.status).toBe(500)
  })
})


// --- /api/availability ------------------------------------------------------

describe('GET /api/availability', () => {
  it('returns 400 when any param is missing', async () => {
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/year, quarter, day and time are required/)
  })

  it('returns 400 for an unknown day token', async () => {
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=X&time=13:00')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/day must be one of/)
  })

  // toDayNumber('Su') === 0, and the guard rejects < 1 -- weekends aren't taught.
  it('returns 400 for a weekend day (Su -> 0, below the 1-5 range)', async () => {
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=Su&time=13:00')
    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed time', async () => {
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M&time=25:00')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/time must be HH:MM/)
  })

  it('returns 200 with the contract shape: [{ code, open }]', async () => {
    // /api/availability makes TWO queries: buildings (cached) + busy.
    // We configure both via the table name.
    supabase.from.mockImplementation((table) => {
      if (table === 'buildings') return queryReturning({ data: buildingsData, error: null })
      if (table === 'class_meetings') return queryReturning({ data: busyData, error: null })
      return queryReturning({ data: [], error: null })
    })

    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M&time=13:00')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { code: 'DBH', open: 1 },   // 2 rooms, 1 busy (1425) -> 1 open
      { code: 'SSL', open: 1 },   // 1 room, 0 busy -> 1 open
    ])
  })

  // The contract: buildings with zero open rooms are NOT dropped -- the sidebar
  // shows "None" at zero and dropping them would make buildings vanish.
  it('includes buildings with zero open rooms', async () => {
    // Make every DBH room busy: busy set has both 1300 and 1425.
    const allDbhBusy = [
      { rooms: { room_number: '1425', buildings: { code: 'DBH' } } },
      { rooms: { room_number: '1300', buildings: { code: 'DBH' } } },
    ]
    supabase.from.mockImplementation((table) => {
      if (table === 'buildings') return queryReturning({ data: buildingsData, error: null })
      if (table === 'class_meetings') return queryReturning({ data: allDbhBusy, error: null })
      return queryReturning({ data: [], error: null })
    })

    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M&time=13:00')
    expect(res.status).toBe(200)
    expect(res.body).toContainEqual({ code: 'DBH', open: 0 })
  })

  it('returns 500 when the buildings query errors', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'buildings') return queryReturning({ data: null, error: { message: 'boom' } })
      return queryReturning({ data: [], error: null })
    })
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M&time=13:00')
    expect(res.status).toBe(500)
  })

  it('returns 500 when the busy query errors', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'buildings') return queryReturning({ data: buildingsData, error: null })
      if (table === 'class_meetings') return queryReturning({ data: null, error: { message: 'boom' } })
      return queryReturning({ data: [], error: null })
    })
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M&time=13:00')
    expect(res.status).toBe(500)
  })

  // The 1000-row cap guard: truncated busy rows would count in-class rooms as
  // open, so the code throws rather than serving a plausible wrong number.
  it('returns 500 when the busy query hits the 1000-row PostgREST cap', async () => {
    const capped = Array.from({ length: 1000 }, () => busyData[0])
    supabase.from.mockImplementation((table) => {
      if (table === 'buildings') return queryReturning({ data: buildingsData, error: null })
      if (table === 'class_meetings') return queryReturning({ data: capped, error: null })
      return queryReturning({ data: [], error: null })
    })
    const res = await request(app).get('/api/availability?year=2026&quarter=Fall&day=M&time=13:00')
    expect(res.status).toBe(500)
  })
})
