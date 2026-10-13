import { describe, it, expect } from 'vitest'
import { usableBuildings, validBuildings, validCounts } from './validate.js'

// validate.js keeps two jobs apart (CLAUDE.md): usableBuildings SKIPS a bad row,
// validBuildings/validCounts REFUSE a bad read. Order is filter-then-validate,
// so "every row was skipped" still trips the fatal check. Validators return a
// problem STRING, not a boolean, so the log names the offending building.

describe('usableBuildings', () => {
  it('keeps a good row (has code, rooms array, finite lat/lng)', () => {
    const good = [
      { code: 'DBH', name: 'Donald Bren Hall', lat: 33.6, lng: -117.8, rooms: ['1425'] },
    ]
    const { kept, skipped } = usableBuildings(good)
    expect(kept).toHaveLength(1)
    expect(skipped).toEqual([])
  })

  it('skips a row with no code', () => {
    const { kept, skipped } = usableBuildings([
      { code: null, name: 'X', lat: 0, lng: 0, rooms: [] },
    ])
    expect(kept).toEqual([])
    expect(skipped[0].code).toBe('(no code)')
    expect(skipped[0].reason).toMatch(/building code/)
  })

  it('skips a row whose rooms is not an array', () => {
    const { kept, skipped } = usableBuildings([
      { code: 'X', name: 'X', lat: 0, lng: 0, rooms: null },
    ])
    expect(kept).toEqual([])
    expect(skipped[0].code).toBe('X')
    expect(skipped[0].reason).toMatch(/rooms array/)
  })

  // This is the HHCR case from CLAUDE.md: lat/lng are null in buildings.json,
  // so it can't be plotted on the map or counted. The validator drops it.
  it('skips a row with null lat or lng (the HHCR case)', () => {
    const { kept, skipped } = usableBuildings([
      { code: 'HHCR', name: 'Unknown', lat: null, lng: null, rooms: ['101'] },
    ])
    expect(kept).toEqual([])
    expect(skipped[0].code).toBe('HHCR')
    expect(skipped[0].reason).toMatch(/coordinates/)
  })

  it('skips a row with NaN lat (Number.isFinite is the right check)', () => {
    const { kept, skipped } = usableBuildings([
      { code: 'X', name: 'X', lat: NaN, lng: 0, rooms: [] },
    ])
    expect(kept).toEqual([])
    expect(skipped[0].reason).toMatch(/coordinates/)
  })

  it('keeps good rows and skips bad ones in the same list', () => {
    const list = [
      { code: 'DBH', name: 'Bren', lat: 33.6, lng: -117.8, rooms: ['1425'] },
      { code: 'HHCR', name: 'Unknown', lat: null, lng: null, rooms: ['101'] },
      { code: null, name: 'X', lat: 0, lng: 0, rooms: [] },
    ]
    const { kept, skipped } = usableBuildings(list)
    expect(kept).toHaveLength(1)
    expect(kept[0].code).toBe('DBH')
    expect(skipped).toHaveLength(2)
  })
})

describe('validBuildings', () => {
  // Returns null for "no problem" and a STRING describing the problem otherwise.
  // getCached throws on a non-null return, so a bad read never gets cached.

  it('returns null (OK) for a non-empty list with rooms', () => {
    const ok = [
      { code: 'DBH', rooms: ['1425', '1300'] },
      { code: 'SSL', rooms: ['100'] },
    ]
    expect(validBuildings(ok)).toBeNull()
  })

  it('returns a problem string for a non-array (defensive — Supabase bug)', () => {
    expect(validBuildings(null)).toMatch(/expected an array/)
    expect(validBuildings('DBH')).toMatch(/expected an array/)
  })

  // The silent-drift case: empty table, revoked RLS, wrong key all return [].
  // Without this check, [] gets cached for 10 minutes and the sidebar empties.
  it('returns a problem string for an empty array (the silent-drift case)', () => {
    expect(validBuildings([])).toMatch(/zero buildings/)
  })

  it('returns a problem string when every building has zero rooms', () => {
    expect(validBuildings([{ code: 'X', rooms: [] }])).toMatch(/no rooms/)
  })

  // filter-then-validate: if usableBuildings dropped every row, the remaining
  // [] still trips this check rather than being served as an empty sidebar.
  it('returns a problem string when all rows were skipped (empty after filter)', () => {
    expect(validBuildings([])).toMatch(/zero buildings/)
  })
})

describe('validCounts', () => {
  it('returns null (OK) for a valid availability list', () => {
    const ok = [
      { code: 'DBH', open: 2 },
      { code: 'SSL', open: 0 },     // zero is valid — sidebar shows "None"
    ]
    expect(validCounts(ok)).toBeNull()
  })

  it('returns a problem string for a non-array', () => {
    expect(validCounts(null)).toMatch(/expected an array/)
  })

  it('returns a problem string for an empty array (buildings would vanish)', () => {
    expect(validCounts([])).toMatch(/zero availability rows/)
  })

  it('returns a problem string for a row missing a code', () => {
    expect(validCounts([{ open: 3 }])).toMatch(/no code/)
    expect(validCounts([{ code: '', open: 3 }])).toMatch(/no code/)
  })

  it('returns a problem string for a non-integer open count', () => {
    expect(validCounts([{ code: 'DBH', open: 2.5 }])).toMatch(/non-count/)
    expect(validCounts([{ code: 'DBH', open: NaN }])).toMatch(/non-count/)
  })

  it('returns a problem string for a negative open count', () => {
    expect(validCounts([{ code: 'DBH', open: -1 }])).toMatch(/non-count/)
  })
})
