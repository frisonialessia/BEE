"use client";

import { useEffect, useState } from "react";

/** Returns `value`, but only after it's stopped changing for `delayMs`.
 * First user of this pattern in the app — see command-palette.tsx, which
 * uses it to keep semantic search from firing a backend request on every
 * keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
