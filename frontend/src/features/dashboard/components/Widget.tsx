import type { ReactNode } from "react";
import { SkeletonRows, WidgetEmpty, WidgetError } from "./WidgetStates";

export type WidgetStatus = "loading" | "error" | "ready";

/**
 * Titled card shell shared by every dashboard widget. It owns the loading,
 * error and empty states so each widget gets them the same way; children
 * render only when there's data to show.
 */
export function Widget({
  title,
  action,
  children,
  className = "",
  id,
  status = "ready",
  skeleton,
  onRetry,
  errorMessage,
  isEmpty = false,
  emptyTitle = "Nothing here yet.",
  emptyBody,
  emptyAction,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  status?: WidgetStatus;
  skeleton?: ReactNode;
  onRetry?: () => void;
  errorMessage?: string;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;

  let body: ReactNode;
  if (status === "loading") {
    body = <div aria-hidden="true">{skeleton ?? <SkeletonRows />}</div>;
  } else if (status === "error") {
    body = <WidgetError message={errorMessage ?? `We couldn't load ${title.toLowerCase()}.`} onRetry={onRetry} />;
  } else if (isEmpty) {
    body = <WidgetEmpty title={emptyTitle} body={emptyBody} action={emptyAction} />;
  } else {
    body = children;
  }

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      aria-busy={status === "loading" || undefined}
      className={`bg-surface border border-border rounded-card shadow-card flex flex-col min-w-0 ${className}`}
    >
      <header className="flex min-h-14 items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 id={headingId} className="text-base font-semibold text-text">{title}</h2>
        {status === "ready" && !isEmpty && action}
      </header>
      <div className="flex-1 px-5 pb-5 min-w-0">{body}</div>
    </section>
  );
}
