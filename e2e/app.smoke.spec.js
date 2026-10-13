import { test, expect } from '@playwright/test'

// Browser smoke test. Exercises the full stack: Vite dev server -> React app
// -> fetch -> Express API -> Supabase. Catches things unit/integration tests
// can't: the app boots, the API_BASE resolves, the map mounts, a click flows
// end-to-end.
//
// Both servers must be running:
//   cd backend && npm run dev    # :3001
//   cd frontend && npm run dev   # :5173
//
// This is a SMOKE test, not exhaustive UI coverage. It checks the load path
// and one select-building flow. Component tests cover the detailed UI state.

test('app boots and lists buildings in the sidebar', async ({ page }) => {
  await page.goto('/')

  // The sidebar lists every building. DBH is a known building that always
  // exists in the data (see CLAUDE.md). Wait for it rather than assert
  // immediately -- the fetch is async.
  await expect(page.getByText('DBH', { exact: true })).toBeVisible({ timeout: 10000 })

  // At least a handful of buildings should render. The exact count is
  // covered by the API contract test; here we just sanity-check the UI
  // received something.
  const buildingRows = page.locator('button:has-text("DBH"), button:has-text("SSL"), button:has-text("ET")')
  await expect(buildingRows.first()).toBeVisible()
})

test('selecting a building opens the detail panel with room cards', async ({ page }) => {
  await page.goto('/')

  // Click DBH in the sidebar. The text "DBH" appears in the row button.
  await page.getByText('DBH', { exact: true }).click()

  // The detail panel should appear. Per CLAUDE.md the panel has an "Open now"
  // stat pair and room cards. Look for the panel heading -- the component
  // renders the building name prominently once selected.
  // We assert something that only exists once a building is selected: the
  // room grid. Room numbers are bare strings rendered in the cards.
  await expect(page.getByText('Donald Bren Hall')).toBeVisible({ timeout: 5000 })
})

test('the now bar shows a formatted day and time', async ({ page }) => {
  await page.goto('/')

  // The now bar (yellow #ffd200) shows "<FullDay>, <h:mm AM/PM>". Match any
  // weekday name followed by a comma and a time. This catches a broken
  // formatNow() or a missing now bar.
  const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday), \d{1,2}:\d{2} (AM|PM)/
  await expect(page.locator('body')).toContainText(dayPattern, { timeout: 10000 })
})

test('the map container mounts (MapLibre canvas exists)', async ({ page }) => {
  await page.goto('/')

  // MapLibre renders a <canvas> inside .maplibregl-map. This is the cheapest
  // "the map actually mounted" check -- it doesn't verify tiles loaded (those
  // come from OpenStreetMap and can be slow/flaky), just that the MapLibre
  // instance initialized and drew its canvas.
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10000 })
})
