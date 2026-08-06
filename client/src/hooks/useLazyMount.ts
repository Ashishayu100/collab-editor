import { useEffect, useState } from 'react';

/**
 * Once `open` becomes true for the first time, returns `true` forever after — even once `open`
 * goes back to `false`. Pairs with a lazily-imported panel that already renders `null` when
 * closed: gating its mount on this (rather than on `open` directly) means its JS chunk is only
 * ever fetched the first time the user actually opens it, while the component instance — and
 * whatever internal state it holds (a draft reply, a scroll position) — survives every
 * subsequent close/reopen exactly as it would if it had been mounted from the start.
 */
export function useLazyMount(open: boolean): boolean {
  const [everOpened, setEverOpened] = useState(open);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  return everOpened;
}
