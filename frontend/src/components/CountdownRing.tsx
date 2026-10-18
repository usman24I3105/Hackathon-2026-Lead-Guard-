import { useEffect, useState } from "react";
import { secondsLeft } from "../lib/time";

type Mode = "running" | "acknowledged" | "overdue" | "held";

export function CountdownRing({
  ackDeadline,
  mode,
  windowSeconds = 10,
  size = 56,
}: {
  ackDeadline: string;
  mode: Mode;
  windowSeconds?: number;
  size?: number;
}) {
  const [left, setLeft] = useState(() => secondsLeft(ackDeadline));

  useEffect(() => {
    if (mode !== "running") return;
    const id = window.setInterval(() => setLeft(secondsLeft(ackDeadline)), 250);
    return () => window.clearInterval(id);
  }, [ackDeadline, mode]);

  const pct = mode === "acknowledged" ? 1 : mode === "held" ? 0 : Math.max(0, Math.min(1, left / windowSeconds));
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = mode === "acknowledged" ? "var(--safe)" : mode === "overdue" ? "var(--alarm)" : mode === "held" ? "var(--ink-2)" : "var(--signal)";
  const label =
    mode === "acknowledged" ? "Acknowledged" : mode === "overdue" ? "Overdue" : mode === "held" ? "Held" : `${left} seconds left`;

  return (
    <div className="countdown-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx={24} cy={24} r={r} fill="none" stroke="var(--line)" strokeWidth={4.25} />
        <circle
          className="countdown-progress"
          cx={24}
          cy={24}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4.25}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 24 24)"
        />
        {mode === "acknowledged" ? (
          <path className="countdown-check" d="m16.5 24 5 5 10-11" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <text className="countdown-value" x="24" y="24" dominantBaseline="central" textAnchor="middle" fill={mode === "running" ? "var(--warning-text)" : color}>
            {mode === "overdue" ? "!" : mode === "held" ? "–" : left}
          </text>
        )}
      </svg>
    </div>
  );
}
