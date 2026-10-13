import { test, expect } from '@playwright/test'

// Blackbox API contract tests. These exercise the running backend on :3001
// directly (no browser) and assert the JSON shape documented in CLAUDE.md's
// "API contract" block. They are the silent-drift catcher: every contract
// mismatch in this repo's history failed SILENTLY (wrong term -> zero rows,
// lat vs latitude -> campus center, bare array hit data.meetings || []), so
// an explicit shape assertion is the only thing that would have caught them.
//
// Backend must be running: `cd backend && npm run dev`
// These tests hit the CLOUD DB (per CLAUDE.md), so the numbers are real.
// If the cloud is unreachable, every test below fails -- that's correct,
// the app is down.

const API = 'http://localhost:3001'

// Known-good values from CLAUDE.md, verified 2026-09-08:
//   - 66 buildings served (HHCR skipped)
//   - DBH at M 13:00 has 2 open rooms (11 rooms - 9 busy)
const KNOWN = {
  buildingCount: 66,
  dbhCode: 'DBH',
  dbhOpenAtMon13: 2,
  term: { year: '2026', quarter: 'Fall' },
}

test.describe('GET /api/health', () => {
  test('returns 200 { status: "ok" }', async ({ request }) => {
    const res = await request.get(`${API}/api/health`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

test.describe('GET /api/buildings — contract shape', () => {
  test('returns 200 and a non-empty array', async ({ request }) => {
    const res = await request.get(`${API}/api/buildings`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  test('serves 66 buildings (HHCR is skipped per CLAUDE.md)', async ({ request }) => {
    const body = await (await request.get(`${API}/api/buildings`)).json()
    // Locks the documented count. If this goes to 67, HHCR came back without
    // coordinates; if it drops, something is filtering too aggressively.
    expect(body.length).toBe(KNOWN.buildingCount)
  })

  test('each building has the contract fields: id, code, name, lat, lng, rooms[]', async ({ request }) => {
    const body = await (await request.get(`${API}/api/buildings`)).json()
    for (const b of body) {
      expect(b).toMatchObject({
        code: expect.any(String),
        name: expect.any(String),
        lat: expect.any(Number),
        lng: expect.any(Number),
        rooms: expect.any(Array),
      })
      // rooms are bare strings (room numbers), not objects. The transform
      // flattens PostgREST's [{room_number}] to ["1300"]. If this regresses,
      // the frontend's search-by-room-number breaks silently.
      for (const r of b.rooms) {
        expect(typeof r).toBe('string')
      }
    }
  })

  test('DBH is present and has a non-empty rooms array', async ({ request }) => {
    const body = await (await request.get(`${API}/api/buildings`)).json()
    const dbh = body.find((b) => b.code === KNOWN.dbhCode)
    expect(dbh).toBeDefined()
    expect(dbh.rooms.length).toBeGreaterThan(0)
  })

  // The silent-drift case from CLAUDE.md: if lat/lng come back null, the map
  // plots the building at campus center (0,0 or a default). This assertion
  // would have caught the `lat` vs `latitude` aliasing bug.
  test('no building has null or NaN lat/lng (the silent-drift guard)', async ({ request }) => {
    const body = await (await request.get(`${API}/api/buildings`)).json()
    for (const b of body) {
      expect(Number.isFinite(b.lat)).toBe(true)
      expect(Number.isFinite(b.lng)).toBe(true)
    }
  })

  test('HHCR is NOT in the response (skipped for missing coordinates)', async ({ request }) => {
    const body = await (await request.get(`${API}/api/buildings`)).json()
    expect(body.find((b) => b.code === 'HHCR')).toBeUndefined()
  })
})

test.describe('GET /api/availability — contract shape', () => {
  const url = `${API}/api/availability?year=${KNOWN.term.year}&quarter=${KNOWN.term.quarter}&day=M&time=13:00`

  test('returns 200 and one row per building (including zeros)', async ({ request }) => {
    const res = await request.get(url)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    // Same count as /api/buildings -- dropping zeros would make buildings
    // vanish from the sidebar. This assertion locks "include zeros".
    expect(body.length).toBe(KNOWN.buildingCount)
  })

  test('each row is { code: string, open: non-negative integer }', async ({ request }) => {
    const body = await (await request.get(url)).json()
    for (const row of body) {
      expect(typeof row.code).toBe('string')
      expect(Number.isInteger(row.open)).toBe(true)
      expect(row.open).toBeGreaterThanOrEqual(0)
    }
  })

  // The cross-check from CLAUDE.md: DBH at M 13:00 = 2 open (11 rooms - 9 busy).
  // If this number changes, either the data changed or a query regressed.
  test('DBH at M 13:00 has 2 open rooms (the documented cross-check)', async ({ request }) => {
    const body = await (await request.get(url)).json()
    const dbh = body.find((r) => r.code === KNOWN.dbhCode)
    expect(dbh).toBeDefined()
    expect(dbh.open).toBe(KNOWN.dbhOpenAtMon13)
  })

  test('returns 400 when day is missing', async ({ request }) => {
    const res = await request.get(`${API}/api/availability?year=2026&quarter=Fall&time=13:00`)
    expect(res.status()).toBe(400)
  })

  test('returns 400 for an unknown day token', async ({ request }) => {
    const res = await request.get(`${API}/api/availability?year=2026&quarter=Fall&day=X&time=13:00`)
    expect(res.status()).toBe(400)
  })

  test('returns 400 for a malformed time', async ({ request }) => {
    const res = await request.get(`${API}/api/availability?year=2026&quarter=Fall&day=M&time=25:99`)
    expect(res.status()).toBe(400)
  })
})

test.describe('GET /api/schedule — contract shape', () => {
  const url = `${API}/api/schedule?building=${KNOWN.dbhCode}&year=${KNOWN.term.year}&quarter=${KNOWN.term.quarter}`

  test('returns 200 and a bare array (no envelope)', async ({ request }) => {
    const res = await request.get(url)
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Bare array, NOT { meetings: [...] }. An envelope would leave room for
    // metadata later; the contract chose the smaller frontend diff. If this
    // regresses to an envelope, the frontend's `withMinutes(json)` maps over
    // an object and every room silently reports empty.
    expect(Array.isArray(body)).toBe(true)
  })

  test('each meeting has { room, day, start_time, end_time, course }', async ({ request }) => {
    const body = await (await request.get(url)).json()
    expect(body.length).toBeGreaterThan(0)
    for (const m of body) {
      expect(m).toMatchObject({
        room: expect.any(String),
        day: expect.stringMatching(/^(M|Tu|W|Th|F)$/),
        start_time: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
        end_time: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
        course: expect.any(String),
      })
    }
  })

  // `term` is "Fall 2026" (quarter first). Querying "2026 Fall" matches zero
  // rows and looks like an empty building, not an error. CLAUDE.md documents
  // this exact bug. This test would have caught it.
  test('returns meetings for Fall 2026 (quarter-first term, not year-first)', async ({ request }) => {
    const body = await (await request.get(url)).json()
    expect(body.length).toBeGreaterThan(0)
  })

  test('returns 400 when building is missing', async ({ request }) => {
    const res = await request.get(`${API}/api/schedule?year=2026&quarter=Fall`)
    expect(res.status()).toBe(400)
  })

  test('returns 400 when year is missing', async ({ request }) => {
    const res = await request.get(`${API}/api/schedule?building=DBH&quarter=Fall`)
    expect(res.status()).toBe(400)
  })
})
