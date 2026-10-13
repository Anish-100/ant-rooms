import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BuildingList from './BuildingList.jsx'

// BuildingList is presentational: it receives an already-filtered list and a
// code -> open-count Map, and renders. No fetching. Four states to cover:
// loading (skeleton), error (muted line), empty (with/without query), and
// the happy path with count pill variants and selection.

// A minimal building fixture. rooms aren't rendered by BuildingList, but the
// prop is part of the shape so we include it for realism.
function b(code, name, rooms = []) {
  return { code, name, rooms }
}

describe('BuildingList', () => {
  describe('loading state', () => {
    it('renders 8 skeleton rows when loading is true', () => {
      const { container } = render(
        <BuildingList buildings={[]} counts={new Map()} loading={true} />,
      )
      // SkeletonRows emits 8 divs with animate-pulse.
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons).toHaveLength(8)
    })

    it('does not render the error or empty message while loading', () => {
      render(<BuildingList buildings={[]} counts={new Map()} loading={true} />)
      expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument()
      expect(screen.queryByText(/No buildings/)).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('renders the muted error line when error is truthy', () => {
      render(<BuildingList buildings={[]} counts={new Map()} error={true} />)
      expect(screen.getByText(/Could not load buildings/)).toBeInTheDocument()
      // The CLAUDE.md "no amber banner" rule: the error is a muted line, not
      // a loud alert. The text mentions the API so the user can self-debug.
      expect(screen.getByText(/Is the API running/)).toBeInTheDocument()
    })

    it('takes priority over loading (error wins)', () => {
      render(
        <BuildingList buildings={[]} counts={new Map()} loading={true} error={true} />,
      )
      expect(screen.getByText(/Could not load/)).toBeInTheDocument()
      expect(screen.queryByText(/animate-pulse/)).toBeNull()
    })
  })

  describe('empty state', () => {
    it('shows the "no matches" message when hasQuery is true', () => {
      render(
        <BuildingList buildings={[]} counts={new Map()} hasQuery={true} />,
      )
      expect(screen.getByText(/No building or room matches/)).toBeInTheDocument()
      // The hint references the two search modes: code (DBH) and room (1300).
      expect(screen.getByText(/DBH/)).toBeInTheDocument()
      expect(screen.getByText(/1300/)).toBeInTheDocument()
    })

    it('shows the "no buildings yet" message when hasQuery is false', () => {
      render(<BuildingList buildings={[]} counts={new Map()} hasQuery={false} />)
      expect(screen.getByText(/No buildings in the schedule yet/)).toBeInTheDocument()
    })
  })

  describe('happy path', () => {
    it('renders one row per building with code and name', () => {
      const buildings = [b('DBH', 'Donald Bren Hall'), b('SSL', 'Science Library')]
      render(
        <BuildingList buildings={buildings} counts={new Map()} onSelect={() => {}} />,
      )
      expect(screen.getByText('DBH')).toBeInTheDocument()
      expect(screen.getByText('Donald Bren Hall')).toBeInTheDocument()
      expect(screen.getByText('SSL')).toBeInTheDocument()
      expect(screen.getByText('Science Library')).toBeInTheDocument()
    })

    it('calls onSelect with the building code when a row is clicked', () => {
      const onSelect = vi.fn()
      const buildings = [b('DBH', 'Donald Bren Hall')]
      render(
        <BuildingList buildings={buildings} counts={new Map()} onSelect={onSelect} />,
      )
      fireEvent.click(screen.getByText('DBH'))
      expect(onSelect).toHaveBeenCalledWith('DBH')
    })
  })

  // CountPill is where availability is signalled. CLAUDE.md: "zero is the word
  // None rather than a differently-colored number" -- availability is never
  // signalled by color alone. Three states:
  //   undefined -> "—"   (availability not yet arrived; the two endpoints
  //                        resolve independently)
  //   0         -> "None"
  //   positive  -> the numeral
  describe('CountPill variants', () => {
    it('shows "—" when the count is undefined (availability not yet loaded)', () => {
      const buildings = [b('DBH', 'Bren')]
      render(
        <BuildingList buildings={buildings} counts={new Map()} onSelect={() => {}} />,
      )
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('shows "None" when the count is 0', () => {
      const buildings = [b('DBH', 'Bren')]
      const counts = new Map([['DBH', 0]])
      render(
        <BuildingList buildings={buildings} counts={counts} onSelect={() => {}} />,
      )
      expect(screen.getByText('None')).toBeInTheDocument()
    })

    it('shows the numeral when the count is positive', () => {
      const buildings = [b('DBH', 'Bren')]
      const counts = new Map([['DBH', 2]])
      render(
        <BuildingList buildings={buildings} counts={counts} onSelect={() => {}} />,
      )
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.queryByText('None')).not.toBeInTheDocument()
      expect(screen.queryByText('—')).not.toBeInTheDocument()
    })
  })
})
