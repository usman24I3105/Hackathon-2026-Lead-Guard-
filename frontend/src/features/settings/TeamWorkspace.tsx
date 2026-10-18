import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { Button, EmptyState, Input, Select } from "../../components/Primitives";
import { Icon } from "../../components/icons";
import { KpiTile, Notice, PageHeader, Switch } from "../../components/DesignSystem";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import type { Availability } from "../../mock/types";

export default function TeamWorkspace() {
  const { team, leads } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const canManage = !session || has({ role: session.role }, "team.manage");
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const openLeads = (userId: string) => leads.filter((lead) => lead.ownerId === userId && lead.status !== "recovery").length;
  const availableCount = team.filter((member) => member.availability === "available").length;

  function changeAvailability(userId: string, availability: Availability) {
    store.setAvailability(userId, availability);
    push("Availability updated.", "success");
  }

  function saveCapacity(userId: string) {
    const value = Number(capacityDrafts[userId]);
    if (!Number.isInteger(value) || value < 1 || value > 50) {
      push("Capacity must be a whole number from 1 to 50.", "error");
      return;
    }
    store.setTeamFlags(userId, { capacity: value });
    setCapacityDrafts((drafts) => { const next = { ...drafts }; delete next[userId]; return next; });
    push("Capacity saved.", "success");
  }

  return <div className="page-content">
    <PageHeader eyebrow="Operations" title="Team & availability" subtitle="Keep routing aligned with who is ready to respond." actions={<Link to="/settings" className="ui-button ui-button--secondary ui-button--lg"><span className="ui-button-content"><Icon name="settings" size={15} />Assignment rules</span></Link>} />
    {!canManage && <Notice variant="restricted" className="mb-4" title="Read-only">You can review the team. A team manager is needed to change availability or routing.</Notice>}
    <div className="team-kpi-grid">
      <KpiTile label="Team members" value={team.length} icon="team" tone="info" helper="In this workspace" />
      <KpiTile label="Available now" value={<>{availableCount}<span className="kpi-value-unit"> / {team.length}</span></>} icon="check" tone="success" helper="Ready to receive a lead" />
      <KpiTile label="Leads in progress" value={leads.filter((lead) => lead.status !== "recovery").length} icon="leads" tone="warning" helper="Outside the recovery queue" />
    </div>
    <div className="data-table-card team-member-table">
      {team.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Member", "Availability", "Open-lead capacity", "Workload", "Rotation", "Last active"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{team.map((member) => {
        const current = openLeads(member.id); const overCapacity = current > member.capacity; const capacity = Math.max(1, member.capacity); const percent = Math.min(100, current / capacity * 100);
        return <tr key={member.id}>
          <td data-label="Member"><div className="table-person"><Avatar name={member.name} color={member.avatarColor} availability={member.availability} size={34} /><div className="min-w-0"><strong className="block truncate">{member.name}</strong><span className="role-badge">{member.role}</span></div></div></td>
          <td data-label="Availability"><div className="availability-control"><Select aria-label={`Availability for ${member.name}`} value={member.availability} disabled={!canManage} onChange={(event) => changeAvailability(member.id, event.target.value as Availability)} className="availability-select"><option value="available">Available</option><option value="busy">Busy</option><option value="leave">On leave</option><option value="offline">Offline</option></Select></div></td>
          <td data-label="Open-lead capacity"><div className="capacity-field"><Input aria-label={`Open-lead capacity for ${member.name}`} type="number" min="1" max="50" value={capacityDrafts[member.id] ?? String(member.capacity)} disabled={!canManage} onChange={(event) => setCapacityDrafts((drafts) => ({ ...drafts, [member.id]: event.target.value }))} onBlur={() => { if (capacityDrafts[member.id] === String(member.capacity)) setCapacityDrafts((drafts) => { const next = { ...drafts }; delete next[member.id]; return next; }); }} /><span>max leads</span></div>{canManage && capacityDrafts[member.id] !== undefined && <Button variant="ghost" size="sm" onClick={() => saveCapacity(member.id)}>Save</Button>}</td>
          <td data-label="Workload"><div className="workload-cell"><div className="workload-track" aria-label={`${current} of ${capacity} open leads`}><span data-over={overCapacity || undefined} style={{ width: `${percent}%` }} /></div><span className={overCapacity ? "text-danger-text" : "text-text-muted"}>{current} / {capacity}</span></div></td>
          <td data-label="Rotation"><div className="rotation-cell"><Switch label={`In rotation for ${member.name}`} checked={member.inRotation} disabled={!canManage} onChange={() => { store.setTeamFlags(member.id, { inRotation: !member.inRotation }); push(member.inRotation ? "Removed from assignment rotation." : "Added to assignment rotation.", "success"); }} /><span>In rotation</span></div></td>
          <td data-label="Last active"><span className="text-xs text-text-muted" title="Last activity is not included in this workspace data">Not recorded</span></td>
        </tr>;
      })}</tbody></table></div> : <EmptyState title="No team members available" body="Team records will appear when the workspace is connected." />}
      <div className="data-table-footer"><span>Availability affects routing; the server remains authoritative for assignment and capacity decisions.</span></div>
    </div>
  </div>;
}
