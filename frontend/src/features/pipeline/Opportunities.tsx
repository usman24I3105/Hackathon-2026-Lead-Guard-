import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, FormField, Input, Select } from "../../components/Primitives";
import { StatusChip } from "../../components/StatusChip";
import { FillFieldModal } from "./FillFieldModal";
import { maskedMoney, relativeTime } from "../../lib/format";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";

export default function Opportunities() {
  const { contacts, opportunities, stages, team, payments } = useStoreState();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [stageId, setStageId] = useState(stages.find((stage) => !stage.isClosed)?.id ?? stages[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [blocked, setBlocked] = useState<{ oppId: string; stageId: string; missing: string[] } | null>(null);

  const filtered = useMemo(() => opportunities.filter((opportunity) => {
    if (stageFilter !== "all" && opportunity.stageId !== stageFilter) return false;
    const contact = contacts.find((person) => person.id === opportunity.contactId);
    const owner = team.find((member) => member.id === contact?.ownerId);
    return `${opportunity.title} ${contact?.name ?? ""} ${owner?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [contacts, opportunities, query, stageFilter, team]);

  function move(id: string, nextStageId: string) {
    try {
      const result = store.moveOpportunity(id, nextStageId);
      if (result.ok) push("Opportunity moved to the selected stage.", "success");
      else setBlocked({ oppId: id, stageId: nextStageId, missing: result.missing });
    } catch (error) {
      push(error instanceof Error ? error.message : "The stage could not be updated.", "error");
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !contactId || !stageId) return;
    const parsedValue = value.trim() ? Math.round(Number(value) * 100) : null;
    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) return;
    try {
      const created = store.createOpportunity({ title: title.trim(), contactId, stageId, valueCents: parsedValue });
      push(`Created “${created.title}”.`, "success");
      setTitle(""); setValue(""); setCreateOpen(false);
    } catch (error) {
      push(error instanceof Error ? error.message : "Opportunity creation is unavailable.", "error");
    }
  }

  return <div className="p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-medium text-primary">Customer management</p><h1 className="text-2xl font-semibold">Opportunities</h1><p className="mt-1 text-sm text-text-muted">Track account work from first conversation through close.</p></div><div className="flex gap-2"><Link to="/pipeline" className="inline-flex h-10 items-center rounded-control border border-border-strong px-3 text-sm font-medium hover:bg-neutral-bg">Open board</Link><Button onClick={() => setCreateOpen((open) => !open)}>Add opportunity</Button></div></header>

    {createOpen && <Card className="mb-4 p-4"><form onSubmit={create} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
      <FormField label="Opportunity name" htmlFor="opp-name" required><Input id="opp-name" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={100} autoFocus placeholder="Roof replacement — 142 Birchwood" /></FormField>
      <FormField label="Contact" htmlFor="opp-contact" required><Select id="opp-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</Select></FormField>
      <FormField label="Starting stage" htmlFor="opp-stage" required><Select id="opp-stage" value={stageId} onChange={(event) => setStageId(event.target.value)} required>{stages.filter((stage) => !stage.isClosed).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</Select></FormField>
      <div className="flex items-end gap-2"><FormField label="Value (optional)" htmlFor="opp-value"><Input id="opp-value" type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0.00" /></FormField><Button type="submit" disabled={!title.trim() || !contactId}>Save</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
    </form></Card>}

    <div className="mb-4 flex flex-wrap gap-2"><Input aria-label="Search opportunities" placeholder="Search opportunities or contacts…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-52 flex-1 sm:max-w-sm" /><Select aria-label="Filter by stage" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="w-auto"><option value="all">All stages</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</Select></div>

    <Card className="overflow-hidden">
      {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-neutral-bg/70 text-left text-xs text-text-muted"><tr><th className="px-4 py-3 font-medium">Opportunity</th><th className="px-4 py-3 font-medium">Contact & owner</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 text-right font-medium">Value</th><th className="px-4 py-3 font-medium">Payment</th><th className="px-4 py-3 font-medium">Created</th></tr></thead><tbody>{filtered.map((opportunity) => {
        const contact = contacts.find((person) => person.id === opportunity.contactId);
        const owner = team.find((member) => member.id === contact?.ownerId);
        const payment = payments.filter((item) => item.contactId === opportunity.contactId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const stage = stages.find((item) => item.id === opportunity.stageId);
        return <tr key={opportunity.id} className="border-t border-border/80 hover:bg-neutral-bg/50"><td className="px-4 py-3"><p className="font-medium">{opportunity.title}</p><p className="mt-0.5 text-xs text-text-muted">{contact?.id ? <Link to={`/contacts/${contact.id}`} className="hover:text-primary">{contact.name}</Link> : "Contact unavailable"}</p></td><td className="px-4 py-3"><p>{owner?.name ?? "Unassigned"}</p><p className="text-xs text-text-muted">Owner</p></td><td className="px-4 py-3"><label className="sr-only" htmlFor={`move-${opportunity.id}`}>Move {opportunity.title} to stage</label><Select id={`move-${opportunity.id}`} value={opportunity.stageId} onChange={(event) => move(opportunity.id, event.target.value)} className="h-9 min-w-32 py-1">{stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{stage?.isClosed && <p className="mt-1 text-[11px] text-text-muted">Closed stage</p>}</td><td className="px-4 py-3 text-right font-mono-tab">{maskedMoney(opportunity.valueCents, true)}</td><td className="px-4 py-3">{payment ? <StatusChip kind={payment.status} /> : <span className="text-xs text-text-muted">No payment</span>}</td><td className="px-4 py-3 text-xs text-text-muted" title={new Date(opportunity.createdAt).toLocaleString()}>{relativeTime(opportunity.createdAt)}</td></tr>;
      })}</tbody></table></div> : <EmptyState title="No opportunities match these filters." body="Change the filters or create a new opportunity." action={<Button onClick={() => setCreateOpen(true)}>Add opportunity</Button>} />}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-muted"><span>{filtered.length} opportunity{filtered.length === 1 ? "" : "ies"}</span><span>Stage totals are available on the pipeline board.</span></div>
    </Card>
    {blocked && <FillFieldModal oppId={blocked.oppId} stageId={blocked.stageId} missing={blocked.missing} onClose={() => setBlocked(null)} />}
  </div>;
}
