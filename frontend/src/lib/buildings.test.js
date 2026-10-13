import { describe, it, expect } from 'vitest'
import { filterBuildings } from './buildings.js'

// filterBuildings is the sidebar search: case-insensitive substring match
// against the building code, the building name, and any room number in that
// building. The room-number half is why /api/buildings carries a `rooms` array
// -- without it, typing "1300" could not find DBH.

const BUILDINGS = [
  { code: 'DBH', name: 'Donald Bren Hall', rooms: ['1300', '1425'] },
  { code: 'SSL', name: 'Science Library', rooms: ['100'] },
  { code: 'ET', name: 'Engineering Tower', rooms: ['101', '102'] },
]

describe('filterBuildings', () => {
  it('returns the full list when the query is empty', () => {
    expect(filterBuildings(BUILDINGS, '')).toHaveLength(3)
  })

  it('returns the full list when the query is only whitespace', () => {
    expect(filterBuildings(BUILDINGS, '   ')).toHaveLength(3)
  })

  it('matches by building code (case-insensitive)', () => {
    const out = filterBuildings(BUILDINGS, 'dbh')
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('DBH')
  })

  it('matches by building name substring (case-insensitive)', () => {
    const out = filterBuildings(BUILDINGS, 'library')
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('SSL')
  })

  // The case CLAUDE.md calls out: typing "1300" finds DBH because rooms is
  // on the building. Without rooms, this would return nothing.
  it('matches by room number', () => {
    const out = filterBuildings(BUILDINGS, '1300')
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('DBH')
  })

  it('matches a substring of a room number ("13" hits 1300)', () => {
    const out = filterBuildings(BUILDINGS, '13')
    expect(out.map((b) => b.code)).toEqual(['DBH'])
  })

  it('matches multiple buildings when the query hits room numbers in several', () => {
    const out = filterBuildings(BUILDINGS, '10')
    // "1300" does NOT contain "10" (1 is followed by 3, not 0), so DBH is out.
    // SSL has "100", ET has "101"/"102" -- both contain "10".
    expect(out.map((b) => b.code).sort()).toEqual(['ET', 'SSL'])
  })

  it('returns no buildings when nothing matches', () => {
    expect(filterBuildings(BUILDINGS, 'zzz')).toEqual([])
  })

  it('trims the query before matching', () => {
    const out = filterBuildings(BUILDINGS, '  dbh  ')
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('DBH')
  })

  it('does not mutate the input array', () => {
    const snapshot = [...BUILDINGS]
    filterBuildings(BUILDINGS, 'dbh')
    expect(BUILDINGS).toEqual(snapshot)
  })

  // Defensive: a building missing `rooms` (shouldn't happen, but validate.js
  // drops those server-side -- still, don't crash if one slips through).
  it('does not throw when a building has no rooms field', () => {
    const buildings = [{ code: 'X', name: 'X' }]
    expect(() => filterBuildings(buildings, 'x')).not.toThrow()
    expect(filterBuildings(buildings, 'x')).toHaveLength(1)
  })
})
