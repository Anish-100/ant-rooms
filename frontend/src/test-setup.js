// Makes jest-dom matchers (toBeInTheDocument, toHaveTextContent, etc.)
// available in every test file without importing them each time. Requires
// `globals: true` in vitest.config.js so jest-dom's expect.extend() finds
// the global expect.
import '@testing-library/jest-dom'
