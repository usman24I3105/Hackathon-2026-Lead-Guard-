import { initials } from "../lib/format";
import type { Availability } from "../mock/types";

const LABEL: Record<Availability, string> = {
  available: "Available",
  busy: "Busy",
  leave: "On leave",
  offline: "Offline",
};

const DOT: Record<Availability, string> = {
  available: "var(--success)",
  busy: "var(--danger)",
  leave: "var(--warning)",
  offline: "var(--neutral-text)",
};

export function Avatar({
  name,
  size = 32,
  availability,
  showLabel = false,
  title,
}: {
  name: string;
  color?: string;
  size?: number;
  availability?: Availability;
  showLabel?: boolean;
  title?: string;
}) {
  const paletteIndex = Array.from(name).reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7) % 8;
  return (
    <div className="inline-flex items-center gap-2" title={title}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className={`avatar-face avatar-face--${paletteIndex} flex items-center justify-center rounded-full font-semibold`}
          style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
          aria-hidden
        >
          {initials(name)}
        </div>
        {availability && (
          <span
            className={`avatar-status-dot is-${availability} absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface`}
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

export function AvatarStack({ people, max = 4, size = 32, title }: { people: { id: string; name: string; color?: string }[]; max?: number; size?: number; title?: string }) {
  const visible = people.slice(0, max);
  const overflow = Math.max(0, people.length - visible.length);
  return <span className="avatar-stack" aria-label={title ?? `${people.length} ${people.length === 1 ? "person" : "people"}`}>
    {visible.map((person, index) => <span key={person.id} className="avatar-stack-item" style={{ zIndex: visible.length - index, marginInlineStart: index === 0 ? 0 : -8 }} title={person.name}><Avatar name={person.name} color={person.color} size={size} title={person.name} /></span>)}
    {overflow > 0 && <span className="avatar-stack-overflow" style={{ width: size, height: size, marginInlineStart: -8 }} title={people.slice(max).map((person) => person.name).join(", ")}>+{overflow}</span>}
  </span>;
}

export { LABEL as availabilityLabel };
