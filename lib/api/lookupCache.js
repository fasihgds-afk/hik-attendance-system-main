/**
 * Short-lived in-memory cache for relatively static HR lookups
 * (shifts, departments). Avoids refetching on every page visit.
 */

const TTL_MS = 60_000;

const cache = new Map();
/** In-flight fetchers — concurrent callers share one promise (avoids abort races). */
const inflight = new Map();

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
  if (key) {
    cache.delete(key);
    inflight.delete(key);
  } else {
    cache.clear();
    inflight.clear();
  }
}

/**
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @returns {Promise<any>}
 */
export async function getCachedLookup(key, fetcher) {
  const hit = getEntry(key);
  if (hit !== null) return hit;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    try {
      const value = await fetcher();
      return setEntry(key, value);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export const LOOKUP_KEYS = {
  shiftsActive: 'shifts:activeOnly',
  departments: 'departments:all',
};
