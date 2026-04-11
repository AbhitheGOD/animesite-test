/**
 * In-memory TTL cache for Vercel serverless functions.
 * Module-level Map persists across warm invocations, eliminating redundant
 * upstream API calls and the rate-limit errors they cause.
 *
 * TTL guidelines:
 *   search results   → 5 min   (user expects fresh results per session)
 *   anime detail     → 60 min  (stable data, rarely changes)
 *   recommendations  → 15 min  (genre/title-based, stable)
 *   trending         → 10 min  (changes throughout the day)
 *   genre pages      → 15 min
 */

const store = new Map(); // key → { value, expiresAt }

/**
 * @param {string} key
 * @param {() => Promise<any>} fetcher  async function to call on cache miss
 * @param {number} ttlMs               time-to-live in milliseconds
 */
export async function cached(key, fetcher, ttlMs) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await fetcher();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Manually invalidate a cached entry (useful in tests / admin routes) */
export function invalidate(key) {
  store.delete(key);
}

/** Purge all expired entries (call occasionally to prevent unbounded growth) */
export function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

// Auto-purge every 5 minutes in long-lived processes
if (typeof setInterval !== 'undefined') {
  setInterval(purgeExpired, 5 * 60 * 1000);
}

export const TTL = {
  SEARCH:      5  * 60 * 1000,
  ANIME:       60 * 60 * 1000,
  RECOMMEND:   15 * 60 * 1000,
  TRENDING:    10 * 60 * 1000,
  GENRE:       15 * 60 * 1000,
  SIMILAR:     15 * 60 * 1000,
  RELATIONS:   60 * 60 * 1000,
};
