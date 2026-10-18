import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { Avatar } from "../../components/Avatar";
import { Button, Select, EmptyState } from "../../components/Primitives";
import { Notice, PageHeader, StatusBadge, Tooltip } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
import { relativeTime } from "../../lib/format";
import type { Lead } from "../../mock/types";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";

export default function Recovery() {
  const { leads, team } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [reassignTarget, setReassignTarget] = useState<Lead | null>(null);
  const [selected, setSelected] = useState("");
  const canManage = !session || has({ role: session.role }, "leads.manage");

  const queue = leads.filter((l) => l.status === "recovery");

  function confirmReassign() {
    if (!reassignTarget || !selected) return;
    store.reassignLead(reassignTarget.id, selected);
    push(`${reassignTarget.name} reassigned.`);
    setReassignTarget(null);
    setSelected("");
  }

  return (
    <div className="page-content">
      <PageHeader eyebrow="Customer management" title="Recovery queue" subtitle="Leads that went through full escalation with no acknowledgement." badge={<StatusBadge label={String(queue.length)} tone="danger" icon="warning" />} />
      {!canManage && <Notice variant="restricted" className="mb-4" title="Read-only">You can review recovery leads. Lead management permission is needed to reassign ownership.</Notice>}

      {queue.length === 0 ? (
        <div className="data-table-card"><EmptyState title="Nothing to recover" body="Leads that miss every escalation step will appear here." /></div>
      ) : (
        <div className="data-table-card recovery-list">
          <table className="w-full text-sm"><thead><tr>{["Lead", "Escalation outcome", "Path", "Action"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{queue.map((lead) => <tr key={lead.id} className="data-row-danger">
              <td data-label="Lead"><div className="table-person"><Avatar name={lead.name} size={36} /><div className="min-w-0"><strong className="block truncate">{lead.name}</strong><a className="app-link font-mono-tab text-xs" href={`tel:${lead.phone}`}>{lead.phone}</a><p className="mt-0.5 text-[11px] text-text-muted">Captured {relativeTime(lead.createdAt)}</p></div></div></td>
              <td data-label="Escalation outcome"><StatusBadge label="No acknowledgement after full escalation" tone="danger" icon="warning" title={lead.recoveryReason} /></td>
              <td data-label="Path"><div className="escalation-trail" aria-label="Escalation completed through levels 1, 2, and 3">{["L1", "L2", "L3"].map((level) => <span key={level}><Icon name="check" size={13} />{level}</span>)}</div></td>
              <td data-label="Action" className="table-action-cell">{canManage ? <Button onClick={() => { setReassignTarget(lead); setSelected(team.find((m) => m.availability === "available")?.id ?? ""); }}>Reassign</Button> : <Tooltip content="You need leads.manage permission to reassign"><span><Button disabled>Reassign</Button></span></Tooltip>}</td>
            </tr>)}</tbody>
          </table><div className="data-table-footer"><span>Showing {queue.length} {queue.length === 1 ? "lead" : "leads"}</span></div>
        </div>
      )}

      {reassignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reassign-title">
          <div className="bg-surface rounded-card border border-line w-full max-w-sm p-6 flex flex-col gap-4">
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
