import { useEffect, useRef } from 'react';

export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: unknown[],
  delayMs: number
): void {
  const callbackRef = useRef(effect);
  callbackRef.current = effect;

  useEffect(() => {
    const handle = setTimeout(() => callbackRef.current(), delayMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}
