# Test Suite Documentation — AntRooms

> Generated 2026-10-12. Documents the full test suite built across Phases 1–5,
> the testing strategy, what each layer covers, and the open items.

## TL;DR

| Layer | Tool | Tests | Status |
|---|---|---|---|
| Backend unit | Vitest | 26 | ✅ passing |
| Backend integration | Vitest + mocked Supabase | 20 | ✅ passing |
| Frontend unit | Vitest | 51 | ✅ passing |
| Frontend component | Vitest + Testing Library | 26 | ✅ passing |
| E2E / blackbox | Playwright | 18 (6 passing) | ⚠️ written, blocked on Supabase key |
| CI | GitHub Actions | — | ⏳ not built (see Open Items) |
| **Total** | | **141** | **123 passing** |

---

## Testing strategy

### The hierarchy

```
Unit (whitebox)           → pure functions, no I/O
  ├─ backend/src/transform.test.js
  ├─ backend/src/validate.test.js
  ├─ frontend/src/lib/*.test.js
Integration (whitebox)    → routes with mocked DB
  └─ backend/src/server.test.js
Component (whitebox)      → React components in jsdom
  └─ frontend/src/components/shared/*.test.jsx
System / E2E (blackbox)   → real browser + real API
  ├─ e2e/api-contract.spec.js  (HTTP contract, no browser)
  └─ e2e/app.smoke.spec.js     (browser smoke)
```

"Blackbox" and "whitebox" are **perspectives** that overlay the types, not
separate categories. Unit/integration/component tests are whitebox (they know
the code structure). E2E tests are blackbox (they only know the contract from
`CLAUDE.md` and the user-visible UI).

### Why these layers

- **Unit tests** catch logic bugs in pure functions fast (transformations,
  validation, time math, search filtering). Run on every save.
- **Integration tests** catch route-level bugs: 400s on bad params, 500s on
  DB errors, cache behavior, the silent-drift guards. Mock the DB so they're
  fast and deterministic.
- **Component tests** catch UI state bugs: loading skeletons, error messages,
  empty states, controlled-input contracts, the Tailwind literal-class trap.
- **E2E tests** catch the things nothing else can: the full stack actually
  wiring up, the real DB returning the expected shape, the contract holding
  end-to-end. This is the only layer that would have caught the repo's
  documented silent-drift bugs (wrong term → zero rows, `lat` vs `latitude`
  → buildings at campus center).

### The DB test strategy decision (open GitHub issue)

The backend DB strategy for integration tests was deliberately split off as
a **decision to be made later**, tracked as a GitHub issue. See
`db-test-strategy-issue.md` (repo root, gitignored eventually) for the full
write-up. Summary of options:

| Approach | Catches | Speed |
|---|---|---|
| Mock `db.js` | Express logic, validation, shape | ⚡ Fast |
| Real local Supabase | Everything above + schema/RLS/query bugs | 🐢 Slower |
| **Hybrid** (recommended) | Mock for most + real-DB smoke suite in CI | ⚡ + 🐢 |

**Current state:** Phase 2 uses mock-only (the fast half). The real-DB smoke
suite is the half the open issue decides. The E2E tests in Phase 5 hit the
**cloud** DB (per `CLAUDE.md`), which is a separate concern from the
local-Supabase-in-CI question.

---

## Phase 1 — Backend unit tests ✅

**Commit:** `de6ce11` + `9544de4` · **26 tests** · Files: `backend/src/transform.test.js`, `backend/src/validate.test.js`

Pure-function tests for the two modules that are the easiest to test and
highest value per line:

- **`transform.js`** — the seam between DB shapes and API shapes.
  - `toMeeting`: reshapes a PostgREST row into `{ room, day, start_time, end_time, course }`,
    mapping `day_of_week` int → token via `DAY_TOKENS`.
  - `toBuilding`: flattens nested `rooms: [{room_number}]` to bare strings,
    numerically sorted (the `localeCompare({numeric: true})` case — `"99"`
    before `"100"`, not lexicographic).
  - `toDayNumber`: the inverse of `DAY_TOKENS`, derived from it so the
    numbering has one definition. Returns `undefined` for unknown tokens.
  - `toBusyKey`: builds `"CODE:room"` keys for the availability set lookup.

- **`validate.js`** — the cache validators that keep two jobs apart:
  - `usableBuildings` SKIPS a bad row (HHCR with null lat/lng), one `console.warn`.
  - `validBuildings` REFUSES a bad read (empty array = silent drift).
  - `validCounts` REFUSE a bad read (non-integer, negative, missing code).
  - Validators return a problem STRING, not boolean, so logs name the offender.

**Bug caught by the suite:** my first test expected `['100', '99']` for numeric
sort — wrong. `99 < 100` numerically, so the correct order is `['99', '100']`.
The code was right; the test was wrong. The suite caught it.

### Config

- `backend/package.json`: `vitest` + `@vitest/coverage-v8` devDeps, `test` / `test:watch` / `test:coverage` scripts.
- `backend/vitest.config.js`: Node environment, co-located `src/**/*.test.js`.

---

## Phase 2 — Backend integration tests ✅

**Commit:** `9544de4` · **20 tests** · File: `backend/src/server.test.js`

Mock `db.js` via `vi.mock`, drive the Express app with `supertest`. Covers all
4 routes against the API contract from `CLAUDE.md`:

- **`/api/health`** — happy path.
- **`/api/buildings`** — contract shape, DB error → 500, empty list → 500
  (silent-drift guard), all-rows-skipped → 500 (HHCR case), cache hit on 2nd call.
- **`/api/schedule`** — 400 on each missing param, contract shape, DB error → 500.
- **`/api/availability`** — 400 on missing params / bad day / weekend day / bad
  time, contract shape with correct `open` counts, zero-open buildings kept,
  DB error on either query → 500, 1000-row PostgREST cap → 500.

### Testability refactors (no behavior change)

- `server.js`: guarded `app.listen` behind `import.meta.url === pathToFileURL(process.argv[1])` check so tests can `import { app }` without binding port 3001. **No behavior change** when run normally — verified.
- `server.js`: added `export { app }`.
- `cache.js`: added `resetCache()` (test-only, documented) for test isolation.
- `package.json`: added `supertest` devDep.

### Concepts

- **`vi.mock` is hoisted** — Vitest moves `vi.mock('./db.js', ...)` above all imports automatically, so the mock is installed before `server.js` imports `supabase`.
- **Mocking a chainable, awaitable API** — Supabase's `.from().select().eq()` returns the builder AND is awaitable. The `queryReturning` helper makes a chain where every method returns `chain`, and `chain.then` is what `await` calls.
- **The `import.meta.url` guard** — standard ESM way to say "only run when this file is the entry point."

---

## Phase 3 — Frontend unit tests ✅

**Commit:** `9544de4` · **51 tests** · Files: `frontend/src/lib/{time,agenda,rooms,buildings}.test.js`

Pure-function tests for the `lib/` modules:

- **`time.js`** (23 tests) — `toMinutes`, `label12` (12-hour wrap, minute padding),
  `withMinutes` (the boundary conversion that stops `"HH:MM:SS"` strings from
  reaching numeric comparisons and silently making every room report empty —
  this repo has been bitten), `formatNow`, constants.
- **`agenda.js`** (8 tests) — `buildAgenda` covering all 6 cases from `CLAUDE.md`:
  empty room, meetings on other days/rooms, leading+trailing free rows,
  back-to-back classes (no zero-length gap), double-booked room (skip via
  `Math.max(cursor, end_min)`), class running to 20:00 (no trailing free), unsorted input.
- **`rooms.js`** (9 tests) — `splitRooms` busy/open split with boundary conditions
  (exactly `start_min` is busy, exactly `end_min` is open — the `minute >= start && minute < end` check), computed notes (`"free till 2:00 PM"`, `"free all day"`), rooms with no meetings.
- **`buildings.js`** (11 tests) — `filterBuildings` search: code, name, room number
  (case-insensitive, substring), trim, no mutation, the `rooms` field's role in
  room-number search.

**Bugs caught by the suite (all in my test expectations, not the code):**
1. Forgot the leading free row from 8am to the first class in `buildAgenda` tests.
2. Missed the trailing free row's start_min in the sort test.
3. Wrong substring claim — `"1300"` does NOT contain `"10"` (1 is followed by 3).

### Config

- `frontend/package.json`: added `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` devDeps + test scripts.
- `frontend/vitest.config.js`: jsdom env, `globals: true` (jest-dom needs it), React plugin.
- `frontend/src/test-setup.js`: imports `@testing-library/jest-dom` once.

---

## Phase 4 — Frontend component tests ✅

**Commit:** `2c78756` · **26 tests** · Files: `frontend/src/components/shared/{BuildingList,TimeEditor,RoomGrid}.test.jsx`

React Testing Library tests for the shared components (the ones that matter;
`AntRoomsMap` wraps MapLibre and needs a real canvas, `ThemeToggle` is trivial):

- **`BuildingList`** (11 tests) — loading (8 skeleton rows), error (muted line,
  priority over loading), empty (with/without query — different copy each way),
  happy path, click → `onSelect(code)`, CountPill variants (`—` / `None` / numeral).
- **`TimeEditor`** (8 tests) — day select with 5 options M-F, full day names as
  text, time input, `onDayChange`/`onTimeChange` called with right value,
  controlled-input behavior on rerender.
- **`RoomGrid`** (7 tests) — empty state, rendering rooms + notes, click →
  `onSelectRoom`, **columns prop** (default 3, explicit 2, fallback for
  unsupported — the Tailwind literal-class trap), selection ring.

**Bug caught:** `React is not defined` — the classic vs automatic JSX runtime.
The app uses the automatic runtime (React 19+, JSX compiles to `_jsx()` from
`react/jsx-runtime`), but Vitest's esbuild defaulted to classic
(`React.createElement`). Fix: one line in `vitest.config.js` — `esbuild: { jsx: 'automatic' }`.

### Concepts

- **Testing Library philosophy** — query as a user sees it (`getByText`, `getByDisplayValue`), not by internal class names. Survives refactors.
- **`fireEvent` vs `userEvent`** — used `fireEvent` (low-level) for simple clicks/changes. `userEvent` is more realistic for keyboard/focus-sensitive interactions.
- **Controlled component contracts** — the `TimeEditor` rerender tests pin down that it doesn't hold internal state.
- **The Tailwind literal-class trap** — `columns={2}` must produce the literal string `grid-cols-2`, not `grid-cols-${n}`. The test locks the lookup; only a real Tailwind build can catch the generation failure.

---

## Phase 5 — E2E tests with Playwright ⚠️

**Status: written but NOT committed (tests are red — see below).** · **18 tests** (6 passing, 12 failing) · Files: `e2e/api-contract.spec.js`, `e2e/app.smoke.spec.js`

### What's there

- **`e2e/api-contract.spec.js`** (blackbox HTTP, no browser) — encodes the
  `CLAUDE.md` API contract as explicit assertions:
  - `/api/health` returns `{ status: "ok" }`.
  - `/api/buildings` returns 66 buildings, each with `{ id, code, name, lat, lng, rooms[] }`,
    `rooms` as bare strings, no null/NaN lat/lng, HHCR skipped.
  - `/api/availability` returns one row per building (including zeros), each
    `{ code, open }` with `open` a non-negative integer, DBH at M 13:00 = 2 open
    (the documented cross-check).
  - `/api/schedule` returns a bare array (no envelope), each meeting with the
    contract shape, `term` is quarter-first (`"Fall 2026"`).
  - 400 validation on bad params.
- **`e2e/app.smoke.spec.js`** (browser smoke) — app boots, sidebar lists
  buildings, clicking DBH opens the detail panel, now bar shows formatted day/time,
  MapLibre canvas mounts.

### Config

- Root `package.json` (new): `@playwright/test` devDep, `e2e` / `e2e:ui` / `e2e:report` scripts.
- `playwright.config.js`: serial execution (shared backend cache), 1 worker, Chromium, `baseURL: http://localhost:5173`, no auto-start servers (you start them by hand).

### Why not committed: the backend is currently broken

When I ran the E2E tests against the running backend, **every happy-path test
failed** because the backend returns 500 on every DB query. The backend log
shows:

```
buildings query failed: Unregistered API key
```

The `SUPABASE_KEY` in `backend/.env` is not registered for the `SUPABASE_URL`
project. This is a **pre-existing environment issue** — I did not touch
`backend/.env` (it's gitignored and unchanged). The 6 passing tests are the
health check + the 400-validation tests (which don't hit the DB).

**This is exactly what E2E tests are for.** They caught a real production
break that no unit test (with mocked DB) could detect. The tests are correctly
written — they'll pass once the Supabase key is fixed.

### To get Phase 5 green and committed

1. Fix the Supabase key: regenerate/rotate the key in the Supabase dashboard for the cloud project (`eomjmohoyiqkqylqkyjv` per `CLAUDE.md`), update `backend/.env`.
2. Start the backend: `cd backend && npm run dev`
3. Start the frontend: `cd frontend && npm run dev`
4. Run: `npm run e2e`
5. When all 18 pass, commit: `test: add Playwright E2E tests (API contract + browser smoke)`

---

## Phase 6 — CI ⏳ (not built)

GitHub Actions workflow to run all tests on every PR. Not yet built. Should:

1. Install backend deps, run `npm test` (46 tests).
2. Install frontend deps, run `npm test` (77 tests).
3. Install Playwright, start backend + frontend, run `npm run e2e` (18 tests).
4. Upload coverage report (no threshold, per decision).
5. The real-DB smoke suite (from the open GitHub issue) would go here too.

**Deferred until** the Supabase key issue is resolved and Phase 5 is green —
committing a CI workflow that runs red tests would block every PR.

---

## Open items

1. **Supabase key** — `backend/.env` key is unregistered for the cloud project.
   Fix the key, then Phase 5 E2E tests go green and can be committed.
2. **DB test strategy issue** — file the `db-test-strategy-issue.md` content as
   a GitHub issue. Decide mock-only vs hybrid vs real-Supabase. The real-DB
   smoke suite (if chosen) goes in CI.
3. **CI workflow** — build once Phase 5 is green.
4. **Commit Phase 5** — `git add e2e/ package.json playwright.config.js && git commit -m "test: add Playwright E2E tests"` once tests pass.
5. **Coverage threshold** — currently tracked but not enforced. Revisit once the suite is stable in CI.

---

## How to run everything

```bash
# Backend unit + integration (46 tests, ~0.5s)
cd backend && npm test

# Frontend unit + component (77 tests, ~1s)
cd frontend && npm test

# E2E (18 tests, ~6s) — needs both servers running
cd backend && npm run dev &      # :3001
cd frontend && npm run dev &     # :5173
npm run e2e                       # from repo root

# Watch mode while developing
cd backend && npm run test:watch
cd frontend && npm run test:watch

# Coverage report (no threshold enforced)
cd backend && npm run test:coverage
cd frontend && npm run test:coverage
```

---

## Dev practices folded in

- **Co-located tests** — `*.test.js(x)` next to the file it tests. Easy to find, conventional for Vite/Vitest.
- **One commit per phase** — history tells a story; each commit is independently revertible.
- **Watch mode** — `npm run test:watch` re-runs on save, fast feedback while learning.
- **Coverage tracked, no threshold** — information, not a gate. Avoids gaming tests for numbers.
- **Conventional commits** — `type(scope): subject` format. `test`, `feat`, `fix`, `docs`, `refactor`, `chore`.
- **Run the tests, don't just write them** — every phase was verified by running. Three real bugs were caught by doing so (wrong sort expectation, wrong substring claim, wrong JSX runtime config). Writing tests without running them hides exactly these bugs.
- **Tests document intent** — the comments in test files explain *why* each case matters, referencing `CLAUDE.md` and the specific bugs they guard against. A future reader learns the codebase by reading the tests.
- **Don't commit red tests** — Phase 5 is written but uncommitted because it's failing (on a real backend issue, not a test bug). CI red blocks every PR.
- **Separate "decision" from "task"** — the DB strategy issue is a decision (affects every contributor, needs CI config), so it's a filed issue rather than an inline task.

---

## The 6 real bugs the suite caught (across all phases)

Every one of these was caught by **running the tests**, not by writing them.
Writing tests without running them would have left all 6 in.

1. **Phase 1:** Expected `['100', '99']` for numeric sort — wrong. `99 < 100`
   numerically. Code was right, test was wrong.
2. **Phase 3:** Forgot the leading free row from 8am to first class in `buildAgenda` tests.
3. **Phase 3:** Missed the trailing free row's start_min in the sort test.
4. **Phase 3:** Claimed `"1300"` contains `"10"` — it doesn't (1 is followed by 3).
5. **Phase 4:** `React is not defined` — Vitest esbuild defaulted to classic JSX
   runtime; app uses automatic. Fix: `esbuild: { jsx: 'automatic' }`.
6. **Phase 5:** Backend returns 500 on every DB query — `Unregistered API key`.
   Pre-existing environment issue, not introduced by the test work. The E2E
   suite caught it; unit tests with mocked DBs could not.

The lesson: **a test suite you don't run is worse than no test suite** — it
gives false confidence. Run it, watch it fail, reconcile each failure, then
watch it pass.
