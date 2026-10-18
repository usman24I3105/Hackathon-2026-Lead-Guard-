import { useState, type FormEvent } from "react";
import { Button, FormField, Input } from "../../components/Primitives";
import { useToast } from "../../state/ToastContext";

export default function ChangePassword() {
  const { push } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 450));
    setSubmitting(false);
    // Mock mode only — a real backend would verify `current` server-side.
    setCurrent("");
    setNext("");
    setConfirm("");
    push("Password changed.");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-sm">
      <FormField label="Current password" htmlFor="cp-current" required>
        <Input id="cp-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </FormField>
      <FormField label="New password" htmlFor="cp-next" required hint="At least 8 characters." error={error && next.length < 8 ? error : undefined}>
        <Input id="cp-next" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      </FormField>
      <FormField label="Confirm new password" htmlFor="cp-confirm" required error={error && next === confirm ? undefined : error ?? undefined}>
        <Input id="cp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormField>
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
