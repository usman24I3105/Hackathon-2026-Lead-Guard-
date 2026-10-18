import type { ReactNode } from "react";
import { Skeleton } from "../../../components/Primitives";

export function WidgetError({ message = "We couldn't load this.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-4">
      <p className="flex items-center gap-2 text-sm text-danger-text">
        <span aria-hidden="true">⚠</span>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-9 px-3 rounded-control border border-border-strong bg-surface text-sm font-medium text-text hover:bg-neutral-bg active:scale-[0.98] transition"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function WidgetEmpty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 py-6 px-2">
      <p className="text-sm font-medium text-text">{title}</p>
      {body && <p className="text-sm text-text-muted max-w-xs">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** List-shaped placeholder (optionally with a leading avatar circle). */
export function SkeletonRows({ rows = 4, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="h-8 w-8 rounded-full! shrink-0" />}
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonBars({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-[6rem_1fr_5rem] items-center gap-3">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3 rounded-full!" style={{ width: `${90 - i * 18}%` }} />
          <Skeleton className="h-3.5" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-full opacity-60" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-[1.2fr_1fr_1.5fr_1fr_auto] items-center gap-3 py-1">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-8 w-40" />
        </div>
      ))}
    </div>
  );
}

export function KpiCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface border border-border rounded-card shadow-card p-4 sm:p-5 flex flex-col gap-3 ${className}`}
    >
      <Skeleton className="h-3.5 w-2/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3.5 w-1/3 mt-1" />
    </div>
  );
}
