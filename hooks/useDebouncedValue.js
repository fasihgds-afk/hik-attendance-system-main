'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a value that updates only after `delayMs` of no changes.
 * Useful for search inputs so typing does not fire a request per keystroke.
 */
export function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
