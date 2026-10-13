import { defineConfig } from 'vitest/config'

// Node environment — these tests run in a server process, not a browser.
// Co-located: every *.test.js next to the file it tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
