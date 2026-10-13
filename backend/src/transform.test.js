import { describe, it, expect } from 'vitest'
import { toMeeting, toBuilding, toDayNumber, toBusyKey } from './transform.js'

// transform.js is the SEAM between DB shapes and API shapes (see CLAUDE.md).
// These are pure functions — no DB, no network — so they're the easiest unit
// tests in the repo and the best place to learn Vitest.

describe('toMeeting', () => {
  // One row straight from the PostgREST embed in /api/schedule:
  //   course_title, day_of_week (int), start_time, end_time,
  //   rooms!inner(room_number, buildings!inner(code))
  it('reshapes a DB row into the API contract: { room, day, start_time, end_time, course }', () => {
    const dbRow = {
      course_title: 'COMPSCI161',
      day_of_week: 1,            // 1 = Monday (the M→1 numbering read_json.js writes)
      start_time: '11:00:00',
      end_time: '11:50:00',
      rooms: {
        room_number: '1425',
        buildings: { code: 'DBH' },
      },
    }

    const meeting = toMeeting(dbRow)

    expect(meeting).toEqual({
      room: '1425',
      day: 'M',                  // int 1 -> token "M" via DAY_TOKENS
      start_time: '11:00:00',
      end_time: '11:50:00',
      course: 'COMPSCI161',      // renamed from course_title -> course
    })
  })

  it('maps every weekday number to its token (1=M ... 5=F)', () => {
    for (const [num, token] of [[1,'M'],[2,'Tu'],[3,'W'],[4,'Th'],[5,'F']]) {
      const row = {
        course_title: 'X', day_of_week: num,
        start_time: '00:00:00', end_time: '00:00:00',
        rooms: { room_number: '1', buildings: { code: 'X' } },
      }
      expect(toMeeting(row).day).toBe(token)
    }
  })
})

describe('toBuilding', () => {
  // PostgREST nests rooms as [{ room_number: "1300" }, ...]. The API contract
  // says bare strings, numerically sorted. This is what toBuilding does.
  it('flattens nested room objects to bare strings, numerically sorted', () => {
    const dbRow = {
      id: 1, code: 'DBH', name: 'Donald Bren Hall',
      lat: 33.6446, lng: -117.8432,
      rooms: [
        { room_number: '1425' },
        { room_number: '1100' },
        { room_number: '1300' },
        { room_number: '1200' },
      ],
    }

    const building = toBuilding(dbRow)

    expect(building.rooms).toEqual(['1100', '1200', '1300', '1425'])
    // numeric sort, not lexicographic: "1100" < "1200" < "1300" < "1425"
    // (a plain .sort() would put "1100" < "1200" < "1300" < "1425" here too,
    //  but "100" vs "99" is the case where localeCompare numeric wins.)
  })

  it('passes through the other fields untouched (id, code, name, lat, lng)', () => {
    const building = toBuilding({
      id: 7, code: 'DBH', name: 'Donald Bren Hall',
      lat: 33.6, lng: -117.8, rooms: [],
    })
    expect(building).toMatchObject({ id: 7, code: 'DBH', name: 'Donald Bren Hall', lat: 33.6, lng: -117.8 })
  })

  it('handles a building with no rooms key (defaults to [])', () => {
    const building = toBuilding({ id: 1, code: 'X', name: 'X', lat: 0, lng: 0 })
    expect(building.rooms).toEqual([])
  })

  // Numeric sort, not lexicographic: a plain .sort() on strings puts "100"
  // before "99" because "1" < "9". localeCompare({numeric: true}) sorts them
  // as numbers, so 99 comes first.
  it('sorts room numbers numerically, not as strings ("99" before "100")', () => {
    const building = toBuilding({
      id: 1, code: 'X', name: 'X', lat: 0, lng: 0,
      rooms: [{ room_number: '100' }, { room_number: '99' }],
    })
    expect(building.rooms).toEqual(['99', '100'])   // 99 < 100 numerically
  })
})

describe('toDayNumber', () => {
  // The inverse of DAY_TOKENS, derived from it (see transform.js). The API
  // receives "M".."F" from the browser and needs the int the DB stores.
  it('returns the int for each weekday token', () => {
    expect(toDayNumber('M')).toBe(1)
    expect(toDayNumber('Tu')).toBe(2)
    expect(toDayNumber('W')).toBe(3)
    expect(toDayNumber('Th')).toBe(4)
    expect(toDayNumber('F')).toBe(5)
  })

  it('returns undefined for an unknown token (so the route can 400)', () => {
    expect(toDayNumber('X')).toBeUndefined()
    expect(toDayNumber('')).toBeUndefined()
  })
})

describe('toBusyKey', () => {
  // A busy row from /api/availability's second query. The key is "CODE:room"
  // because that's exactly how /api/buildings reports rooms — the two sides
  // compare without any id lookup.
  it('builds a "CODE:room" key from a busy class_meetings row', () => {
    const busyRow = {
      rooms: { room_number: '1425', buildings: { code: 'DBH' } },
    }
    expect(toBusyKey(busyRow)).toBe('DBH:1425')
  })
})
