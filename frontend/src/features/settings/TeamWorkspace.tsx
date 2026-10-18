import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { StatusPill } from "../../components/StatusPill";
import { Button, Card, EmptyState, Input, Select } from "../../components/Primitives";
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

  return <div className="p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-medium text-primary">Operations</p><h1 className="text-2xl font-semibold">Team & availability</h1><p className="mt-1 text-sm text-text-muted">Keep routing aligned with who is ready to respond.</p></div><Link to="/settings" className="inline-flex h-10 items-center rounded-control border border-border-strong px-3 text-sm font-medium hover:bg-neutral-bg">Assignment rules</Link></header>
    {!canManage && <p className="mb-4 rounded-control border border-border bg-neutral-bg px-3 py-2 text-xs text-text-muted">You can review the team. A team manager is needed to change availability or routing.</p>}
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="text-xs text-text-muted">Team members</p><p className="mt-1 text-2xl font-semibold tabular-nums">{team.length}</p></Card><Card className="p-4"><p className="text-xs text-text-muted">Available now</p><p className="mt-1 text-2xl font-semibold tabular-nums">{availableCount}<span className="ml-1 text-sm font-medium text-text-muted">of {team.length}</span></p></Card><Card className="p-4"><p className="text-xs text-text-muted">Leads in progress</p><p className="mt-1 text-2xl font-semibold tabular-nums">{leads.filter((lead) => lead.status !== "recovery").length}</p></Card></div>
    <Card className="overflow-hidden">
      {team.length ? <div className="divide-y divide-border">{team.map((member) => {
        const current = openLeads(member.id);
        const overCapacity = current > member.capacity;
        return <article key={member.id} className="grid gap-4 p-4 md:grid-cols-[minmax(14rem,1.2fr)_minmax(9rem,0.8fr)_minmax(9rem,0.7fr)_minmax(12rem,1fr)] md:items-center">
          <div className="flex min-w-0 items-center gap-3"><Avatar name={member.name} color={member.avatarColor} availability={member.availability} size={42} /><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{member.name}</h2><p className="text-xs text-text-muted">{member.role} · {current} open lead{current === 1 ? "" : "s"}</p></div></div>
          <div><p className="mb-1.5 text-[11px] font-medium text-text-muted">Availability</p><Select aria-label={`Availability for ${member.name}`} value={member.availability} disabled={!canManage} onChange={(event) => changeAvailability(member.id, event.target.value as Availability)} className="h-9 py-1"><option value="available">Available</option><option value="busy">Busy</option><option value="leave">On leave</option><option value="offline">Offline</option></Select></div>
          <div><p className="mb-1.5 text-[11px] font-medium text-text-muted">Open-lead capacity</p><div className="flex items-center gap-2"><Input aria-label={`Open-lead capacity for ${member.name}`} type="number" min="1" max="50" value={capacityDrafts[member.id] ?? String(member.capacity)} disabled={!canManage} onChange={(event) => setCapacityDrafts((drafts) => ({ ...drafts, [member.id]: event.target.value }))} onBlur={() => { if (capacityDrafts[member.id] === String(member.capacity)) setCapacityDrafts((drafts) => { const next = { ...drafts }; delete next[member.id]; return next; }); }} className="h-9 w-20 py-1" /><span className={`text-xs ${overCapacity ? "text-danger-text" : "text-text-muted"}`}>{overCapacity ? "Over capacity" : "Max leads"}</span></div>{canManage && capacityDrafts[member.id] !== undefined && <Button variant="tertiary" onClick={() => saveCapacity(member.id)} className="mt-1 h-7 px-0 text-xs">Save capacity</Button>}</div>
          <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end"><StatusPill status={member.availability} /><Button variant={member.inRotation ? "secondary" : "tertiary"} disabled={!canManage} aria-pressed={member.inRotation} onClick={() => { store.setTeamFlags(member.id, { inRotation: !member.inRotation }); push(member.inRotation ? "Removed from assignment rotation." : "Added to assignment rotation.", "success"); }} className="h-9 px-3">{member.inRotation ? "In rotation" : "Not in rotation"}</Button></div>
        </article>;
      })}</div> : <EmptyState title="No team members available." body="Team records will appear when the workspace is connected." />}
      <div className="border-t border-border px-4 py-3 text-xs text-text-muted">Availability affects routing; the backend remains authoritative for assignment and capacity decisions.</div>
    </Card>
  </div>;
}
