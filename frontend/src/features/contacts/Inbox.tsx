import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { Card, EmptyState, Input, Select } from "../../components/Primitives";
import { StatusChip } from "../../components/StatusChip";
import { relativeTime } from "../../lib/format";
import { useStoreState } from "../../state/useStore";

export default function Inbox() {
  const { messages, contacts, team } = useStoreState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const threads = useMemo(() => contacts.map((contact) => {
    const history = messages.filter((message) => message.contactId === contact.id).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { contact, latest: history[0], count: history.length };
  }).filter(({ contact, latest }) => {
    if (!latest) return false;
    if (filter === "failed" && latest.status !== "failed") return false;
    if (filter === "inbound" && latest.direction !== "in") return false;
    if (filter === "outbound" && latest.direction !== "out") return false;
    return `${contact.name} ${contact.phone} ${latest.body}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(b.latest!.at).getTime() - new Date(a.latest!.at).getTime()), [contacts, filter, messages, query]);

  return <div className="p-4 sm:p-6">
    <header className="mb-5"><p className="mb-1 text-xs font-medium text-primary">Communication</p><h1 className="text-2xl font-semibold">Conversations</h1><p className="mt-1 text-sm text-text-muted">A shared inbox for customer messages and delivery status.</p></header>
    <div className="mb-4 flex flex-wrap gap-2"><Input aria-label="Search conversations" placeholder="Search a person or message…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-52 flex-1 sm:max-w-sm" /><Select aria-label="Filter conversations" value={filter} onChange={(event) => setFilter(event.target.value)} className="w-auto"><option value="all">All threads</option><option value="inbound">Latest from customer</option><option value="outbound">Latest from team</option><option value="failed">Needs retry</option></Select></div>
    <Card className="overflow-hidden">
      {threads.length ? <ul className="divide-y divide-border">{threads.map(({ contact, latest, count }) => {
        if (!latest) return null;
        const owner = team.find((member) => member.id === contact.ownerId);
        return <li key={contact.id}><Link to={`/contacts/${contact.id}`} className="flex min-h-[5.25rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-bg/60 focus-visible:bg-neutral-bg/60">
          <Avatar name={contact.name} color={owner?.avatarColor ?? "var(--neutral-text)"} size={42} />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><span className="font-semibold text-text">{contact.name}</span><span className="text-xs text-text-muted">{contact.phone}</span></div><p className="mt-1 truncate text-sm text-text-muted">{latest.direction === "out" ? "You: " : ""}{latest.body}</p><p className="mt-1 text-[11px] text-text-muted">{owner?.name ?? "Unassigned"} · {count} messages · {relativeTime(latest.at)}</p></div>
          <div className="flex shrink-0 flex-col items-end gap-2">{latest.status === "failed" ? <StatusChip kind="failed" /> : <span className="text-xs text-text-muted">{latest.direction === "in" ? "Customer" : "Team"}</span>}<span className="text-[11px] text-text-muted">Open thread ›</span></div>
        </Link></li>;
      })}</ul> : <EmptyState title="No conversation threads found." body={messages.length ? "Try a different search or filter." : "Messages will appear here as customers and your team start conversations."} />}
      {threads.length > 0 && <div className="border-t border-border px-4 py-3 text-xs text-text-muted">{threads.length} active thread{threads.length === 1 ? "" : "s"} · open a thread to reply, retry failed messages, or review the customer profile.</div>}
    </Card>
    <div className="mt-4 flex items-start gap-3 rounded-card border border-warning/30 bg-warning-bg/50 p-3 text-xs text-warning-text"><span aria-hidden>ⓘ</span><p>Delivery state is shown from the available message record. A thread has no separate unread state until the connected messaging service supplies one.</p></div>
  </div>;
}
