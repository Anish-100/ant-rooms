import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// jsdom because component tests (Phase 4) need a DOM. The lib/ unit tests in
// Phase 3 don't, but one config covers both. Co-located *.test.js(x) files.
// globals: true puts describe/it/expect on the global scope, which
// @testing-library/jest-dom needs (it calls expect.extend() at import time).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})
