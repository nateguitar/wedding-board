import { useCallback, useLayoutEffect, useRef } from "react";

// Returns a stable function identity that always invokes the latest callback.
// Lets us register tldraw/Supabase listeners once without stale closures.
export function useCallbackRef<T extends (...args: never[]) => unknown>(cb: T): T {
  const ref = useRef(cb);
  useLayoutEffect(() => {
    ref.current = cb;
  });
  return useCallback(((...args: never[]) => ref.current(...args)) as T, []);
}
