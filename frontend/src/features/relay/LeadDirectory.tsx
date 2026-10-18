import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Input, Select } from "../../components/Primitives";
import { Avatar } from "../../components/Avatar";
import { FilterBar, PageHeader, SegmentedTabs, StatusBadge } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
import { useCountdown, formatMmSs } from "../../lib/useCountdown";
import { relativeTime } from "../../lib/format";
import { store, useStoreState } from "../../state/useStore";
import { useAuth } from "../../state/AuthContext";
import { useToast } from "../../state/ToastContext";
import type { Lead, LeadStatus } from "../../mock/types";

type SavedLeadView = { id: string; name: string; status: string; ownerId: string; query: string; sort: string };
const SAVED_KEY = "leadguard-lead-views";

function readSavedViews(): SavedLeadView[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is SavedLeadView => !!entry && typeof entry === "object" && "id" in entry && "name" in entry) : [];
  } catch {
    return [];
  }
}

const LABELS: Record<LeadStatus, string> = {
  waiting: "Awaiting acknowledgement",
  escalated: "Escalated",
  acknowledged: "Acknowledged",
  overdue: "Overdue",
  recovery: "In recovery",
};

function Deadline({ lead }: { lead: Lead }) {
  const left = useCountdown(lead.ackDeadline);
  if (lead.status === "acknowledged") return <span className="text-text-muted">Acknowledged</span>;
  if (left <= 0) return <span className="font-medium text-warning-text" title="The server decides when an escalation occurs">Deadline passed</span>;
  return <span className={`font-mono-tab ${left <= 5 ? "text-warning-text" : "text-text"}`} title="Informational countdown; the server is authoritative">{formatMmSs(left)}</span>;
}

export default function LeadDirectory() {
  const { leads, team, contacts, opportunities, timelines } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [ownerId, setOwnerId] = useState("all");
  const [sort, setSort] = useState("deadline");
  const [page, setPage] = useState(0);
  const [savedViews, setSavedViews] = useState(readSavedViews);
  const [selectedView, setSelectedView] = useState("all");
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const pageSize = 25;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (status === "attention" && !["waiting", "escalated", "overdue", "recovery"].includes(lead.status)) return false;
      if (status !== "all" && status !== "attention" && lead.status !== status) return false;
      if (ownerId !== "all" && lead.ownerId !== ownerId) return false;
      if (needle && !`${lead.name} ${lead.phone} ${lead.source} ${lead.message}`.toLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(a.ackDeadline).getTime() - new Date(b.ackDeadline).getTime();
    });
  }, [leads, ownerId, query, sort, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const rows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  function applyView(id: string) {
    setSelectedView(id);
    if (id === "all") { setStatus("all"); setOwnerId("all"); setQuery(""); setSort("deadline"); }
    if (id === "attention") { setStatus("attention"); setOwnerId("all"); setQuery(""); setSort("deadline"); }
    if (id === "escalated") { setStatus("escalated"); setOwnerId("all"); setQuery(""); setSort("deadline"); }
    if (id === "mine") { setStatus("all"); setOwnerId(session?.userId ?? "all"); setQuery(""); setSort("deadline"); }
    if (id === "acknowledged") { setStatus("acknowledged"); setOwnerId("all"); setQuery(""); setSort("newest"); }
    if (id === "recovery") { setStatus("recovery"); setOwnerId("all"); setQuery(""); setSort("newest"); }
    const saved = savedViews.find((view) => view.id === id);
    if (saved) { setStatus(saved.status); setOwnerId(saved.ownerId); setQuery(saved.query); setSort(saved.sort); }
    setPage(0);
  }

  function saveView(event: FormEvent) {
    event.preventDefault();
    const name = viewName.trim();
    if (!name) return;
    const next = [...savedViews, { id: `view-${Date.now()}`, name, status, ownerId, query, sort }];
    setSavedViews(next);
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setViewName("");
    setSaveOpen(false);
    setSelectedView(next.at(-1)!.id);
    push(`Saved view “${name}”.`, "success");
  }

  function acknowledge(lead: Lead) {
    if (!session || lead.ownerId !== session.userId) return;
    store.acknowledgeLead(lead.id, session.userId);
    push(`Acknowledged ${lead.name}.`, "success");
  }

  return (
    <div className="page-content">
      <PageHeader eyebrow="Customer management" title="Lead records" subtitle="Ownership, source, and acknowledgement deadlines in one view." actions={<Link to="/relay" className="ui-button ui-button--secondary ui-button--lg"><span className="ui-button-content">Open live relay <Icon name="arrow-up-right" size={15} /></span></Link>} />

      <FilterBar className="mb-3">
          <Input aria-label="Search leads" placeholder="Search name, phone, source…" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedView("custom"); setPage(0); }} className="min-w-48 flex-1 sm:max-w-[360px]" />
          <Select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setSelectedView("custom"); setPage(0); }} className="w-auto">
            <option value="all">Any status</option>
            <option value="attention">Needs attention</option>
            {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select aria-label="Filter by owner" value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setSelectedView("custom"); setPage(0); }} className="w-auto">
            <option value="all">Any owner</option>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </Select>
          <Select aria-label="Sort leads" value={sort} onChange={(event) => { setSort(event.target.value); setSelectedView("custom"); setPage(0); }} className="w-auto">
            <option value="deadline">Soonest deadline</option><option value="newest">Newest first</option><option value="name">Name A–Z</option>
          </Select>
          <Button variant="secondary" onClick={() => setSaveOpen((value) => !value)}>Save view</Button>
      </FilterBar>
      <SegmentedTabs as="nav" className="saved-view-tabs" ariaLabel="Saved lead views" value={selectedView} onChange={applyView} tabs={[{ value: "all", label: "All leads" }, { value: "attention", label: "Needs attention" }, { value: "escalated", label: "Escalated" }, { value: "mine", label: "Mine" }, ...savedViews.map((view) => ({ value: view.id, label: view.name }))]} />

        {saveOpen && (
          <form onSubmit={saveView} className="mb-4 flex flex-wrap items-end gap-2 rounded-card border border-border bg-surface p-3">
            <div className="min-w-48 flex-1 sm:max-w-xs">
              <label htmlFor="saved-view-name" className="mb-1 block text-xs font-medium">Name this view</label>
              <Input id="saved-view-name" autoFocus value={viewName} onChange={(event) => setViewName(event.target.value)} maxLength={40} placeholder="My overdue leads" required />
            </div>
            <Button type="submit" disabled={!viewName.trim()}>Save view</Button>
            <Button type="button" variant="tertiary" onClick={() => setSaveOpen(false)}>Cancel</Button>
          </form>
        )}

      <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
        <span aria-live="polite">Showing {filtered.length ? currentPage * pageSize + 1 : 0}–{Math.min(filtered.length, (currentPage + 1) * pageSize)} of {filtered.length}</span>
        {selectedView === "custom" && <Button size="sm" variant="ghost" onClick={() => applyView("all")}>Clear filters</Button>}
      </div>

      <div className="data-table-card">
        {rows.length === 0 ? <EmptyState title="No leads match this view." body="Adjust the filters or choose another saved view." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>{["Lead", "Source", "Opportunity", "Owner", "Status", "Acknowledgement", "Last activity", "Action"].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((lead) => {
                  const owner = team.find((member) => member.id === lead.ownerId);
                  const contact = lead.contactId ? contacts.find((person) => person.id === lead.contactId) : undefined;
                  const opportunity = contact ? opportunities.find((item) => item.contactId === contact.id) : undefined;
                  const lastActivity = timelines[lead.id]?.at(-1)?.at ?? lead.ackedAt ?? lead.createdAt;
                  const canAcknowledge = session?.userId === lead.ownerId && (lead.status === "waiting" || lead.status === "escalated");
                  return (
                    <tr key={lead.id} className={`transition-colors ${lead.status === "escalated" ? "data-row-danger" : ""}`}>
                      <td data-label="Lead">
                        <div className="flex min-w-0 items-center gap-2.5"><Avatar name={lead.name} color={owner?.avatarColor} size={32} /><div className="min-w-0"><p className="truncate font-medium text-text">{contact ? <Link to={`/contacts/${contact.id}`} className="app-link">{lead.name}</Link> : lead.name}</p><p className="font-mono-tab text-xs text-text-muted">{lead.phone}</p></div></div>
                      </td>
                      <td data-label="Source"><span className="source-chip">{lead.source}</span></td>
                      <td data-label="Opportunity">{opportunity ? <Link className="app-link" to={`/opportunities`}>{opportunity.title}</Link> : <span className="text-text-muted">No opportunity</span>}</td>
                      <td data-label="Owner"><div className="table-person">{owner && <Avatar name={owner.name} color={owner.avatarColor} size={28} />}<span className="truncate">{owner?.name ?? "Unassigned"}</span><span className="level-badge">L{lead.level}</span></div></td>
                      <td data-label="Status"><StatusBadge label={LABELS[lead.status]} tone={lead.status === "acknowledged" ? "success" : lead.status === "waiting" ? "warning" : ["escalated", "overdue", "recovery"].includes(lead.status) ? "danger" : "neutral"} /></td>
                      <td data-label="Acknowledgement"><div className="deadline-cell"><Deadline lead={lead} /><span>SLA</span></div></td>
                      <td data-label="Last activity"><time className="text-xs text-text-muted" title={new Date(lastActivity).toLocaleString()}>{relativeTime(lastActivity)}</time></td>
                      <td data-label="Action" className="table-action-cell">
                        {canAcknowledge ? <Button size="md" onClick={() => acknowledge(lead)} leadingIcon={<Icon name="check" size={15} />}>Acknowledge</Button> : <Link to="/relay" className="ui-button ui-button--ghost ui-button--md"><span className="ui-button-content">Open relay <Icon name="arrow-up-right" size={15} /></span></Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-muted">
            <span>Showing {currentPage * pageSize + 1}–{Math.min(filtered.length, (currentPage + 1) * pageSize)} of {filtered.length}</span>
            <div className="flex gap-2"><Button variant="secondary" className="h-9 px-3" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button variant="secondary" className="h-9 px-3" disabled={currentPage >= pages - 1} onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}>Next</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
