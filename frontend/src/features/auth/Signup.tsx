import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { Button, FormField, Input } from "../../components/Primitives";
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
    <AuthLayout title="Create your workspace" subtitle="Set up LeadGuard for your team in under a minute.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="Your name" htmlFor="name">
          <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Workspace name" htmlFor="workspace" hint="Your company or team name — shown to your team.">
          <Input id="workspace" required value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="Acme Roofing" />
        </FormField>
        <FormField label="Work email" htmlFor="email" error={error ?? undefined}>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" disabled={submitting} className="w-full mt-1">
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
