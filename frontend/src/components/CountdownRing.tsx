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
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = mode === "acknowledged" ? "var(--safe)" : mode === "overdue" ? "var(--alarm)" : mode === "held" ? "var(--ink-2)" : "var(--signal)";
  const label =
    mode === "acknowledged" ? "Acknowledged" : mode === "overdue" ? "Overdue" : mode === "held" ? "Held" : `${left} seconds left`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: mode === "running" ? "stroke-dashoffset 0.25s linear" : "stroke-dashoffset 0.3s ease-out, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono-tab text-xs" style={{ color }}>
        {mode === "acknowledged" ? "✓" : mode === "overdue" ? "⚠" : mode === "held" ? "–" : left}
      </div>
    </div>
  );
}
