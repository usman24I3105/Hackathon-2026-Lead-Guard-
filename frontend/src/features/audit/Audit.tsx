import { useMemo, useState } from "react";
import { useStoreState } from "../../state/useStore";
import { DataTable } from "../../components/DataTable";
import { Select, Input } from "../../components/Primitives";
import { clock, dateLabel } from "../../lib/format";

export default function Audit() {
  const { audit } = useStoreState();
  const [type, setType] = useState("all");
  const [user, setUser] = useState("all");
  const [from, setFrom] = useState("");

  const types = useMemo(() => Array.from(new Set(audit.map((a) => a.type))), [audit]);
  const users = useMemo(() => Array.from(new Set(audit.map((a) => a.userName))), [audit]);

  const filtered = audit.filter((a) => {
    if (type !== "all" && a.type !== type) return false;
    if (user !== "all" && a.userName !== user) return false;
    if (from && new Date(a.at) < new Date(from)) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-ink-2">Prove who was responsible for what, and when.</p>
      </header>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select aria-label="Filter by user" value={user} onChange={(e) => setUser(e.target.value)} className="w-auto">
          <option value="all">All users</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
        <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
      </div>

      <div className="bg-surface border border-line rounded-card">
        <DataTable
          emptyTitle="No events match these filters."
          rows={filtered}
          columns={[
            { key: "type", header: "Event", render: (a) => a.type },
            { key: "user", header: "User", render: (a) => a.userName },
            { key: "change", header: "Before → after", render: (a) => (
              <span className="text-ink-2">{a.before ?? "—"} <span aria-hidden>→</span> <span className="text-ink">{a.after ?? "—"}</span></span>
            ) },
            { key: "at", header: "When", render: (a) => `${dateLabel(a.at)}, ${clock(a.at)}` },
          ]}
        />
      </div>
    </div>
  );
}
