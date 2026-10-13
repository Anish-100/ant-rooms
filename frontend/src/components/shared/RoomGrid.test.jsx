import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RoomGrid from './RoomGrid.jsx'

// RoomGrid renders room cards in a grid. Open vs busy differ by fill AND text
// color (survives grayscale). The columns prop uses a literal-class lookup,
// NOT `grid-cols-${n}` -- Tailwind scans for literal strings, so an interpolated
// name is never generated and the grid silently collapses to one column.
// (See CLAUDE.md and redesign-plan.md M3.)

function room(room, note) {
  return { room, note }
}

describe('RoomGrid', () => {
  describe('empty state', () => {
    it('renders the empty message when rooms is empty', () => {
      render(
        <RoomGrid rooms={[]} variant="open" empty="No rooms open right now" onSelectRoom={() => {}} />,
      )
      expect(screen.getByText('No rooms open right now')).toBeInTheDocument()
    })
  })

  describe('rendering', () => {
    it('renders one card per room with the room number and note', () => {
      const rooms = [room('1425', 'free till 2:00 PM'), room('1300', 'free all day')]
      render(
        <RoomGrid rooms={rooms} variant="open" onSelectRoom={() => {}} />,
      )
      expect(screen.getByText('1425')).toBeInTheDocument()
      expect(screen.getByText('free till 2:00 PM')).toBeInTheDocument()
      expect(screen.getByText('1300')).toBeInTheDocument()
      expect(screen.getByText('free all day')).toBeInTheDocument()
    })

    it('calls onSelectRoom with the room number when a card is clicked', () => {
      const onSelectRoom = vi.fn()
      const rooms = [room('1425', 'free')]
      render(<RoomGrid rooms={rooms} variant="open" onSelectRoom={onSelectRoom} />)
      fireEvent.click(screen.getByText('1425'))
      expect(onSelectRoom).toHaveBeenCalledWith('1425')
    })
  })

  // The documented Tailwind trap: columns must be a literal class, not
  // interpolated. COLUMN_CLASS maps {2: "grid-cols-2", 3: "grid-cols-3"}.
  // This test locks down that the right literal class lands on the grid
  // container -- if someone refactors to `grid-cols-${columns}`, the class
  // string would still match here BUT Tailwind would not generate it at build
  // time. (The build catches the generation failure; this test catches a
  // wrong lookup.)
  describe('columns prop (the Tailwind literal-class trap)', () => {
    it('applies grid-cols-3 by default', () => {
      const rooms = [room('1', 'n'), room('2', 'n'), room('3', 'n')]
      const { container } = render(
        <RoomGrid rooms={rooms} variant="open" onSelectRoom={() => {}} />,
      )
      const grid = container.querySelector('.grid')
      expect(grid.className).toMatch(/grid-cols-3/)
      expect(grid.className).not.toMatch(/grid-cols-2/)
    })

    it('applies grid-cols-2 when columns={2} (mobile)', () => {
      const rooms = [room('1', 'n'), room('2', 'n')]
      const { container } = render(
        <RoomGrid rooms={rooms} variant="open" columns={2} onSelectRoom={() => {}} />,
      )
      const grid = container.querySelector('.grid')
      expect(grid.className).toMatch(/grid-cols-2/)
    })

    // Defensive: an unsupported columns value falls back to grid-cols-3 via
    // the `?? COLUMN_CLASS[3]` in the component. Locks the fallback.
    it('falls back to grid-cols-3 for an unsupported columns value', () => {
      const rooms = [room('1', 'n')]
      const { container } = render(
        <RoomGrid rooms={rooms} variant="open" columns={4} onSelectRoom={() => {}} />,
      )
      const grid = container.querySelector('.grid')
      expect(grid.className).toMatch(/grid-cols-3/)
    })
  })

  describe('selection ring', () => {
    // The selected room card gets a 2px accent ring -- from CLAUDE.md, this
    // exists because the week panel opens beside the detail panel and without
    // it there'd be nothing showing which room you picked.
    it('adds a ring to the selected room card', () => {
      const rooms = [room('1425', 'free'), room('1300', 'free')]
      const { container } = render(
        <RoomGrid rooms={rooms} variant="open" selectedRoom="1425" onSelectRoom={() => {}} />,
      )
      const cards = container.querySelectorAll('button')
      // The selected card has the ring class; the other doesn't.
      expect(cards[0].className).toMatch(/ring-2/)
      expect(cards[1].className).not.toMatch(/ring-2/)
    })
  })
})
