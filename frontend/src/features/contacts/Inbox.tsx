import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { Button, EmptyState, Input } from "../../components/Primitives";
import { Notice, PageHeader, SegmentedTabs, StatusBadge } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
import { relativeTime } from "../../lib/format";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { Conversation } from "./Conversation";

export default function Inbox() {
  const { messages, contacts, team } = useStoreState();
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(true);

  const threads = useMemo(() => contacts.map((contact) => {
    const history = messages.filter((message) => message.contactId === contact.id).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { contact, latest: history[0], count: history.length };
  }).filter(({ contact, latest }) => {
    if (!latest) return false;
    if (filter === "failed" && latest.status !== "failed") return false;
    if (filter === "mine" && contact.ownerId !== session?.userId) return false;
    return `${contact.name} ${contact.phone} ${latest.body}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(b.latest!.at).getTime() - new Date(a.latest!.at).getTime()), [contacts, filter, messages, query, session?.userId]);
  const selected = threads.find((thread) => thread.contact.id === selectedId);

  return <div className="page-content">
    <div className="inbox-page-heading"><PageHeader eyebrow="Communication" title="Conversations" subtitle="A focused inbox for customer messages and delivery status." /></div>
    {showNotice && <Notice variant="info" className="mb-4" onDismiss={() => setShowNotice(false)}>Delivery state reflects the available message record. Unread status appears when the connected messaging service provides it.</Notice>}
    <div className="inbox-workspace">
      <section className="inbox-list-pane" aria-label="Conversation threads">
        <div className="inbox-list-toolbar"><Input aria-label="Search conversations" placeholder="Search a person or message…" value={query} onChange={(event) => setQuery(event.target.value)} /><SegmentedTabs className="inbox-filter-tabs" ariaLabel="Filter conversations" value={filter} onChange={setFilter} tabs={[{ value: "all", label: "All" }, { value: "failed", label: "Failed" }, { value: "mine", label: "Mine" }]} /></div>
        {threads.length ? <ul className="inbox-thread-list">{threads.map(({ contact, latest, count }) => {
          if (!latest) return null;
          const owner = team.find((member) => member.id === contact.ownerId);
          const isFailed = latest.status === "failed";
          return <li key={contact.id} className="inbox-thread-item">
            <button type="button" className="inbox-thread-select" aria-pressed={selectedId === contact.id} onClick={() => setSelectedId(contact.id)}>
              <Avatar name={contact.name} color={owner?.avatarColor} size={36} />
              <span className="inbox-thread-copy"><span className="inbox-thread-heading"><strong>{contact.name}</strong><time title={new Date(latest.at).toLocaleString()}>{relativeTime(latest.at)}</time></span><span className="inbox-thread-preview"><span>{latest.direction === "out" ? "You:" : "Customer:"}</span> {latest.body}</span><span className="inbox-thread-meta">{count} {count === 1 ? "message" : "messages"} · {owner?.name ?? "Unassigned"}</span></span>
              {isFailed ? <StatusBadge label="Failed" tone="danger" /> : <span className="inbox-delivery-dot" title={`Latest message ${latest.status}`} aria-label={`Latest message ${latest.status}`} />}
            </button>
            <Link className="inbox-mobile-open" to={`/contacts/${contact.id}`} aria-label={`Open conversation with ${contact.name}`}><Icon name="arrow-right" size={15} /></Link>
            {isFailed && <Button size="sm" variant="ghost" className="inbox-retry" onClick={() => store.retryMessage(latest.id)}>Retry</Button>}
          </li>;
        })}</ul> : <EmptyState title="No conversation threads found" body={messages.length ? "Try a different search or filter." : "Messages will appear here as customers and your team start conversations."} />}
        <div className="inbox-list-footer">{threads.length} active {threads.length === 1 ? "thread" : "threads"}</div>
      </section>
      <section className="inbox-preview-pane" aria-label="Selected conversation">
        {selected ? <><header className="inbox-preview-heading"><Avatar name={selected.contact.name} size={36} /><div><h2>{selected.contact.name}</h2><p>{selected.contact.phone}</p></div><Link to={`/contacts/${selected.contact.id}`} className="ui-button ui-button--ghost ui-button--sm">Contact details</Link></header><Conversation contactId={selected.contact.id} optedOut={selected.contact.optedOut} /></> : <EmptyState title="Select a conversation" body="Choose a customer thread to review the full message history and reply." action={<Icon name="message" size={22} />} />}
      </section>
    </div>
  </div>;
}
