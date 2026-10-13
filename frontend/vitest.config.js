import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// jsdom because component tests need a DOM. The lib/ unit tests don't, but
// one config covers both. Co-located *.test.js(x) files.
// globals: true puts describe/it/expect on the global scope, which
// @testing-library/jest-dom needs (it calls expect.extend() at import time).
// esbuild.jsx: 'automatic' so JSX in test files compiles to _jsx() from
// react/jsx-runtime -- without it, esbuild uses the classic runtime that
// expects React in scope, and "React is not defined" fires on every < />.
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})
