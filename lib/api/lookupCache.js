/**
 * Short-lived in-memory cache for relatively static HR lookups
 * (shifts, departments). Avoids refetching on every page visit.
 */

const TTL_MS = 60_000;

const cache = new Map();

function getEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setEntry(key, value) {
  cache.set(key, { value, timestamp: Date.now() });
  return value;
}

export function clearLookupCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @returns {Promise<any>}
 */
export async function getCachedLookup(key, fetcher) {
  const hit = getEntry(key);
  if (hit !== null) return hit;
  const value = await fetcher();
  return setEntry(key, value);
}

export const LOOKUP_KEYS = {
  shiftsActive: 'shifts:activeOnly',
  departments: 'departments:all',
};
