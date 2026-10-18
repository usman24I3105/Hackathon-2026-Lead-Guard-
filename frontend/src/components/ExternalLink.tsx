import type { AnchorHTMLAttributes, ReactNode } from "react";
import { isAllowedExternalHost } from "../lib/safeUrl";

/**
 * Renders an actual outbound link only if the URL's host is on the
 * allowlist (lib/safeUrl.ts) — otherwise renders plain text, never a link,
 * so an unexpected host can't be used to phish through our own UI.
 */
export function ExternalLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "rel" | "target">) {
  if (!isAllowedExternalHost(href)) {
    return <span className="text-ink-2">{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
