import { RefObject, useEffect, useRef, useState } from 'react';

/** Reports once whether an element has scrolled into view — used to trigger a one-shot
 *  entrance animation (see .animate-fade-in-up in index.css) instead of replaying it on
 *  every scroll in/out. */
export function useInView(threshold = 0.1): [RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible];
}
