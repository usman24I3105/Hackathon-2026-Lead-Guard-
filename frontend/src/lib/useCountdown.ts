import { useEffect, useState } from "react";
import { secondsLeft } from "./time";

/** Seconds until `deadlineIso` (server-time corrected), re-rendering every second. */
export function useCountdown(deadlineIso: string | null | undefined): number {
  const [left, setLeft] = useState(() => (deadlineIso ? secondsLeft(deadlineIso) : 0));

  useEffect(() => {
    if (!deadlineIso) return;
    const tick = () => setLeft(secondsLeft(deadlineIso));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineIso]);

  return left;
}

export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
