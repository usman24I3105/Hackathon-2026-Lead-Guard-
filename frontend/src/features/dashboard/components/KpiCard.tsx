import { useId, useState } from "react";
import type { KpiMetric, Trend } from "../../../api/types/dashboard";
import { money } from "../../../lib/format";

function formatValue(metric: KpiMetric): string {
  if (metric.masked) return "•••";
  if (metric.value == null) return "—";
  if (metric.unit === "cents") return money(metric.value);
  if (metric.unit === "seconds") {
    const m = Math.floor(metric.value / 60);
    const s = metric.value % 60;
    return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
  }
  return metric.value.toLocaleString("en-US");
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.direction === "flat") {
    return <span className="text-xs text-text-muted">No change vs {trend.comparedTo}</span>;
  }
  const good = (trend.direction === "up") === trend.upIsGood;
  const color = good ? "var(--success-text)" : "var(--danger-text)";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: trend.direction === "down" ? "rotate(180deg)" : undefined }}>
        <path d="M5 1.5 L9 7.5 H1 Z" fill="currentColor" />
      </svg>
      <span>
        {`${trend.percent}%`}
        <span className="sr-only">{` ${trend.direction === "up" ? "higher" : "lower"}`}</span>
        {` vs ${trend.comparedTo}`}
      </span>
    </span>
  );
}

export function KpiCard({
  metric,
  onViewList,
  viewListLabel = "View list",
  className = "",
}: {
  metric: KpiMetric;
  onViewList?: () => void;
  viewListLabel?: string;
  className?: string;
}) {
  const [showDefinition, setShowDefinition] = useState(false);
  const definitionId = useId();

  return (
    <article className={`bg-surface border border-border rounded-card shadow-card p-4 sm:p-5 flex flex-col gap-2 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-text-muted leading-snug">{metric.label}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {metric.badge ? (
            <span
              className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-xs font-semibold text-white bg-warning-text"
              aria-label={`${metric.badge} need attention`}
            >
              {metric.badge}
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`What does "${metric.label}" mean?`}
            aria-expanded={showDefinition}
            aria-controls={definitionId}
            onClick={() => setShowDefinition((s) => !s)}
            className="h-8 w-8 sm:h-6 sm:w-6 rounded-full border border-border-strong text-text-muted text-xs transition-colors hover:text-text hover:border-border-strong active:bg-neutral-bg"
          >
            i
          </button>
        </div>
      </div>

      <p className="font-mono-tab text-2xl sm:text-3xl font-semibold text-text leading-none">
        {formatValue(metric)}
        {metric.masked && <span className="sr-only"> (hidden — requires permission)</span>}
      </p>

      <div className="min-h-4">{metric.trend && <TrendBadge trend={metric.trend} />}</div>

      <p id={definitionId} hidden={!showDefinition} className="text-xs text-text-muted">
        {metric.definition}
      </p>

      {onViewList && (
        <button
          type="button"
          onClick={onViewList}
          className="self-start mt-auto -mx-1 px-1 py-2 sm:py-0.5 rounded text-sm font-medium text-primary transition-colors hover:text-primary-hover hover:underline underline-offset-2 active:opacity-80"
        >
          {viewListLabel} <span aria-hidden="true">→</span>
        </button>
      )}
    </article>
  );
}
