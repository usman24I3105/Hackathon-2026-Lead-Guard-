import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "dashboard" | "leads" | "recovery" | "pipeline" | "contacts" | "integrations"
  | "companies" | "opportunities" | "message" | "payments" | "calendar" | "team" | "activity"
  | "audit" | "settings" | "search" | "menu" | "close" | "chevron-down" | "logout" | "check"
  | "sun" | "moon" | "plus" | "command" | "chevron-left" | "arrow-right" | "play" | "shield"
  | "bell" | "list" | "history" | "phone" | "copy" | "more" | "info" | "filter" | "clock" | "warning" | "inbox"
  | "lock" | "arrow-up-right" | "mail";

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  leads: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  recovery: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </>
  ),
  pipeline: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>
  ),
  contacts: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.6 3 5.2" />
    </>
  ),
  companies: (
    <>
      <path d="M3 21h18M5 21V7l7-4v18M19 21V11l-7-4" />
      <path d="M8 9v.01M8 12v.01M8 15v.01M15 12v.01M15 15v.01M15 18v.01" />
    </>
  ),
  opportunities: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M5 5h4v4H5zM15 15h4v4h-4z" />
    </>
  ),
  message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />,
  payments: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M7 15h3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20c.7-3.4 2.8-5 6.5-5s5.8 1.6 6.5 5M16 5.5a3 3 0 0 1 0 5.8M17 15c2.5.6 3.9 2.2 4.5 5" />
    </>
  ),
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  integrations: (
    <>
      <path d="M9 7V3M15 7V3" />
      <path d="M6 7h12v4a6 6 0 0 1-12 0V7z" />
      <path d="M12 17v4" />
    </>
  ),
  audit: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  logout: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 16l-4-4 4-4M6 12h10" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  command: <>
    <path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7z" />
  </>,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />,
  play: <path d="m8 5 12 7-12 7V5z" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2.7-6.4L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  phone: <path d="M7 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-2l-5-2-2 2a14 14 0 0 1-6-6l2-2-3-5z" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  warning: <><path d="m12 3 9 16H3l9-16z" /><path d="M12 9v4M12 16h.01" /></>,
  inbox: <><path d="M4 4h16l2 10v5H2v-5L4 4z" /><path d="M2 14h5l2 3h6l2-3h5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /><path d="M12 14v3" /></>,
  "arrow-up-right": <><path d="M7 17 17 7M8 7h9v9" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  shield: <><path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3z" /><path d="m9 12 2 2 4-4" /></>,
};

/** Decorative by default (aria-hidden); pass `label` for a standalone meaningful icon. */
export function Icon({ name, size = 20, label, ...rest }: { name: IconName; size?: number; label?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export function ShieldLogo({ size = 28 }: { size?: number }) {
  return <img src="/leadguard-mark.png" width={size} height={size} alt="" aria-hidden="true" className="brand-mark" />;
}

export function BrandLockup({ className = "" }: { className?: string }) {
  return <img src="/leadguard-lockup.png" alt="LeadGuard CRM" className={`brand-lockup ${className}`} />;
}
