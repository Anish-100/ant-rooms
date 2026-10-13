import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TimeEditor from './TimeEditor.jsx'

// TimeEditor is two controlled inputs (day select + time input) with no submit.
// Changing either fires the matching callback; the parent re-derives the whole
// sidebar on the next render. It is controlled -- it does not hold its own state.

describe('TimeEditor', () => {
  const baseProps = {
    day: 'M', time: '13:00',
    onDayChange: vi.fn(), onTimeChange: vi.fn(),
  }

  it('renders a Day field labeled with the current day value', () => {
    render(<TimeEditor {...baseProps} />)
    // The select's value is the day prop.
    const daySelect = screen.getByDisplayValue('Monday')
    expect(daySelect).toBeInTheDocument()
  })

  it('renders a Time field with the current time value', () => {
    render(<TimeEditor {...baseProps} />)
    const timeInput = screen.getByDisplayValue('13:00')
    expect(timeInput).toHaveAttribute('type', 'time')
  })

  it('lists all five weekdays as options (M-F)', () => {
    render(<TimeEditor {...baseProps} />)
    const daySelect = screen.getByDisplayValue('Monday')
    const options = Array.from(daySelect.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(['M', 'Tu', 'W', 'Th', 'F'])
  })

  it('uses full day names as the visible option text', () => {
    render(<TimeEditor {...baseProps} />)
    for (const full of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      expect(screen.getByText(full)).toBeInTheDocument()
    }
  })

  it('calls onDayChange with the new token when the select changes', () => {
    const onDayChange = vi.fn()
    render(<TimeEditor {...baseProps} onDayChange={onDayChange} />)
    fireEvent.change(screen.getByDisplayValue('Monday'), { target: { value: 'W' } })
    expect(onDayChange).toHaveBeenCalledWith('W')
  })

  it('calls onTimeChange with the new time when the input changes', () => {
    const onTimeChange = vi.fn()
    render(<TimeEditor {...baseProps} onTimeChange={onTimeChange} />)
    fireEvent.change(screen.getByDisplayValue('13:00'), { target: { value: '14:30' } })
    expect(onTimeChange).toHaveBeenCalledWith('14:30')
  })

  // Controlled input: the component does not update its own value. If the
  // parent doesn't re-render with the new value, the input stays put. This
  // test pins that contract -- changing the prop changes the display.
  it('reflects a new day when the parent re-renders with a different value', () => {
    const { rerender } = render(<TimeEditor {...baseProps} day="M" />)
    expect(screen.getByDisplayValue('Monday')).toBeInTheDocument()
    rerender(<TimeEditor {...baseProps} day="W" />)
    expect(screen.getByDisplayValue('Wednesday')).toBeInTheDocument()
  })

  it('reflects a new time when the parent re-renders with a different value', () => {
    const { rerender } = render(<TimeEditor {...baseProps} time="13:00" />)
    rerender(<TimeEditor {...baseProps} time="09:30" />)
    expect(screen.getByDisplayValue('09:30')).toBeInTheDocument()
  })
})
