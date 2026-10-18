import { initials } from "../lib/format";
import type { Availability } from "../mock/types";

const LABEL: Record<Availability, string> = {
  available: "Available",
  busy: "Busy",
  leave: "On leave",
  offline: "Offline",
};

const DOT: Record<Availability, string> = {
  available: "#0F766E",
  busy: "#F2A81D",
  leave: "#4B5563",
  offline: "#9CA3AF",
};

export function Avatar({
  name,
  color,
  size = 32,
  availability,
  showLabel = false,
}: {
  name: string;
  color: string;
  size?: 24 | 32 | 48;
  availability?: Availability;
  showLabel?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className="flex items-center justify-center rounded-full text-white font-semibold"
          style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
          aria-hidden
        >
          {initials(name)}
        </div>
        {availability && (
          <span
            className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface"
            style={{ width: size * 0.34, height: size * 0.34, background: DOT[availability] }}
            aria-hidden
          />
        )}
      </div>
      {showLabel && availability && (
        <span className="text-xs text-ink-2">{LABEL[availability]}</span>
      )}
    </div>
  );
}

export { LABEL as availabilityLabel };
