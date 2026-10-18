import { useState, type ReactNode } from "react";
import { useStoreState } from "../../state/useStore";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { DataTable } from "../../components/DataTable";
import { DashboardTile } from "./DashboardTile";
import { money, relativeTime } from "../../lib/format";
import { StatusChip, type ChipKind } from "../../components/StatusChip";

type Drill = "open" | "escalated" | "appointments" | null;

export default function Dashboard() {
  const { leads, team, messages, appointments, opportunities, payments } = useStoreState();
  const { session } = useAuth();
  const [drill, setDrill] = useState<Drill>(null);

  const isUser = session?.role === "User";
  const myLeads = leads.filter((l) => l.ownerId === session?.userId);
  const scope = isUser ? myLeads : leads;

  const open = scope.filter((l) => l.status === "waiting" || l.status === "escalated");
  const escalated = scope.filter((l) => l.status === "escalated" || l.status === "recovery");
  const acknowledged = scope.filter((l) => l.status === "acknowledged" && l.ttfrSeconds != null);
  const avgTtfr = acknowledged.length
    ? Math.round(acknowledged.reduce((sum, l) => sum + (l.ttfrSeconds ?? 0), 0) / acknowledged.length)
    : null;
  const todaysMessages = messages.filter((m) => m.direction === "out" && Date.now() - new Date(m.at).getTime() < 24 * 3600_000);
  const upcomingAppts = appointments.filter((a) => a.status === "booked");
  const canSeeValue = !session || has({ role: session.role }, "dashboard.full");
  const pipelineValue = opportunities.reduce((sum, o) => sum + (o.valueCents ?? 0), 0);
  const collected = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amountCents, 0);
  const projected = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amountCents, 0);
  const availableReps = team.filter((m) => m.availability === "available").length;

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-ink-2">{isUser ? "Your true state, right now." : "The team's true state, right now."}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 mb-6">
        <DashboardTile
          label={isUser ? "My leads waiting" : "Leads waiting"}
          value={String(open.length)}
          definition="Leads with no acknowledgement yet, within the current escalation window."
          onClick={() => setDrill("open")}
        />
        <DashboardTile
          label={isUser ? "My response time" : "Avg response time"}
          value={avgTtfr != null ? `${avgTtfr}s` : "—"}
          definition="Average time from lead capture to first acknowledgement."
        />
        <DashboardTile
          label="Escalated today"
          value={String(escalated.length)}
          definition="Leads that missed an acknowledgement window and moved up a level."
          onClick={() => setDrill("escalated")}
        />
        <DashboardTile
          label="Available reps"
          value={String(availableReps)}
          definition="Team members currently marked Available and in the escalation rotation."
        />
        <DashboardTile
          label="Pipeline value"
          value={money(pipelineValue)}
          definition="Sum of all open opportunity values across every stage."
          masked={!canSeeValue}
        />
        <DashboardTile
          label="Collected this month"
          value={money(collected)}
          definition="Payments with status Paid, this calendar month."
        />
        <DashboardTile
          label="Projected (pending)"
          value={money(projected)}
          definition="Payment links sent but not yet paid — not counted as collected."
        />
        <DashboardTile
          label="Appointments booked"
          value={String(upcomingAppts.length)}
          definition="Upcoming appointments with status Booked."
          onClick={() => setDrill("appointments")}
        />
      </div>

      <p className="text-xs text-ink-2 mb-4">{todaysMessages.length} messages sent in the last 24 hours.</p>

      {drill === "open" && (
        <DrillSection title="Leads waiting" onClose={() => setDrill(null)}>
          <DataTable
            emptyTitle="No leads waiting."
            rows={open}
            columns={[
              { key: "name", header: "Name", render: (l) => l.name },
              { key: "status", header: "Status", render: (l) => <StatusChip kind={l.status as ChipKind} /> },
              { key: "created", header: "Captured", render: (l) => relativeTime(l.createdAt) },
            ]}
          />
        </DrillSection>
      )}
      {drill === "escalated" && (
        <DrillSection title="Escalated or in recovery" onClose={() => setDrill(null)}>
          <DataTable
            emptyTitle="Nothing escalated."
            rows={escalated}
            columns={[
              { key: "name", header: "Name", render: (l) => l.name },
              { key: "level", header: "Level", render: (l) => `L${l.level}` },
              { key: "status", header: "Status", render: (l) => <StatusChip kind={l.status as ChipKind} /> },
            ]}
          />
        </DrillSection>
      )}
      {drill === "appointments" && (
        <DrillSection title="Booked appointments" onClose={() => setDrill(null)}>
          <DataTable
            emptyTitle="No appointments booked."
            rows={upcomingAppts}
            columns={[
              { key: "title", header: "Title", render: (a) => a.title },
              { key: "start", header: "When", render: (a) => relativeTime(a.start) },
            ]}
          />
        </DrillSection>
      )}
    </div>
  );
}

function DrillSection({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-[10px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h2 className="font-semibold">{title}</h2>
        <button onClick={onClose} className="text-sm text-ink-2 underline">Close</button>
      </div>
      {children}
    </div>
  );
}
