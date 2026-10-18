import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { Avatar } from "../../components/Avatar";
import { Button, Select, EmptyState } from "../../components/Primitives";
import { relativeTime } from "../../lib/format";
import type { Lead } from "../../mock/types";

export default function Recovery() {
  const { leads, team } = useStoreState();
  const { push } = useToast();
  const [reassignTarget, setReassignTarget] = useState<Lead | null>(null);
  const [selected, setSelected] = useState("");

  const queue = leads.filter((l) => l.status === "recovery");

  function confirmReassign() {
    if (!reassignTarget || !selected) return;
    store.reassignLead(reassignTarget.id, selected);
    push(`${reassignTarget.name} reassigned.`);
    setReassignTarget(null);
    setSelected("");
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Recovery queue</h1>
        <p className="text-sm text-ink-2">Leads that went through full escalation with no acknowledgement.</p>
      </header>

      {queue.length === 0 ? (
        <EmptyState title="Nothing needs rescue." body="Leads that miss every escalation step will land here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center gap-3 bg-surface border rounded-[10px] p-4" style={{ borderColor: "var(--alarm)" }}>
              <Avatar name={lead.name} color="#C2361B" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{lead.name}</div>
                <div className="text-xs text-ink-2">{lead.phone} · captured {relativeTime(lead.createdAt)}</div>
                <div className="text-sm mt-0.5" style={{ color: "var(--alarm)" }}>{lead.recoveryReason}</div>
              </div>
              <Button
                onClick={() => {
                  setReassignTarget(lead);
                  setSelected(team.find((m) => m.availability === "available")?.id ?? "");
                }}
              >
                Reassign
              </Button>
            </li>
          ))}
        </ul>
      )}

      {reassignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reassign-title">
          <div className="bg-surface rounded-[10px] border border-line w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 id="reassign-title" className="text-lg font-semibold">Reassign {reassignTarget.name}</h2>
            <Select aria-label="Choose team member" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {team.map((m) => (
                <option key={m.id} value={m.id}>{m.name} — {m.availability}</option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReassignTarget(null)}>Cancel</Button>
              <Button onClick={confirmReassign}>Reassign</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
