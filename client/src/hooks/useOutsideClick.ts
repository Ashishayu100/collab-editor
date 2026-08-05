import { RefObject, useEffect } from 'react';

/** Calls `onOutside` for any mousedown outside `ref`'s element. No-ops while `active` is false. */
export function useOutsideClick(ref: RefObject<HTMLElement>, onOutside: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;

    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [active, onOutside, ref]);
}
