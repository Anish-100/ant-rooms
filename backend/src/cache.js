// In-memory cache: key -> { value, expiresAt }. Per-process, empty after a
// restart -- fine for data the weekly sync only changes once a week.

const store = new Map()

// Fresh value, or await fn() and store it. A throw stores nothing, so the next
// request retries. `validate` (see validate.js) throws -> 500, not empty sidebar.
export async function getCached(key, ttlMs, fn, validate) {
  const hit = store.get(key)
  if (hit && Date.now() < hit.expiresAt) return hit.value

  const value = await fn()

  const problem = validate?.(value)
  if (problem) throw new Error(`cache: refusing to store "${key}" -- ${problem}`)

  store.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

// Test-only: clear the in-process cache between integration tests so a cached
// read from one test can't satisfy another. Not used by the running server.
export function resetCache() {
  store.clear()
}
