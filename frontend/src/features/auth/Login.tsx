import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { Button, FormField, Input } from "../../components/Primitives";
import { Notice } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
import { AuthLayout } from "./AuthLayout";
import { SessionExpiredDialog } from "../../components/SessionExpiredDialog";
import { isSafeReturnTo } from "../../lib/safeUrl";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("owais@leadguard.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [throttleUntil, setThrottleUntil] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const throttled = throttleUntil !== null && throttleUntil > Date.now();
  const retrySeconds = throttled ? Math.ceil((throttleUntil! - Date.now()) / 1000) : 0;
  const emailInvalid = emailTouched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // ?returnTo= comes from clearSession()'s redirect and is URL-controlled,
  // so it goes through isSafeReturnTo before it's ever used for navigation.
  const returnToParam = searchParams.get("returnTo");
  const sessionExpired = isSafeReturnTo(returnToParam);

  function destination(): string {
    if (isSafeReturnTo(returnToParam)) return returnToParam;
    const from = (location.state as { from?: string } | null)?.from;
    if (isSafeReturnTo(from)) return from;
    return "/relay";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (throttled) return;
    setSubmitting(true);
    setError(null);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      navigate(destination(), { replace: true });
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (nextAttempts >= 3) {
      setThrottleUntil(Date.now() + 20_000);
      setError("Too many attempts. Please wait before trying again.");
    } else {
      setError(result.error);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to keep every customer conversation moving.">
      {sessionExpired && <SessionExpiredDialog />}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="auth-error-slot">{error && <Notice variant="danger">{error}</Notice>}</div>
        <FormField label="Work email" htmlFor="email" error={emailInvalid ? "Enter a valid email address." : undefined}>
          <div className="auth-input-wrap"><Icon name="mail" size={16} /><Input id="email" type="email" autoComplete="email" autoFocus required value={email} aria-invalid={emailInvalid || undefined} onBlur={() => setEmailTouched(true)} onChange={(e) => setEmail(e.target.value)} /></div>
        </FormField>
        <FormField label="Password" htmlFor="password">
          <div className="auth-input-wrap"><Icon name="lock" size={16} /><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onKeyDown={(event) => setCapsLockOn(event.getModifierState("CapsLock"))} onKeyUp={(event) => setCapsLockOn(event.getModifierState("CapsLock"))} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="auth-password-toggle" aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show"}</button></div>
          {capsLockOn && <p className="auth-caps-warning" role="status">Caps Lock is on</p>}
        </FormField>
        <Button type="submit" loading={submitting} disabled={throttled} className="auth-submit w-full mt-1">
          {throttled ? `Try again in ${retrySeconds}s` : submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="auth-switch-link">New workspace? <Link to="/signup">Create one</Link></p>
    </AuthLayout>
  );
}
