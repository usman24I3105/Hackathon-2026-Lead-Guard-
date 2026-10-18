import { useState } from "react";
import { Link } from "react-router-dom";
import { useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { Input, EmptyState } from "../../components/Primitives";
import { relativeTime } from "../../lib/format";

export default function ContactsList() {
  const { contacts, team, opportunities } = useStoreState();
  const [q, setQ] = useState("");

  const filtered = contacts.filter(
    (c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
  );

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-ink-2">Find a contact by name or phone.</p>
      </header>

      <Input
        aria-label="Search contacts"
        placeholder="Search by name or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm mb-4"
      />

      {filtered.length === 0 ? (
        <EmptyState title="No contacts match your search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((c) => {
            const owner = team.find((m) => m.id === c.ownerId);
            const oppCount = opportunities.filter((o) => o.contactId === c.id).length;
            return (
              <li key={c.id}>
                <Link
                  to={`/contacts/${c.id}`}
                  className="flex items-center gap-4 bg-surface border border-line rounded-[10px] p-3 hover:border-ink/40"
                >
                  <Avatar name={c.name} color="#4B5563" size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {c.name}
                      {c.optedOut && <span className="text-xs text-alarm">Opted out</span>}
                    </div>
                    <div className="text-xs text-ink-2">{c.phone} · {oppCount} opportunit{oppCount === 1 ? "y" : "ies"}</div>
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
