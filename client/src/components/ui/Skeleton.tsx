import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded bg-gray-100', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <Skeleton className="mb-6 h-24 rounded-lg" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/3" />
      <Skeleton className="mt-4 h-7 w-7 rounded-full" />
    </div>
  );
}

/** A single comment-shaped skeleton row (avatar + a couple lines of text) — used for the
 *  comments panel and anywhere else a "loading list of people talking" shape is needed. */
export function SkeletonCommentItem() {
  return (
    <div className="flex gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

/** A single version-history-shaped skeleton row (title line + byline). */
export function SkeletonListItem() {
  return (
    <div className="space-y-1.5 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-8" />
      </div>
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}
