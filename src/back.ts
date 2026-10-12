import { useEffect, useRef } from 'preact/hooks';

/**
 * Android hardware/gesture "back" handling.
 * Every closable thing (sheet, sub-page, non-home tab) pushes a handler while it is
 * visible; the newest one runs first. If the stack is empty the app exits.
 */
type Handler = () => void;
const stack: Handler[] = [];

export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function useBack(fn: Handler, active = true) {
  const ref = useRef(fn);
  ref.current = fn; // always call the latest closure
  useEffect(() => {
    if (!active) return;
    const entry: Handler = () => ref.current();
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
