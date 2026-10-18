import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { Input, EmptyState, Select, Button, Card, FormField } from "../../components/Primitives";
import { FilterBar, Notice, PageHeader, StatusBadge, Tooltip } from "../../components/DesignSystem";
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
    <div className="page-content">
      <PageHeader eyebrow="Customer management" title="Contacts" subtitle="Find a person, see who owns the relationship, and open their full history." actions={canManage ? <Button onClick={() => setCreateOpen((open) => !open)}>Add contact</Button> : <Tooltip content="You need contacts.manage permission to add contacts"><span><Button disabled>Add contact</Button></span></Tooltip>} />
      {!canManage && <Notice variant="restricted" className="mb-4" title="Read-only">You can review contact records. Contact management permission is needed to add or update them.</Notice>}

      {createOpen && canManage && <Card className="mb-4 p-4"><form onSubmit={createContact} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
        <FormField label="Name" htmlFor="new-contact-name" required><Input id="new-contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus required /></FormField>
        <FormField label="Phone" htmlFor="new-contact-phone" required><Input id="new-contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} autoComplete="tel" required /></FormField>
        <FormField label="Owner" htmlFor="new-contact-owner" required><Select id="new-contact-owner" value={newOwnerId} onChange={(event) => setNewOwnerId(event.target.value)} required>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></FormField>
        <div className="flex gap-2"><Button type="submit" disabled={!name.trim() || !phone.trim()}>Save contact</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
      </form><p className="mt-3 text-xs text-text-muted">Contacts created here start with an empty conversation and activity timeline.</p></Card>}

      <FilterBar className="mb-3">
        <Input aria-label="Search contacts" placeholder="Search name, phone, or company…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-52 flex-1 sm:max-w-sm" />
        <Select aria-label="Filter contacts by owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-auto"><option value="all">All owners</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select>
        <Select aria-label="Filter contacts by messaging status" value={messageStatus} onChange={(e) => setMessageStatus(e.target.value)} className="w-auto"><option value="all">All contacts</option><option value="messaging">Messaging enabled</option><option value="opted-out">Opted out</option></Select>
      </FilterBar>

      <div className="mb-2 text-xs text-text-muted" aria-live="polite">Showing {filtered.length} of {contacts.length}</div>
      <div className="data-table-card">
        {filtered.length === 0 ? <EmptyState title="No contacts match your search." body={contacts.length ? "Try another search, owner, or messaging status." : "Contacts will appear here when they are added to the workspace."} /> : <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr>{["Contact", "Company", "Opportunities", "Owner", "Last activity", "Messaging"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
            {filtered.map((c) => {
              const owner = team.find((m) => m.id === c.ownerId);
              const oppCount = opportunities.filter((o) => o.contactId === c.id).length;
              const account = companies.find((company) => company.contactIds.includes(c.id));
              return <tr key={c.id} className="contact-table-row">
                <td data-label="Contact"><div className="table-person"><Avatar name={c.name} color={owner?.avatarColor} size={36} /><div className="min-w-0"><Link to={`/contacts/${c.id}`} className="app-link block truncate font-medium">{c.name}</Link><a href={`tel:${c.phone}`} className="app-link font-mono-tab text-xs">{c.phone}</a></div></div></td>
                <td data-label="Company">{account ? <Link to={`/companies/${account.id}`} className="company-chip">{account.name}</Link> : <span className="text-text-muted">No company</span>}</td>
                <td data-label="Opportunities" className="font-mono-tab">{oppCount}</td>
                <td data-label="Owner">{owner ? <div className="table-person"><Avatar name={owner.name} size={28} color={owner.avatarColor} /><span className="truncate">{owner.name}</span></div> : <span className="text-text-muted">Unassigned</span>}</td>
                <td data-label="Last activity"><time className="text-xs text-text-muted" title={new Date(c.createdAt).toLocaleString()}>{relativeTime(c.createdAt)}</time></td>
                <td data-label="Messaging"><StatusBadge label={c.optedOut ? "Opted out" : "Messaging enabled"} tone={c.optedOut ? "danger" : "success"} icon={c.optedOut ? "close" : "check"} /></td>
              </tr>;
            })}
          </tbody></table>
        </div>}
        {filtered.length > 0 && <div className="data-table-footer"><span>Showing 1–{filtered.length} of {filtered.length} contacts</span></div>}
      </div>
    </div>
  );
}
