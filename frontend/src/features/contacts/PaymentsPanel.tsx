import { useRef, useState, type FormEvent } from "react";
import { store, useStoreState } from "../../state/useStore";
import { Button, FormField, Input, Card } from "../../components/Primitives";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { money, clock } from "../../lib/format";
import { useToast } from "../../state/ToastContext";
import { ExternalLink } from "../../components/ExternalLink";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { Link } from "react-router-dom";
import { useFocusTrap } from "../../lib/useFocusTrap";

export function PaymentsPanel({ contactId }: { contactId: string }) {
  const { payments, integrations } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("500");
  const [memo, setMemo] = useState("Deposit");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusTrap(formRef, open, () => setOpen(false));

  const list = payments.filter((p) => p.contactId === contactId);
  const canManage = !session || has({ role: session.role }, "payments.manage");
  const canSeeAmount = canManage || (!!session && has({ role: session.role }, "dashboard.full"));
  const stripeReady = integrations.find((integration) => integration.key === "stripe")?.status === "connected";

  function create(e: FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents <= 0) return;
    try {
      store.createPaymentLink(contactId, cents, memo);
      push("Payment link created.", "success");
      setOpen(false);
      setAmount("500");
      setMemo("Deposit");
    } catch (error) {
      push(error instanceof Error ? error.message : "Payment link could not be created.", "error");
    }
  }

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard may be unavailable; link is still visible to copy manually
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wide">Payments</h3>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={!canManage || !stripeReady}>+ Payment link</Button>
      </div>
      {!canManage && <p className="text-xs text-text-muted">Payment actions and values are restricted for your role.</p>}
      {canManage && !stripeReady && <p className="text-xs text-warning-text">Connect Stripe before creating a payment link. <Link to="/integrations" className="underline">Manage integrations</Link></p>}

      {list.length === 0 ? (
        <p className="text-sm text-ink-2">No payment links yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id}>
              <Card className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono-tab text-sm">{canSeeAmount ? money(p.amountCents) : "••••"}</div>
                  <div className="text-xs text-ink-2 truncate">{p.memo} · {clock(p.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip kind={p.status as ChipKind} />
                  {canManage && <>
                    <ExternalLink href={p.url} className="text-xs underline underline-offset-2 text-ink-2 hover:text-ink h-9 px-1">Open</ExternalLink>
                    <button onClick={() => copy(p.url, p.id)} className="text-xs underline underline-offset-2 text-ink-2 hover:text-ink h-9 px-1">{copiedId === p.id ? "Copied!" : "Copy link"}</button>
                  </>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <form ref={formRef} onSubmit={create} className="bg-surface rounded-card border border-line w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 id="pay-title" className="text-lg font-semibold">Create payment link</h2>
            <FormField label="Amount (USD)" htmlFor="pay-amount" required>
              <Input id="pay-amount" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField label="Memo" htmlFor="pay-memo">
              <Input id="pay-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Create link</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
