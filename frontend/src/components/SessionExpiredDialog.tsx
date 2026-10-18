/**
 * clearSession() redirects straight to /login (there's no page left to show
 * a modal from), so this renders as a banner on the login screen itself
 * whenever it was reached via that redirect — see Login.tsx.
 */
export function SessionExpiredDialog() {
  return (
    <div
      role="alert"
      className="text-sm rounded-card border px-3 py-2.5 mb-4"
      style={{ borderColor: "var(--signal)", background: "var(--warn-bg)" }}
    >
      Your session ended. Sign in again to pick up where you left off.
    </div>
  );
}
