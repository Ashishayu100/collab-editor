import { useEffect, useState } from 'react';
import { useLoadingStore } from '../../stores/loadingStore';

/** A thin progress bar at the top of the viewport, like GitHub/YouTube — driven by the count of
 *  in-flight API requests (see stores/loadingStore.ts + api/axios.ts's interceptors) rather than
 *  route transitions, since this SPA's navigations don't themselves fetch a new document. */
export function TopProgressBar() {
  const loading = useLoadingStore((s) => s.activeRequests > 0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (loading) {
      setProgress(20);
      const t1 = setTimeout(() => setProgress(50), 200);
      const t2 = setTimeout(() => setProgress(80), 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }

    setProgress((p) => (p === 0 ? 0 : 100));
    const t = setTimeout(() => setProgress(0), 300);
    return () => clearTimeout(t);
  }, [loading]);

  if (progress === 0) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-[100] h-0.5 bg-transparent">
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
