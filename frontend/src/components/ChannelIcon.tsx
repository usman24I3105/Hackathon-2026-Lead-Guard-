import type { ActivityChannel } from "../api/types/dashboard";

const LABEL: Record<ActivityChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  stripe: "Stripe",
  google: "Google Calendar",
  system: "LeadGuard",
};

const COLOR: Record<ActivityChannel, string> = {
  whatsapp: "var(--success-text)",
  telegram: "var(--primary)",
  stripe: "var(--text)",
  google: "var(--primary)",
  system: "var(--neutral-text)",
};

/** Generic glyphs (not brand logos) with an accessible name for each channel. */
export function ChannelIcon({ channel, size = 16 }: { channel: ActivityChannel | string; size?: number }) {
  const key = (channel in LABEL ? channel : "system") as ActivityChannel;
  const stroke = COLOR[key];
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke, strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  let glyph;
  switch (key) {
    case "whatsapp":
      glyph = <path d="M3 13l.8-2.6A5.5 5.5 0 1 1 6 12.6L3 13z" />;
      break;
    case "telegram":
      glyph = <path d="M14 2.5L1.8 7.3l4 1.4m8.2-6.2L6 8.7m8-6.2L11.6 13.5 6 8.7m0 0V12.8l2.2-2.3" />;
      break;
    case "stripe":
      glyph = (
        <>
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
          <path d="M1.5 6.5h13M4 10h3" />
        </>
      );
      break;
    case "google":
      glyph = (
        <>
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </>
      );
      break;
    default:
      glyph = <path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 6.9C5.2 13.1 3 10.7 3 7.5v-4l5-2z" />;
  }

  return (
    <svg {...common} role="img" aria-label={LABEL[key]}>
      <title>{LABEL[key]}</title>
      {glyph}
    </svg>
  );
}
