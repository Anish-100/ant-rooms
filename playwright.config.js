import { defineConfig, devices } from '@playwright/test'

// E2E tests live at the repo root because they span both servers: the Express
// API (backend/) and the Vite app (frontend/). Two test suites:
//
//   e2e/api-contract.spec.js  -- blackbox HTTP tests against the running API.
//                                Catches the silent contract drift CLAUDE.md
//                                warns about (wrong term -> zero rows, lat vs
//                                latitude -> buildings at campus center, etc).
//                                These don't need a browser.
//
//   e2e/app.smoke.spec.js     -- browser smoke test. Boots the app, checks the
//                                sidebar loads, clicks a building, checks the
//                                detail panel. Needs both servers running.
//
// Both suites assume the backend is already running on :3001 and (for the
// smoke test) the frontend on :5173. Start them in separate terminals:
//   cd backend && npm run dev
//   cd frontend && npm run dev
// Then: npm run e2e

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,        // serial: both hit the same backend process
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                  // one worker -- shared backend cache, avoid races
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // We do NOT auto-start the servers here. The backend points at the cloud DB
  // (per CLAUDE.md), so `webServer` would need env vars and a real Supabase
  // key -- simpler to let you start them by hand and point E2E at them.
  // If a future local-DB smoke suite lands (see the open GitHub issue), this
  // can flip to auto-starting both with `webServer`.
})
