import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, FormField, Input, Select } from "../../components/Primitives";
import { StatusChip } from "../../components/StatusChip";
import { ExternalLink } from "../../components/ExternalLink";
import { money } from "../../lib/format";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";

export default function Payments() {
  const { payments, contacts } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const canManage = !session || has({ role: session.role }, "payments.manage");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [amount, setAmount] = useState("500");
  const [memo, setMemo] = useState("Deposit");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const rows = useMemo(() => payments.filter((payment) => {
    if (status !== "all" && payment.status !== status) return false;
    const contact = contacts.find((person) => person.id === payment.contactId);
    return `${payment.memo} ${contact?.name ?? ""} ${payment.id}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [contacts, payments, query, status]);

  function create(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(amount) * 100);
    if (!contactId || !Number.isFinite(cents) || cents <= 0 || !memo.trim()) return;
    try {
      store.createPaymentLink(contactId, cents, memo.trim());
      push("Payment link created.", "success");
      setCreateOpen(false); setMemo("Deposit"); setAmount("500");
    } catch (error) {
      push(error instanceof Error ? error.message : "Payment links are not connected yet.", "error");
    }
  }

  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); }
    catch { push("Copy is unavailable here. Open the payment link to copy it manually.", "error"); return; }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((value) => value === id ? null : value), 1600);
    push("Payment link copied.", "success");
  }

  return <div className="p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-medium text-primary">Communication</p><h1 className="text-2xl font-semibold">Payments</h1><p className="mt-1 text-sm text-text-muted">Payment links and collection status from connected records.</p></div><Button onClick={() => setCreateOpen((open) => !open)} disabled={!canManage}>Create payment link</Button></header>
    {!canManage && <p className="mb-4 rounded-control border border-border bg-neutral-bg px-3 py-2 text-xs text-text-muted">Payment details are limited for your role. Ask a workspace owner for payment access.</p>}
    {createOpen && <Card className="mb-4 p-4"><form onSubmit={create} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
      <FormField label="Contact" htmlFor="payment-contact" required><Select id="payment-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</Select></FormField>
      <FormField label="Amount (USD)" htmlFor="payment-amount" required><Input id="payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FormField>
      <FormField label="Memo" htmlFor="payment-memo" required><Input id="payment-memo" value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={100} required /></FormField>
      <div className="flex gap-2"><Button type="submit" disabled={!contactId || Number(amount) <= 0 || !memo.trim()}>Create link</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
    </form><p className="mt-3 text-xs text-text-muted">The payment provider must be connected before a live link can be created.</p></Card>}

    <div className="mb-4 flex flex-wrap gap-2"><Input aria-label="Search payments" placeholder="Search customer or memo…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-52 flex-1 sm:max-w-sm" /><Select aria-label="Filter payments by status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto"><option value="all">All statuses</option>{["pending", "paid", "failed", "expired", "refunded"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</Select></div>
    <Card className="overflow-hidden">
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-neutral-bg/70 text-left text-xs text-text-muted"><tr><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Memo</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3 font-medium">Link</th></tr></thead><tbody>{rows.map((payment) => { const contact = contacts.find((person) => person.id === payment.contactId); return <tr key={payment.id} className="border-t border-border/80 hover:bg-neutral-bg/50"><td className="px-4 py-3">{contact ? <Link to={`/contacts/${contact.id}`} className="font-medium text-primary hover:underline">{contact.name}</Link> : <span className="text-text-muted">Contact unavailable</span>}</td><td className="px-4 py-3">{payment.memo}</td><td className="px-4 py-3 text-right font-mono-tab">{canManage ? money(payment.amountCents) : "••••"}</td><td className="px-4 py-3"><StatusChip kind={payment.status} /></td><td className="px-4 py-3 text-xs text-text-muted">{new Date(payment.createdAt).toLocaleString()}</td><td className="px-4 py-3">{canManage ? <div className="flex items-center gap-2"><ExternalLink href={payment.url} className="text-xs text-primary underline">Open</ExternalLink><button type="button" onClick={() => copy(payment.url, payment.id)} className="text-xs text-text-muted underline">{copiedId === payment.id ? "Copied" : "Copy"}</button></div> : <span className="text-xs text-text-muted">Restricted</span>}</td></tr>; })}</tbody></table></div> : <EmptyState title="No payments match these filters." body={payments.length ? "Try another search or status." : "Payment links will be listed here when they are created for a contact."} />}
      {rows.length > 0 && <div className="border-t border-border px-4 py-3 text-xs text-text-muted">{rows.length} payment record{rows.length === 1 ? "" : "s"} shown.</div>}
    </Card>
  </div>;
}
