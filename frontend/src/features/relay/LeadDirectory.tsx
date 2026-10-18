import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, EmptyState, Input, Select } from "../../components/Primitives";
import { Avatar } from "../../components/Avatar";
import { StatusChip } from "../../components/StatusChip";
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
  const pageSize = 8;

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
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-primary">Customer management</p>
          <h1 className="text-2xl font-semibold">Lead records</h1>
          <p className="mt-1 text-sm text-text-muted">Ownership, source, and acknowledgement deadlines in one view.</p>
        </div>
        <Link to="/relay" className="inline-flex h-10 items-center rounded-control border border-border-strong px-3 text-sm font-medium text-text hover:bg-neutral-bg">Open live relay</Link>
      </header>

      <section className="mb-4 rounded-card border border-border bg-surface p-3 sm:p-4" aria-label="Lead filters">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="lead-view">Saved view</label>
          <Select id="lead-view" value={selectedView} onChange={(event) => applyView(event.target.value)} className="w-auto min-w-40">
            <option value="all">All leads</option>
            <option value="attention">Needs attention</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="recovery">In recovery</option>
            {selectedView === "custom" && <option value="custom" disabled>Custom filters</option>}
            {savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
          </Select>
          <Input aria-label="Search leads" placeholder="Search name, phone, source…" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedView("custom"); setPage(0); }} className="min-w-48 flex-1 sm:max-w-xs" />
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
        </div>
        {saveOpen && (
          <form onSubmit={saveView} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div className="min-w-48 flex-1 sm:max-w-xs">
              <label htmlFor="saved-view-name" className="mb-1 block text-xs font-medium">Name this view</label>
              <Input id="saved-view-name" autoFocus value={viewName} onChange={(event) => setViewName(event.target.value)} maxLength={40} placeholder="My overdue leads" required />
            </div>
            <Button type="submit" disabled={!viewName.trim()}>Save view</Button>
            <Button type="button" variant="tertiary" onClick={() => setSaveOpen(false)}>Cancel</Button>
          </form>
        )}
      </section>

      <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
        <span>{filtered.length} lead{filtered.length === 1 ? "" : "s"}</span>
        {selectedView === "custom" && <button type="button" onClick={() => applyView("all")} className="underline underline-offset-2">Clear filters</button>}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        {rows.length === 0 ? <EmptyState title="No leads match this view." body="Adjust the filters or choose another saved view." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-neutral-bg/70 text-left text-xs text-text-muted">
                <tr>{["Lead", "Source", "Opportunity", "Owner", "Status", "Acknowledgement", "Last activity", "Action"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((lead) => {
                  const owner = team.find((member) => member.id === lead.ownerId);
                  const contact = lead.contactId ? contacts.find((person) => person.id === lead.contactId) : undefined;
                  const opportunity = contact ? opportunities.find((item) => item.contactId === contact.id) : undefined;
                  const lastActivity = timelines[lead.id]?.at(-1)?.at ?? lead.ackedAt ?? lead.createdAt;
                  const canAcknowledge = session?.userId === lead.ownerId && (lead.status === "waiting" || lead.status === "escalated");
                  return (
                    <tr key={lead.id} className="border-t border-border/80 transition-colors hover:bg-neutral-bg/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5"><Avatar name={lead.name} color={owner?.avatarColor ?? "var(--neutral-text)"} size={34} /><div className="min-w-0"><p className="font-medium text-text">{contact ? <Link to={`/contacts/${contact.id}`} className="hover:text-primary hover:underline">{lead.name}</Link> : lead.name}</p><p className="text-xs text-text-muted">{lead.phone}</p></div></div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{lead.source}</td>
                      <td className="px-4 py-3 text-text-muted">{opportunity?.title ?? "—"}</td>
                      <td className="px-4 py-3"><span className="text-text">{owner?.name ?? "Unassigned"}</span><p className="text-xs text-text-muted">Level {lead.level}</p></td>
                      <td className="px-4 py-3"><StatusChip kind={lead.status} /></td>
                      <td className="px-4 py-3"><Deadline lead={lead} /></td>
                      <td className="px-4 py-3 text-xs text-text-muted" title={new Date(lastActivity).toLocaleString()}>{relativeTime(lastActivity)}</td>
                      <td className="px-4 py-3">
                        {canAcknowledge ? <Button onClick={() => acknowledge(lead)} className="h-9 px-3">Acknowledge</Button> : <Link to="/relay" className="inline-flex h-9 items-center px-2 text-xs font-medium text-primary hover:underline">Open relay</Link>}
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
