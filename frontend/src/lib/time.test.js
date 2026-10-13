import { describe, it, expect } from 'vitest'
import {
  DAYS, START_HOUR, END_HOUR, HOUR_PX,
  toMinutes, label12, withMinutes,
  fullDayName, formatNow,
} from './time.js'

// time.js is the day/time vocabulary shared across the app, and the home of
// withMinutes() -- the ONE boundary conversion that stops "HH:MM:SS" strings
// from reaching numeric comparisons and silently turning every room empty.

describe('constants', () => {
  it('DAYS has the five weekdays with token/label/full', () => {
    expect(DAYS).toHaveLength(5)
    expect(DAYS.map((d) => d.token)).toEqual(['M', 'Tu', 'W', 'Th', 'F'])
    expect(DAYS[0]).toEqual({ token: 'M', label: 'Mon', full: 'Monday' })
  })

  it('week-grid geometry: 8-20, 44px/hr -> 528px column', () => {
    expect(START_HOUR).toBe(8)
    expect(END_HOUR).toBe(20)
    expect(HOUR_PX).toBe(44)
    expect((END_HOUR - START_HOUR) * HOUR_PX).toBe(528)
  })
})

describe('toMinutes', () => {
  it('"13:00" -> 780', () => expect(toMinutes('13:00')).toBe(780))
  it('"00:00" -> 0 (midnight)', () => expect(toMinutes('00:00')).toBe(0))
  it('"23:59" -> 1439 (one minute before midnight)', () => expect(toMinutes('23:59')).toBe(1439))
  it('"09:05" -> 545', () => expect(toMinutes('09:05')).toBe(545))
  it('ignores seconds: "13:00:00" -> 780', () => expect(toMinutes('13:00:00')).toBe(780))
  it('"11:50:30" -> 710 (seconds dropped, not rounded)', () => {
    expect(toMinutes('11:50:30')).toBe(710)
  })
})

describe('label12', () => {
  it('780 -> "1:00 PM"', () => expect(label12(780)).toBe('1:00 PM'))
  it('0 -> "12:00 AM" (midnight, 12-hour wrap)', () => expect(label12(0)).toBe('12:00 AM'))
  it('720 -> "12:00 PM" (noon, 12-hour wrap)', () => expect(label12(720)).toBe('12:00 PM'))
  it('480 -> "8:00 AM"', () => expect(label12(480)).toBe('8:00 AM'))
  it('935 -> "3:35 PM" (minute padding)', () => expect(label12(935)).toBe('3:35 PM'))
  it('481 -> "8:01 AM" (leading zero on minutes)', () => expect(label12(481)).toBe('8:01 AM'))
})

describe('withMinutes', () => {
  // The boundary conversion: API rows arrive as {start_time, end_time} strings.
  // withMinutes adds start_min/end_min numerics so downstream comparisons are
  // numeric. A raw string reaching `min >= m.start_min` coerces to NaN, every
  // comparison goes false, every room reports empty. This repo has been bitten.
  it('adds start_min and end_min to each row, keeping original fields', () => {
    const rows = [{ room: '1425', day: 'M', start_time: '11:00:00', end_time: '11:50:00', course: 'CS161' }]
    const out = withMinutes(rows)
    expect(out[0]).toEqual({
      room: '1425', day: 'M',
      start_time: '11:00:00', end_time: '11:50:00',
      course: 'CS161',
      start_min: 660, end_min: 710,
    })
  })

  it('converts multiple rows', () => {
    const rows = [
      { start_time: '13:00:00', end_time: '13:50:00' },
      { start_time: '14:00:00', end_time: '14:50:00' },
    ]
    expect(withMinutes(rows).map((r) => [r.start_min, r.end_min])).toEqual([
      [780, 830], [840, 890],
    ])
  })

  it('does not mutate the input rows', () => {
    const rows = [{ start_time: '13:00:00', end_time: '13:50:00' }]
    withMinutes(rows)
    expect(rows[0].start_min).toBeUndefined()
  })
})

describe('fullDayName', () => {
  it('"M" -> "Monday"', () => expect(fullDayName('M')).toBe('Monday'))
  it('"Tu" -> "Tuesday"', () => expect(fullDayName('Tu')).toBe('Tuesday'))
  it('"F" -> "Friday"', () => expect(fullDayName('F')).toBe('Friday'))
  // Defensive: an unknown token falls back to Monday (DAYS[0]), not undefined.
  it('"X" -> "Monday" (fallback to first day on unknown token)', () => {
    expect(fullDayName('X')).toBe('Monday')
  })
})

describe('formatNow', () => {
  it('"M", "13:00" -> "Monday, 1:00 PM"', () => {
    expect(formatNow('M', '13:00')).toBe('Monday, 1:00 PM')
  })
  it('"Tu", "09:30" -> "Tuesday, 9:30 AM"', () => {
    expect(formatNow('Tu', '09:30')).toBe('Tuesday, 9:30 AM')
  })
})
