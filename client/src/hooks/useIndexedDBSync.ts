import { IndexeddbPersistence } from 'y-indexeddb';
import { useEffect, useState } from 'react';

/** True once the given IndexeddbPersistence has finished loading cached state into the Y.Doc. */
export function useIndexedDBSync(provider: IndexeddbPersistence | null): boolean {
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!provider) {
      setSynced(false);
      return undefined;
    }

    if (provider.synced) {
      setSynced(true);
      return undefined;
    }

    setSynced(false);
    const handler = () => setSynced(true);
    provider.on('synced', handler);
    return () => {
      provider.off('synced', handler);
    };
  }, [provider]);

  return synced;
}
