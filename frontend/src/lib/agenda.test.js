import { describe, it, expect } from 'vitest'
import { buildAgenda } from './agenda.js'

// buildAgenda turns one room's meetings for one day into an ordered list of
// rows, with the GAPS spelled out as "free" rows rather than left as empty
// space. CLAUDE.md calls out six cases to cover; this file hits all of them.

// Helper: meetings already carry start_min/end_min (the shape withMinutes
// produces). buildAgenda reads start_min/end_min, not start_time/end_time.
function m(room, day, start, end, course = 'X') {
  return { room, day, course, start_min: start, end_min: end }
}

describe('buildAgenda', () => {
  it('returns a single "Free all day" row when the room has no meetings', () => {
    const rows = buildAgenda([], '1425', 'M')
    expect(rows).toEqual([
      { kind: 'free', start_min: 480, end_min: 1200, label: 'Free all day' },
    ])
  })

  it('returns a single "Free all day" row when the room has meetings on OTHER days', () => {
    // The filter on (room, day) excludes these; cursor never advances.
    const rows = buildAgenda([m('1425', 'W', 600, 660)], '1425', 'M')
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Free all day')
  })

  it('returns a single "Free all day" row when the room has meetings in OTHER rooms', () => {
    const rows = buildAgenda([m('1300', 'M', 600, 660)], '1425', 'M')
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Free all day')
  })

  // The basic shape: one morning class, then free for the rest of the day.
  it('emits a leading free row, the class, then a trailing free row', () => {
    const rows = buildAgenda([m('1425', 'M', 660, 710)], '1425', 'M')
    expect(rows).toEqual([
      { kind: 'free', start_min: 480, end_min: 660, label: 'Free until 11:00 AM' },
      { kind: 'class', start_min: 660, end_min: 710, course: 'X' },
      { kind: 'free', start_min: 710, end_min: 1200, label: 'Free for the rest of the day' },
    ])
  })

  // Back-to-back classes: the second class starts exactly when the first ends,
  // so there is no zero-length gap row BETWEEN them. (There is still a leading
  // free row from 8am to the first class, and a trailing one after.)
  it('emits no gap row between back-to-back classes (no zero-length free)', () => {
    const rows = buildAgenda([
      m('1425', 'M', 660, 710),
      m('1425', 'M', 710, 770),
    ], '1425', 'M')
    expect(rows.map((r) => r.kind)).toEqual(['free', 'class', 'class', 'free'])
    // The two classes are adjacent -- no free row between them.
    expect(rows[1]).toMatchObject({ kind: 'class', start_min: 660, end_min: 710 })
    expect(rows[2]).toMatchObject({ kind: 'class', start_min: 710, end_min: 770 })
  })

  // The double-booked-room case from CLAUDE.md: a registrar row whose end is
  // <= cursor is skipped via Math.max(cursor, end_min), preventing a negative-
  // length gap. (Leading free from 8am to 11am is still emitted.)
  it('skips an overlapping (double-booked) class without producing a negative gap', () => {
    const rows = buildAgenda([
      m('1425', 'M', 660, 770),   // 11:00-12:50
      m('1425', 'M', 660, 710),   // 11:00-11:50, fully inside the first -> skipped
    ], '1425', 'M')
    expect(rows.map((r) => r.kind)).toEqual(['free', 'class', 'free'])
    expect(rows[1]).toMatchObject({ kind: 'class', start_min: 660, end_min: 770 })
    // Trailing free starts at 770, not 710 -- the skip worked.
    expect(rows[2]).toMatchObject({ kind: 'free', start_min: 770 })
  })

  // A class running to 20:00 (END_HOUR*60 = 1200) leaves no trailing free row,
  // because cursor === DAY_END.
  it('emits no trailing free row when a class runs to 20:00', () => {
    const rows = buildAgenda([
      m('1425', 'M', 1140, 1200),   // 19:00-20:00
    ], '1425', 'M')
    expect(rows.map((r) => r.kind)).toEqual(['free', 'class'])
    // No third row.
    expect(rows).toHaveLength(2)
  })

  it('sorts unsorted input meetings by start_min before walking the cursor', () => {
    const rows = buildAgenda([
      m('1425', 'M', 840, 890),   // 14:00
      m('1425', 'M', 660, 710),   // 11:00
    ], '1425', 'M')
    // free(480) -> class(660) -> free(710) -> class(840) -> free(890)
    expect(rows.map((r) => r.start_min)).toEqual([480, 660, 710, 840, 890])
  })
})
