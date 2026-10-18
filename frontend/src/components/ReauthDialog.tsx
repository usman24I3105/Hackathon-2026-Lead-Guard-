import { useState, type FormEvent } from "react";
import { Button, FormField, Input } from "./Primitives";

export function ReauthDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (password: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const ok = await onConfirm(password);
    setSubmitting(false);
    if (!ok) {
      setError("That password didn't work.");
      return;
    }
    setPassword("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <form onSubmit={submit} className="bg-surface rounded-card border border-line w-full max-w-sm p-6 flex flex-col gap-4">
        <h2 id="reauth-title" className="text-lg font-semibold">Confirm your password</h2>
        <p className="text-sm text-ink-2">This action needs a fresh confirmation before it can continue.</p>
        <FormField label="Password" htmlFor="reauth-password" error={error ?? undefined}>
          <Input
            id="reauth-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Confirming…" : "Confirm"}</Button>
        </div>
      </form>
    </div>
  );
}
