/**
 * Short-lived in-memory cache for relatively static HR lookups
 * (shifts, departments, hub overview). Avoids refetching on every page visit.
 */

const TTL_MS = 60_000;

const cache = new Map();
/** In-flight fetchers — concurrent callers share one promise (avoids abort races). */
const inflight = new Map();

function getEntry(key, ttlMs = TTL_MS) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
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

/** Seed the TTL cache from a bootstrap response so later pages skip extra lookups. */
export function primeLookupCache(key, value) {
  if (value == null) return value;
  return setEntry(key, value);
}

/**
 * Share one in-flight promise (no TTL). Kills React Strict Mode / remount double-fetches.
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 */
export async function coalesceFetch(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = (async () => {
    try {
      return await fetcher();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {{ ttlMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function getCachedLookup(key, fetcher, options = {}) {
  const ttlMs = options.ttlMs ?? TTL_MS;
  const hit = getEntry(key, ttlMs);
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
  hubEmployeesOverview: 'hub:employees:overview',
  hubDeptStats: 'hub:dept-stats',
};
