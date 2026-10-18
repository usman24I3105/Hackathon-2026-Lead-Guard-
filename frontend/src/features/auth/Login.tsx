import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { Button, FormField, Input } from "../../components/Primitives";
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

  const throttled = throttleUntil !== null && throttleUntil > Date.now();
  const retrySeconds = throttled ? Math.ceil((throttleUntil! - Date.now()) / 1000) : 0;

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
    <AuthLayout title="Sign in" subtitle="Welcome back — let's get leads answered.">
      {sessionExpired && <SessionExpiredDialog />}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Password" htmlFor="password" error={error ?? undefined}>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" disabled={submitting || throttled} className="w-full mt-1">
          {throttled ? `Try again in ${retrySeconds}s` : submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-ink-2 mt-5 text-center">
        New workspace?{" "}
        <Link to="/signup" className="text-focus underline font-medium">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
