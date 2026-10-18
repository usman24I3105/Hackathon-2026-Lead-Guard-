import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { Button, FormField, Input } from "../../components/Primitives";
import { Notice } from "../../components/DesignSystem";
import { AuthLayout } from "./AuthLayout";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const requirements = [password.length >= 8, /\d/.test(password), /[^A-Za-z0-9]/.test(password)];
  const strength = requirements.filter(Boolean).length + (password.length >= 12 ? 1 : 0);
  const strengthLabel = password.length === 0 ? "Add a password" : ["Needs work", "Fair", "Good", "Strong"][Math.max(0, Math.min(3, strength - 1))];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signup(name, email, password, workspace);
    setSubmitting(false);
    if (result.ok) navigate("/relay", { replace: true });
    else setError(result.error);
  }

  return (
    <AuthLayout mode="signup" title="Create your workspace" subtitle="A focused home for every new lead and customer conversation.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="auth-error-slot">{error && <Notice variant="danger">{error}</Notice>}</div>
        <p className="auth-group-caption">Your account</p>
        <FormField label="Full name" htmlFor="name">
          <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Work email" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Password" htmlFor="password">
          <div className="auth-password-field"><Input id="password" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="auth-password-toggle" aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show"}</button></div>
          <div className="auth-strength" aria-live="polite"><div className="auth-strength-bars" data-strength={strength}>{[0, 1, 2, 3].map((step) => <span key={step} />)}</div><span>{strengthLabel}</span></div>
          <ul className="auth-requirements">{["8 or more characters", "At least one number", "At least one symbol"].map((requirement, index) => <li key={requirement} data-met={requirements[index] || undefined}>{requirements[index] ? "✓" : "○"} {requirement}</li>)}</ul>
        </FormField>
        <p className="auth-group-caption auth-workspace-caption">Your workspace</p>
        <FormField label="Company or workspace name" htmlFor="workspace" hint="Your team can change this later.">
          <Input id="workspace" required autoComplete="organization" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="Acme Roofing" />
        </FormField>
        <Button type="submit" loading={submitting} className="w-full mt-1">
          {submitting ? "Creating workspace…" : "Create workspace"}
        </Button>
      </form>
      <p className="text-sm text-ink-2 mt-5 text-center">
        Already have a workspace?{" "}
        <Link to="/login" className="text-focus underline font-medium">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
