// Guards against open-redirect and host-spoofing: every externally-influenced
// URL (post-login returnTo, outbound links) must pass one of these first.

/** A same-origin, relative path. Rejects protocol-relative ("//host") and absolute URLs. */
export function isSafeReturnTo(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  // Guard against backslash tricks some browsers normalize to "//".
  if (/^\/\\/.test(value)) return false;
  return true;
}

const ALLOWED_EXTERNAL_HOSTS: Record<string, true> = {
  "checkout.stripe.com": true,
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isStripeCheckoutUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const host = hostOf(url);
  return host === "checkout.stripe.com";
}

/** General allowlist check for the ExternalLink component. */
export function isAllowedExternalHost(url: string | null | undefined): boolean {
  if (!url) return false;
  const host = hostOf(url);
  return !!host && !!ALLOWED_EXTERNAL_HOSTS[host];
}
