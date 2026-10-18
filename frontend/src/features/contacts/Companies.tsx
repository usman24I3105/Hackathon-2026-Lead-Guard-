import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { Button, Card, EmptyState, FormField, Input } from "../../components/Primitives";
import { maskedMoney, relativeTime } from "../../lib/format";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";

export function Companies() {
  const { companies, contacts, opportunities } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const canManage = !session || has({ role: session.role }, "contacts.manage");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const filtered = companies.filter((company) => company.name.toLowerCase().includes(query.toLowerCase()));

  function create(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !name.trim()) return;
    try {
      const company = store.createCompany({ name, contactIds });
      push(`Created ${company.name}.`, "success");
      setName(""); setContactIds([]); setCreateOpen(false);
    } catch (error) {
      push(error instanceof Error ? error.message : "Company records are unavailable in this workspace.", "error");
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="mb-1 text-xs font-medium text-primary">Customer management</p><h1 className="text-2xl font-semibold">Companies</h1><p className="mt-1 text-sm text-text-muted">Keep people, opportunities, and account history together.</p></div>
        <Button onClick={() => setCreateOpen((open) => !open)} disabled={!canManage}>Add company</Button>
      </header>

      {!canManage && <p className="mb-4 rounded-control border border-border bg-neutral-bg px-3 py-2 text-xs text-text-muted">You can review company records. Contact management permission is needed to create or edit account relationships.</p>}

      {createOpen && canManage && (
        <Card className="mb-4 p-4">
          <form onSubmit={create} className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_minmax(16rem,1fr)_auto] md:items-end">
            <FormField label="Company name" htmlFor="company-name" required><Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus required placeholder="Northstar Homes" /></FormField>
            <fieldset className="min-w-0"><legend className="mb-1.5 text-sm font-medium">Associate contacts</legend><div className="max-h-36 overflow-y-auto rounded-control border border-border p-2">
              {contacts.map((contact) => <label key={contact.id} className="flex min-h-9 items-center gap-2 px-1 text-sm"><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={(event) => setContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />{contact.name}</label>)}
            </div></fieldset>
            <div className="flex gap-2"><Button type="submit" disabled={!name.trim()}>Save company</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
          </form>
        </Card>
      )}

      <div className="mb-4 max-w-sm"><Input aria-label="Search companies" placeholder="Search companies…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {filtered.length === 0 ? <EmptyState title={query ? "No companies match that search." : "No company records yet."} body={query ? "Try a shorter name or clear your search." : "Companies will appear here when the connected workspace provides company records."} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((company) => {
            const people = company.contactIds.map((id) => contacts.find((contact) => contact.id === id)).filter((person) => person != null);
            const related = opportunities.filter((opportunity) => company.contactIds.includes(opportunity.contactId));
            const openValue = related.reduce((total, opportunity) => total + (opportunity.valueCents ?? 0), 0);
            const canSeeValue = !session || has({ role: session.role }, "pipeline.manage");
            return <Link key={company.id} to={`/companies/${company.id}`} className="group rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Card className="h-full p-4 transition-[border-color,transform] duration-150 group-hover:-translate-y-0.5 group-hover:border-primary/40">
                <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-text group-hover:text-primary">{company.name}</h2><p className="mt-1 text-xs text-text-muted">Added {relativeTime(company.createdAt)}</p></div><span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">{people.length} contact{people.length === 1 ? "" : "s"}</span></div>
                <div className="flex -space-x-2" aria-label={`${people.length} associated contacts`}>
                  {people.slice(0, 4).map((person) => <Avatar key={person.id} name={person.name} size={30} color="var(--primary)" title={person.name} />)}
                  {!people.length && <span className="text-xs text-text-muted">No contacts linked</span>}
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-border pt-3"><div><p className="text-xs text-text-muted">Opportunities</p><p className="mt-0.5 text-sm font-semibold">{related.length}</p></div><div className="text-right"><p className="text-xs text-text-muted">Pipeline value</p><p className="mt-0.5 font-mono-tab text-sm font-semibold">{related.length ? maskedMoney(openValue, canSeeValue) : "—"}</p></div></div>
              </Card>
            </Link>;
          })}
        </div>
      )}
    </div>
  );
}

export function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { companies, contacts, opportunities, stages, team } = useStoreState();
  const { session } = useAuth();
  const company = companies.find((item) => item.id === id);
  if (!company) return <div className="p-6"><EmptyState title="Company not found." body="This account may have been removed or is not available in this workspace." action={<Link to="/companies" className="font-medium text-primary underline">Back to companies</Link>} /></div>;

  const people = company.contactIds.map((contactId) => contacts.find((contact) => contact.id === contactId)).filter((person) => person != null);
  const deals = opportunities.filter((opportunity) => company.contactIds.includes(opportunity.contactId));
  const canSeeValue = !session || has({ role: session.role }, "pipeline.manage");

  return <div className="p-4 sm:p-6">
    <Link to="/companies" className="mb-4 inline-flex text-sm text-text-muted underline underline-offset-2">← Companies</Link>
    <header className="mb-6 flex flex-wrap items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><span className="text-xl font-semibold">{company.name.slice(0, 1).toUpperCase()}</span></span><div><p className="mb-1 text-xs font-medium text-primary">Company profile</p><h1 className="text-2xl font-semibold">{company.name}</h1><p className="mt-1 text-sm text-text-muted">{people.length} associated contact{people.length === 1 ? "" : "s"} · Added {relativeTime(company.createdAt)}</p></div></header>
    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.5fr)]">
      <Card className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">People</h2><span className="text-xs text-text-muted">{people.length}</span></div>
        {people.length ? <ul className="divide-y divide-border">{people.map((person) => { const owner = team.find((member) => member.id === person.ownerId); return <li key={person.id} className="flex items-center gap-3 py-3 first:pt-1"><Avatar name={person.name} color={owner?.avatarColor ?? "var(--neutral-text)"} /><div className="min-w-0 flex-1"><Link to={`/contacts/${person.id}`} className="text-sm font-medium text-text hover:text-primary hover:underline">{person.name}</Link><p className="text-xs text-text-muted">{person.phone} · {owner?.name ?? "Unassigned"}</p></div></li>; })}</ul> : <p className="py-5 text-sm text-text-muted">No contacts are associated with this company.</p>}
      </Card>
      <Card className="overflow-hidden"><div className="flex items-center justify-between px-4 py-3"><h2 className="font-semibold">Opportunities</h2><span className="text-xs text-text-muted">{deals.length} total</span></div>
        {deals.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-neutral-bg/70 text-left text-xs text-text-muted"><tr><th className="px-4 py-2.5 font-medium">Opportunity</th><th className="px-4 py-2.5 font-medium">Contact</th><th className="px-4 py-2.5 font-medium">Stage</th><th className="px-4 py-2.5 text-right font-medium">Value</th></tr></thead><tbody>{deals.map((deal) => <tr key={deal.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{deal.title}</td><td className="px-4 py-3"><Link to={`/contacts/${deal.contactId}`} className="text-primary hover:underline">{contacts.find((contact) => contact.id === deal.contactId)?.name ?? "Contact"}</Link></td><td className="px-4 py-3 text-text-muted">{stages.find((stage) => stage.id === deal.stageId)?.name ?? "Unknown"}</td><td className="px-4 py-3 text-right font-mono-tab">{maskedMoney(deal.valueCents, canSeeValue)}</td></tr>)}</tbody></table></div> : <EmptyState title="No opportunities yet." body="Related opportunities will appear here as the account progresses." />}
        <div className="border-t border-border px-4 py-3"><Link to="/opportunities" className="text-sm font-medium text-primary hover:underline">Open opportunity list</Link></div>
      </Card>
    </div>
  </div>;
}
