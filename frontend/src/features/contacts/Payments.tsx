import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, FormField, Input, Select } from "../../components/Primitives";
import { FilterBar, KpiTile, Notice, PageHeader, StatusBadge, Tooltip } from "../../components/DesignSystem";
import { ExternalLink } from "../../components/ExternalLink";
import { money } from "../../lib/format";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/icons";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";

export default function Payments() {
  const { payments, contacts } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const canManage = !session || has({ role: session.role }, "payments.manage");
  const canSeeValues = canManage;
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
  const collected = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amountCents, 0);
  const pending = payments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + payment.amountCents, 0);
  const createdLabel = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)).replace(/, (?=[^,]*$)/, " · ");

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

  return <div className="page-content">
    <PageHeader eyebrow="Communication" title="Payments" subtitle="Payment links and collection status from connected records." actions={canManage ? <Button onClick={() => setCreateOpen((open) => !open)}>Create payment link</Button> : <Tooltip content="Ask a workspace owner for payment access"><span><Button disabled>Create payment link</Button></span></Tooltip>} />
    {!canManage && <Notice variant="restricted" className="mb-4" title="Restricted">Payment details are limited for your role. Ask a workspace owner for payment access.</Notice>}
    <div className="company-summary-strip payment-kpi-strip">
      <KpiTile label="Collected" value={canSeeValues ? money(collected) : <span className="restricted-value"><Icon name="lock" size={14} />Restricted</span>} icon="payments" tone="success" helper="Successfully paid" />
      <KpiTile label="Pending" value={canSeeValues ? money(pending) : <span className="restricted-value"><Icon name="lock" size={14} />Restricted</span>} icon="clock" tone="warning" helper="Awaiting payment" />
      <KpiTile label="Total links" value={payments.length} icon="copy" tone="info" helper="Created in this workspace" />
    </div>
    {createOpen && <Card className="mb-4 p-4"><form onSubmit={create} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
      <FormField label="Contact" htmlFor="payment-contact" required><Select id="payment-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</Select></FormField>
      <FormField label="Amount (USD)" htmlFor="payment-amount" required><Input id="payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FormField>
      <FormField label="Memo" htmlFor="payment-memo" required><Input id="payment-memo" value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={100} required /></FormField>
      <div className="flex gap-2"><Button type="submit" disabled={!contactId || Number(amount) <= 0 || !memo.trim()}>Create link</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
    </form><p className="mt-3 text-xs text-text-muted">The payment provider must be connected before a live link can be created.</p></Card>}

    <FilterBar className="mb-3"><Input aria-label="Search payments" placeholder="Search customer or memo…" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1 sm:max-w-[360px]" /><Select aria-label="Filter payments by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["pending", "paid", "failed", "expired", "refunded"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</Select></FilterBar>
    <div className="data-table-card payment-table">
      {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Customer", "Memo", "Amount", "Status", "Created", "Link"].map((label) => <th key={label} scope="col" className={label === "Amount" ? "text-right" : ""}>{label}</th>)}</tr></thead><tbody>{rows.map((payment) => {
        const contact = contacts.find((person) => person.id === payment.contactId);
        return <tr key={payment.id}>
          <td data-label="Customer">{contact ? <div className="table-person"><Avatar name={contact.name} size={30} /><Link to={`/contacts/${contact.id}`} className="app-link truncate font-medium">{contact.name}</Link></div> : <span className="text-text-muted">Contact unavailable</span>}</td>
          <td data-label="Memo">{payment.memo}</td>
          <td data-label="Amount" className="text-right font-mono-tab">{canSeeValues ? money(payment.amountCents) : <span className="restricted-value" title="Ask a workspace owner for payment access"><Icon name="lock" size={13} />Restricted</span>}</td>
          <td data-label="Status"><StatusBadge label={payment.status[0].toUpperCase() + payment.status.slice(1)} /></td>
          <td data-label="Created"><time className="text-xs text-text-muted" dateTime={payment.createdAt}>{createdLabel(payment.createdAt)}</time></td>
          <td data-label="Link">{canManage ? <div className="flex items-center gap-1"><ExternalLink href={payment.url} className="ui-button ui-button--ghost ui-button--sm">Open</ExternalLink><button type="button" onClick={() => copy(payment.url, payment.id)} className="ui-button ui-button--ghost ui-button--sm">{copiedId === payment.id ? "Copied" : "Copy link"}</button></div> : <Tooltip content="Ask a workspace owner for payment access"><span><Button size="sm" variant="ghost" disabled leadingIcon={<Icon name="lock" size={13} />}>Copy link</Button></span></Tooltip>}</td>
        </tr>;
      })}</tbody></table></div> : <EmptyState title="No payments match these filters." body={payments.length ? "Try another search or status." : "Payment links will be listed here when they are created for a contact."} />}
      {rows.length > 0 && <div className="data-table-footer"><span aria-live="polite">Showing 1–{rows.length} of {rows.length} payment links</span></div>}
    </div>
  </div>;
}
