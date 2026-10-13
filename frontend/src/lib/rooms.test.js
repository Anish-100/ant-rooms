import { describe, it, expect } from 'vitest'
import { splitRooms } from './rooms.js'

// splitRooms divides a building's rooms into open vs busy at one instant, with
// a computed note on each card. The notes are not decoration:
//   - busy  -> "until <this class's end>"
//   - open  -> "free till <next class's start>" or "free all day"
// roomNumbers comes from /api/buildings (the full universe), NOT from the
// meetings -- using meetings would drop rooms with no class this quarter and
// make the panel's "Open now" disagree with the sidebar's pill.

// Helper: a meeting already has start_min/end_min (post-withMinutes shape).
function m(room, day, start, end, course = 'X') {
  return { room, day, course, start_min: start, end_min: end }
}

describe('splitRooms', () => {
  it('marks a room busy when minute is within [start, end)', () => {
    const rooms = ['1425']
    const meetings = [m('1425', 'M', 660, 710)]   // 11:00-11:50
    const { open, busy } = splitRooms(rooms, meetings, 'M', 680)   // 11:20

    expect(open).toEqual([])
    expect(busy).toEqual([{ room: '1425', note: 'until 11:50 AM' }])
  })

  it('marks a room open when minute is before the class starts', () => {
    const rooms = ['1425']
    const meetings = [m('1425', 'M', 660, 710)]
    const { open, busy } = splitRooms(rooms, meetings, 'M', 600)   // 10:00

    expect(busy).toEqual([])
    expect(open).toEqual([{ room: '1425', note: 'free till 11:00 AM' }])
  })

  // The boundary: 11:50 is the END. The check is `minute < m.end_min`, so 11:50
  // is NOT busy -- the class has released the room at its end time.
  it('marks a room open at the exact end minute (boundary: minute < end_min)', () => {
    const rooms = ['1425']
    const meetings = [m('1425', 'M', 660, 710)]
    const { open, busy } = splitRooms(rooms, meetings, 'M', 710)   // 11:50 = end
    expect(busy).toEqual([])
    expect(open).toHaveLength(1)
  })

  it('marks a room open at the exact start minute (boundary: minute >= start_min is busy)', () => {
    const rooms = ['1425']
    const meetings = [m('1425', 'M', 660, 710)]
    const { open, busy } = splitRooms(rooms, meetings, 'M', 660)   // 11:00 = start
    expect(busy).toHaveLength(1)
    expect(open).toEqual([])
  })

  it('shows "free all day" for a room with no classes today', () => {
    const rooms = ['1425']
    const meetings = []
    const { open } = splitRooms(rooms, meetings, 'M', 780)
    expect(open[0].note).toBe('free all day')
  })

  it('shows "free all day" for a room whose only class is on another day', () => {
    const rooms = ['1425']
    const meetings = [m('1425', 'W', 660, 710)]
    const { open } = splitRooms(rooms, meetings, 'M', 780)
    expect(open[0].note).toBe('free all day')
  })

  it('shows "free till <next start>" for an open room with a later class today', () => {
    const rooms = ['1425']
    const meetings = [m('1425', 'M', 840, 890)]   // 14:00-14:50
    const { open } = splitRooms(rooms, meetings, 'M', 780)   // 13:00
    expect(open[0].note).toBe('free till 2:00 PM')
  })

  // Two rooms, one busy one open -- the case the detail panel renders side by side.
  it('splits a mixed building into one busy and one open room', () => {
    const rooms = ['1425', '1300']
    const meetings = [
      m('1425', 'M', 660, 710),   // busy at 11:20
      m('1300', 'M', 840, 890),   // open at 11:20, free till 14:00
    ]
    const { open, busy } = splitRooms(rooms, meetings, 'M', 680)
    expect(busy.map((r) => r.room)).toEqual(['1425'])
    expect(open.map((r) => r.room)).toEqual(['1300'])
    expect(open[0].note).toBe('free till 2:00 PM')
  })

  // The design intent from rooms.js: roomNumbers is the FULL universe from
  // /api/buildings. A room with NO meetings this quarter still appears as open.
  it('includes a room with zero meetings as open ("free all day")', () => {
    const rooms = ['9999']
    const meetings = [m('1425', 'M', 660, 710)]
    const { open } = splitRooms(rooms, meetings, 'M', 680)
    expect(open).toEqual([{ room: '9999', note: 'free all day' }])
  })
})
