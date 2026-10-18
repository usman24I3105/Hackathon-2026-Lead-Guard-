import type { PipelineStageValue } from "../../../api/types/dashboard";
import { money } from "../../../lib/format";

/**
 * Open pipeline value by stage as horizontal bars. When the caller can't see
 * money (`visible` false), bars are sized by deal count instead so the chart
 * never leaks relative dollar amounts.
 */
export function PipelineBarChart({ stages, visible }: { stages: PipelineStageValue[]; visible: boolean }) {
  const measure = (s: PipelineStageValue) => (visible ? s.valueCents ?? 0 : s.dealCount);
  const max = Math.max(1, ...stages.map(measure));

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {stages.map((s) => {
          const pct = (measure(s) / max) * 100;
          const valueText = visible ? money(s.valueCents) : "•••";
          const deals = `${s.dealCount} deal${s.dealCount === 1 ? "" : "s"}`;
          return (
            <li key={s.stageId} className="grid grid-cols-[minmax(5rem,8rem)_1fr_auto] items-center gap-3">
              <span className="text-sm text-text truncate">{s.stageName}</span>
              <div className="h-3 rounded-full bg-neutral-bg overflow-hidden" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-primary-accent transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm text-right whitespace-nowrap">
                <span className="font-mono-tab font-semibold text-text">{valueText}</span>
                <span className="text-text-muted"> · {deals}</span>
                {!visible && <span className="sr-only"> (value hidden — requires permission)</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-muted">*Dollar values are visible only to permitted users.</p>
    </div>
  );
}
