import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { Input, EmptyState, Select, Button, Card, FormField } from "../../components/Primitives";
import { relativeTime } from "../../lib/format";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { useToast } from "../../state/ToastContext";

export default function ContactsList() {
  const { contacts, companies, team, opportunities } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const canManage = !session || has({ role: session.role }, "contacts.manage");
  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("all");
  const [messageStatus, setMessageStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newOwnerId, setNewOwnerId] = useState(session?.userId ?? team[0]?.id ?? "");

  function createContact(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !name.trim() || !phone.trim() || !newOwnerId) return;
    try {
      const contact = store.createContact({ name, phone, ownerId: newOwnerId });
      push(`Added ${contact.name}.`, "success");
      setName(""); setPhone(""); setCreateOpen(false);
      navigate(`/contacts/${contact.id}`);
    } catch (error) {
      push(error instanceof Error ? error.message : "Contact creation is unavailable.", "error");
    }
  }

  const filtered = contacts.filter(
    (c) => {
      const companyNames = companies.filter((company) => company.contactIds.includes(c.id)).map((company) => company.name).join(" ");
      if (ownerId !== "all" && c.ownerId !== ownerId) return false;
      if (messageStatus === "opted-out" && !c.optedOut) return false;
      if (messageStatus === "messaging" && c.optedOut) return false;
      return `${c.name} ${c.phone} ${companyNames}`.toLowerCase().includes(q.toLowerCase());
    }
  );

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-ink-2">Find a person, see who owns the relationship, and open their full history.</p></div>
        {canManage && <Button onClick={() => setCreateOpen((open) => !open)}>Add contact</Button>}
      </header>

      {createOpen && canManage && <Card className="mb-4 p-4"><form onSubmit={createContact} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
        <FormField label="Name" htmlFor="new-contact-name" required><Input id="new-contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus required /></FormField>
        <FormField label="Phone" htmlFor="new-contact-phone" required><Input id="new-contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} autoComplete="tel" required /></FormField>
        <FormField label="Owner" htmlFor="new-contact-owner" required><Select id="new-contact-owner" value={newOwnerId} onChange={(event) => setNewOwnerId(event.target.value)} required>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></FormField>
        <div className="flex gap-2"><Button type="submit" disabled={!name.trim() || !phone.trim()}>Save contact</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
      </form><p className="mt-3 text-xs text-text-muted">Contacts created here start with an empty conversation and activity timeline.</p></Card>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search contacts" placeholder="Search name, phone, or company…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-52 flex-1 sm:max-w-sm" />
        <Select aria-label="Filter contacts by owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-auto"><option value="all">All owners</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select>
        <Select aria-label="Filter contacts by messaging status" value={messageStatus} onChange={(e) => setMessageStatus(e.target.value)} className="w-auto"><option value="all">All contacts</option><option value="messaging">Messaging enabled</option><option value="opted-out">Opted out</option></Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No contacts match your search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((c) => {
            const owner = team.find((m) => m.id === c.ownerId);
            const oppCount = opportunities.filter((o) => o.contactId === c.id).length;
            const account = companies.find((company) => company.contactIds.includes(c.id));
            return (
              <li key={c.id}>
                <Link
                  to={`/contacts/${c.id}`}
                  className="flex items-center gap-4 bg-surface border border-line rounded-card p-3 hover:border-ink/40"
                >
                  <Avatar name={c.name} color="var(--neutral-text)" size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {c.name}
                      {c.optedOut && <span className="text-xs text-alarm">Opted out</span>}
                    </div>
                    <div className="text-xs text-ink-2">{c.phone} · {oppCount} opportunit{oppCount === 1 ? "y" : "ies"}{account ? ` · ${account.name}` : ""}</div>
                  </div>
                  <div className="text-xs text-ink-2 text-right shrink-0">
                    <div>{owner?.name}</div>
                    <div>{relativeTime(c.createdAt)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
