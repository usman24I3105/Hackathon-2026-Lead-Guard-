import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar, AvatarStack } from "../../components/Avatar";
import { Button, Card, EmptyState, FormField, Input, Select } from "../../components/Primitives";
import { FilterBar, KpiTile, Notice, PageHeader, StatusBadge, Tooltip } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
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
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const filtered = companies.filter((company) => company.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    <div className="page-content">
      <PageHeader eyebrow="Customer management" title="Companies" subtitle="Keep people, opportunities, and account history together." actions={canManage ? <Button onClick={() => setCreateOpen((open) => !open)}>Add company</Button> : <Tooltip content="You need contacts.manage permission to add a company"><span><Button disabled>Add company</Button></span></Tooltip>} />

      {!canManage && <Notice variant="restricted" className="mb-4" title="Read-only">You can review company records. Contact management permission is needed to create or edit account relationships.</Notice>}

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

      <FilterBar className="mb-3">
        <Input aria-label="Search companies" placeholder="Search companies…" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1 sm:max-w-[360px]" />
        <Select aria-label="Sort companies" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently added</option><option value="name">Name A–Z</option></Select>
        <div className="view-toggle" aria-label="Company view"><button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view"><Icon name="dashboard" size={16} /></button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view"><Icon name="list" size={16} /></button></div>
      </FilterBar>
      {filtered.length === 0 ? <div className="data-table-card"><EmptyState title={query ? "No companies match that search." : "No company records yet."} body={query ? "Try a shorter name or clear your search." : "Companies will appear here when the connected workspace provides company records."} /></div> : (
        <div className={view === "grid" ? "company-grid" : "company-grid company-grid--list"}>
          {filtered.map((company) => {
            const people = company.contactIds.map((id) => contacts.find((contact) => contact.id === id)).filter((person) => person != null);
            const related = opportunities.filter((opportunity) => company.contactIds.includes(opportunity.contactId));
            const openValue = related.reduce((total, opportunity) => total + (opportunity.valueCents ?? 0), 0);
            const canSeeValue = !session || has({ role: session.role }, "pipeline.manage");
            return <Link key={company.id} to={`/companies/${company.id}`} className="company-card-link">
              <Card className="company-card">
                <div className="company-card-head"><span className="company-initial">{company.name.trim().slice(0, 1).toUpperCase() || "C"}</span><div className="min-w-0 flex-1"><h2 title={company.name}>{company.name}</h2><p>Added {relativeTime(company.createdAt)}</p></div><StatusBadge label={`${people.length} ${people.length === 1 ? "contact" : "contacts"}`} tone="neutral" icon="contacts" /></div>
                <div className="company-card-people">{people.length ? <AvatarStack people={people.map((person) => ({ id: person.id, name: person.name }))} max={4} size={30} title={`${people.length} associated contacts`} /> : <span className="text-xs text-text-muted">No contacts linked</span>}</div>
                <div className="company-card-stats"><div><span>Opportunities</span><strong>{related.length}</strong></div><div><span>Pipeline value</span><strong>{canSeeValue ? (related.length ? maskedMoney(openValue, true) : "—") : <span className="restricted-value" title="Ask a workspace owner for pipeline access"><Icon name="lock" size={13} />Restricted</span>}</strong></div></div>
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
  const canManage = !session || has({ role: session.role }, "contacts.manage");
  const company = companies.find((item) => item.id === id);
  if (!company) return <div className="page-content"><div className="data-table-card"><EmptyState title="Company not found." body="This account may have been removed or is not available in this workspace." action={<Link to="/companies" className="app-link">Back to companies</Link>} /></div></div>;

  const people = company.contactIds.map((contactId) => contacts.find((contact) => contact.id === contactId)).filter((person) => person != null);
  const deals = opportunities.filter((opportunity) => company.contactIds.includes(opportunity.contactId));
  const canSeeValue = !session || has({ role: session.role }, "pipeline.manage");

  return <div className="page-content">
    <PageHeader eyebrow="Company profile" title={<span className="profile-title"><span className="company-profile-mark">{company.name.trim().slice(0, 1).toUpperCase() || "C"}</span><span>{company.name}</span></span>} subtitle={`${people.length} associated ${people.length === 1 ? "contact" : "contacts"} · Added ${relativeTime(company.createdAt)}`} breadcrumb={<Link to="/companies" className="app-link">Companies / {company.name}</Link>} actions={<Tooltip content={canManage ? "Company editing is not available in this workspace." : "You need contacts.manage permission to edit companies."}><span><Button variant="secondary" disabled>Edit</Button></span></Tooltip>} />
    <div className="company-summary-strip">
      <KpiTile label="Contacts" value={people.length} icon="contacts" tone="info" helper="Associated people" />
      <KpiTile label="Open opportunities" value={deals.length} icon="opportunities" tone="neutral" helper="Across linked contacts" />
      <KpiTile label="Pipeline value" value={canSeeValue ? maskedMoney(deals.reduce((sum, deal) => sum + (deal.valueCents ?? 0), 0), true) : <span className="restricted-value"><Icon name="lock" size={14} />Restricted</span>} icon="payments" tone="success" helper="Current associated pipeline" />
      <KpiTile label="Last activity" value={relativeTime(company.createdAt)} icon="activity" tone="neutral" helper={new Date(company.createdAt).toLocaleString()} />
    </div>
    <div className="company-profile-grid">
      <Card className="company-profile-card"><div className="company-profile-card-head"><div><h2>People</h2><p>Contacts associated with this company</p></div><StatusBadge label={String(people.length)} tone="neutral" icon="contacts" /></div>
        {people.length ? <ul className="company-people-list">{people.map((person) => { const owner = team.find((member) => member.id === person.ownerId); return <li key={person.id}><Avatar name={person.name} color={owner?.avatarColor} size={32} /><div className="min-w-0 flex-1"><Link to={`/contacts/${person.id}`} className="app-link block truncate text-sm font-medium">{person.name}</Link><p className="truncate text-xs text-text-muted"><a className="app-link font-mono-tab" href={`tel:${person.phone}`}>{person.phone}</a> · {owner?.name ?? "Unassigned"}</p></div></li>; })}</ul> : <EmptyState title="No contacts linked" body="Associated people will appear here." />}
      </Card>
      <Card className="company-profile-card overflow-hidden"><div className="company-profile-card-head"><div><h2>Opportunities</h2><p>Work in progress across linked contacts</p></div><StatusBadge label={`${deals.length} total`} tone="neutral" icon="opportunities" /></div>
        {deals.length ? <div className="company-opportunity-table data-table-card"><table className="w-full text-sm"><thead><tr>{["Opportunity", "Contact", "Stage", "Value"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{deals.map((deal) => <tr key={deal.id}><td data-label="Opportunity" className="font-medium">{deal.title}</td><td data-label="Contact"><Link to={`/contacts/${deal.contactId}`} className="app-link">{contacts.find((contact) => contact.id === deal.contactId)?.name ?? "Contact unavailable"}</Link></td><td data-label="Stage"><StatusBadge label={stages.find((stage) => stage.id === deal.stageId)?.name ?? "Unknown"} tone="neutral" /></td><td data-label="Value" className="text-right font-mono-tab">{canSeeValue ? maskedMoney(deal.valueCents, true) : <span className="restricted-value"><Icon name="lock" size={13} />Restricted</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="No opportunities yet" body="Related opportunities will appear here as the account progresses." />}
        <div className="company-profile-footer"><Link to="/opportunities" className="ui-button ui-button--ghost ui-button--md"><span className="ui-button-content">Open opportunity list <Icon name="arrow-up-right" size={15} /></span></Link></div>
      </Card>
    </div>
  </div>;
}
