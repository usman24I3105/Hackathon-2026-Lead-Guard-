import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { store } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { useDashboard } from "../../api/hooks/useDashboard";
import type { KpiId, LeadSummary, RecoveryItem } from "../../api/types/dashboard";
import { DataTable } from "../../components/DataTable";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { relativeTime } from "../../lib/format";
import { Widget, type WidgetStatus } from "./components/Widget";
import { KpiCard } from "./components/KpiCard";
import { PipelineBarChart } from "./components/PipelineBarChart";
import { OverdueBadge, RecoveryQueueTable } from "./components/RecoveryQueueTable";
import { HighlightedLeadCard } from "./components/HighlightedLeadCard";
import { EmployeeAvailabilityList } from "./components/EmployeeAvailabilityList";
import { UpcomingAppointments } from "./components/UpcomingAppointments";
import { ActivityFeed } from "./components/ActivityFeed";
import { IntegrationsHealthStrip } from "./components/IntegrationsHealthStrip";
import { OwnerViewToggle } from "./components/OwnerViewToggle";
import { ReassignDialog } from "./components/ReassignDialog";
import { KpiCardSkeleton, SkeletonBars, SkeletonRows, SkeletonTable } from "./components/WidgetStates";

type Drill = "newLeads" | "escalations" | null;
type DashboardWidget = "availability" | "attention" | "activity" | "pipeline" | "recovery" | "appointments" | "integrations";
const DASHBOARD_WIDGETS: { id: DashboardWidget; label: string }[] = [
  { id: "availability", label: "Employee availability" },
  { id: "attention", label: "Needs attention" },
  { id: "activity", label: "Live activity" },
  { id: "pipeline", label: "Pipeline value" },
  { id: "recovery", label: "Recovery queue" },
  { id: "appointments", label: "Upcoming appointments" },
  { id: "integrations", label: "Integration health" },
];
const DEFAULT_WIDGETS: DashboardWidget[] = DASHBOARD_WIDGETS.map((widget) => widget.id);

function getVisibleWidgets(): DashboardWidget[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem("leadguard-dashboard-widgets") ?? "null") as unknown;
    return Array.isArray(stored) ? stored.filter((item): item is DashboardWidget => DEFAULT_WIDGETS.includes(item)) : DEFAULT_WIDGETS;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

export default function Dashboard() {
  const { session } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const canToggle = session?.role !== "User";
  const [ownerView, setOwnerView] = useState(true);
  const scope = canToggle && ownerView ? "team" : "personal";
  const { data, isPending, isError, refetch } = useDashboard(scope);
  const [drill, setDrill] = useState<Drill>(null);
  const [reassigning, setReassigning] = useState<RecoveryItem | null>(null);
  const [visibleWidgets, setVisibleWidgets] = useState<DashboardWidget[]>(getVisibleWidgets);

  function toggleWidget(id: DashboardWidget) {
    setVisibleWidgets((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("leadguard-dashboard-widgets", JSON.stringify(next));
      return next;
    });
  }

  const status: WidgetStatus = isPending && !data ? "loading" : isError && !data ? "error" : "ready";
  // A failed background refresh keeps the last good data on screen.
  const staleAfterError = isError && !!data;
  const retry = () => void refetch();

  function acknowledge(item: RecoveryItem) {
    if (!session) return;
    store.acknowledgeLead(item.leadId, session.userId);
    push(`${item.leadName} acknowledged.`);
  }

  function confirmReassign(userId: string) {
    if (!reassigning) return;
    store.reassignLead(reassigning.leadId, userId);
    push(`${reassigning.leadName} reassigned.`);
    setReassigning(null);
  }

  function viewList(id: KpiId) {
    if (id === "newLeads" || id === "escalations") setDrill(id);
    if (id === "recoveryQueue") document.getElementById("recovery-queue")?.scrollIntoView({ behavior: "smooth" });
  }

  const recoveryQueue = data?.recoveryQueue ?? [];

  // Grid placement lives on wrapper divs so responsive show/hide never fights
  // a component's own display classes. Mobile order follows DASHBOARD-SPEC §3,
  // desktop order follows §2; widgets the spec doesn't list for a size go last.
  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6 grid grid-cols-12 gap-4 sm:gap-6">
      <header className="col-span-12 order-0 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">
            {scope === "team" ? "The team's true state, right now." : "Your leads and response times, right now."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text hover:bg-neutral-bg [&::-webkit-details-marker]:hidden">Customize dashboard <span className="text-text-muted">⌄</span></summary>
            <fieldset className="absolute right-0 z-40 mt-2 w-64 rounded-card border border-border bg-surface p-3 shadow-xl">
              <legend className="px-1 text-xs font-semibold text-text-muted">Visible widgets</legend>
              <div className="flex flex-col gap-1">{DASHBOARD_WIDGETS.map((widget) => <label key={widget.id} className="flex min-h-9 items-center gap-2 rounded-control px-2 text-sm hover:bg-neutral-bg"><input type="checkbox" checked={visibleWidgets.includes(widget.id)} onChange={() => toggleWidget(widget.id)} />{widget.label}</label>)}</div>
            </fieldset>
          </details>
          {canToggle && <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card"><OwnerViewToggle checked={ownerView} onChange={setOwnerView} /></div>}
        </div>
      </header>

      <div aria-live="polite" className="sr-only">
        {status === "error" ? "The dashboard couldn't load. Each section has a Retry button." : ""}
      </div>

      {staleAfterError && data && (
        <div className="col-span-12 order-0 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning bg-warning-bg px-4 py-3 text-sm text-warning-text">
          <span>
            <span aria-hidden="true">⚠ </span>
            Couldn't refresh — showing data from {relativeTime(data.generatedAt)}.
          </span>
          <button type="button" onClick={retry} className="font-medium underline underline-offset-2 hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="col-span-12 order-1">
        {status === "error" ? (
          <Widget title="Key numbers" status="error" onRetry={retry} errorMessage="We couldn't load your key numbers." />
        ) : (
          <section aria-labelledby="kpi-heading">
          <h2 id="kpi-heading" className="sr-only">Key numbers</h2>
          <div className="grid gap-4 sm:gap-6 grid-cols-2 md:grid-cols-3 xl:grid-cols-5" aria-busy={status === "loading" || undefined}>
            {status === "loading"
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={i === 3 ? "hidden md:block" : ""}>
                    <KpiCardSkeleton className="h-full" />
                  </div>
                ))
              : data?.kpis.map((kpi) => (
                  // Mobile shows the spec's 2×2 set; the highlighted lead card covers the recovery KPI there.
                  <div key={kpi.id} className={`min-w-0 ${kpi.id === "recoveryQueue" ? "hidden md:block" : ""}`}>
                    <KpiCard
                      className="h-full"
                      metric={kpi}
                      onViewList={
                        kpi.id === "newLeads" || kpi.id === "escalations" || kpi.id === "recoveryQueue"
                          ? () => viewList(kpi.id)
                          : undefined
                      }
                    />
                  </div>
                ))}
          </div>
          </section>
        )}
      </div>

      {drill && data && (
        <div className="col-span-12 order-2">
          <Widget
            title={drill === "newLeads" ? "New leads today" : "Escalations today"}
            action={
              <button onClick={() => setDrill(null)} className="text-sm font-medium text-text-muted hover:text-text underline underline-offset-2">
                Close
              </button>
            }
          >
            <DataTable<LeadSummary>
              emptyTitle="Nothing here yet."
              rows={drill === "newLeads" ? data.lists.newLeads : data.lists.escalations}
              columns={[
                { key: "name", header: "Lead", render: (l) => l.name },
                { key: "source", header: "Source", render: (l) => l.source },
                { key: "owner", header: "Owner", render: (l) => l.ownerName },
                { key: "status", header: "Status", render: (l) => <StatusChip kind={l.status as ChipKind} /> },
                { key: "created", header: "Captured", render: (l) => relativeTime(l.createdAt) },
              ]}
            />
          </Widget>
        </div>
      )}

      <div className={`col-span-12 md:col-span-6 order-3 md:order-7 min-w-0 ${visibleWidgets.includes("availability") ? "" : "hidden"}`}>
        <Widget
          title="Employee availability"
          className="h-full"
          status={status}
          onRetry={retry}
          skeleton={<SkeletonRows rows={4} avatar />}
          isEmpty={!data?.team.length}
          emptyTitle="No teammates yet."
          emptyBody="Invite your team from Settings to share the lead load."
        >
          {data && <EmployeeAvailabilityList employees={data.team} />}
        </Widget>
      </div>

      {/* Phones only: the single most urgent lead, in place of the recovery table. */}
      <div className={`col-span-12 order-4 md:hidden ${visibleWidgets.includes("attention") ? "" : "hidden"}`}>
        {status === "ready" && data?.highlightedLead ? (
          <>
            <h2 className="sr-only">Most urgent lead</h2>
            <HighlightedLeadCard
              item={data.highlightedLead}
              canAcknowledge={data.highlightedLead.ownerId === session?.userId}
              onAcknowledge={acknowledge}
              onReassign={setReassigning}
            />
          </>
        ) : (
          <Widget
            title="Needs attention"
            status={status}
            onRetry={retry}
            skeleton={<SkeletonRows rows={2} />}
            isEmpty
            emptyTitle="Nothing needs rescue."
            emptyBody="Leads that miss an acknowledgement window will appear here."
          />
        )}
      </div>

      <div className={`col-span-12 md:col-span-6 order-5 md:order-8 min-w-0 ${visibleWidgets.includes("activity") ? "" : "hidden"}`}>
        <Widget
          title="Live activity"
          className="h-full"
          status={status}
          onRetry={retry}
          skeleton={<SkeletonRows rows={5} avatar />}
          isEmpty={!data?.activity.length}
          emptyTitle="No activity yet."
          emptyBody="Escalations, payments and new messages will show up here as they happen."
        >
          {data && <ActivityFeed items={data.activity} />}
        </Widget>
      </div>

      <div className={`col-span-12 order-6 md:order-3 min-w-0 ${visibleWidgets.includes("pipeline") ? "" : "hidden"}`}>
        <Widget
          title="Open pipeline value by stage"
          status={status}
          onRetry={retry}
          skeleton={<SkeletonBars rows={3} />}
          isEmpty={!data?.pipeline.stages.length}
          emptyTitle="No open stages."
          emptyBody="Add pipeline stages in Settings to track value by stage."
        >
          {data && <PipelineBarChart stages={data.pipeline.stages} visible={data.pipeline.visible} />}
        </Widget>
      </div>

      {visibleWidgets.includes("recovery") && <div className="col-span-12 lg:col-span-8 hidden md:block md:order-4 min-w-0">
        <Widget
          id="recovery-queue"
          title="Recovery queue"
          className="h-full"
          status={status}
          onRetry={retry}
          skeleton={<SkeletonTable rows={3} />}
          isEmpty={!recoveryQueue.length}
          emptyTitle="Nothing needs rescue."
          emptyBody="Leads that miss an acknowledgement window will appear here."
          action={<OverdueBadge count={recoveryQueue.filter((r) => r.overdue).length} />}
        >
          <RecoveryQueueTable
            items={recoveryQueue}
            currentUserId={session?.userId}
            onAcknowledge={acknowledge}
            onReassign={setReassigning}
          />
        </Widget>
      </div>}

      <div className={`col-span-12 lg:col-span-4 order-7 md:order-5 min-w-0 ${visibleWidgets.includes("appointments") ? "" : "hidden"}`}>
        <Widget
          title="Upcoming appointments"
          className="h-full"
          status={status}
          onRetry={retry}
          skeleton={<SkeletonRows rows={3} />}
          isEmpty={!data?.appointments.length}
          emptyTitle="Nothing booked."
          emptyBody="Appointments booked from a contact's page will show here."
        >
          {data && <UpcomingAppointments items={data.appointments} onSelectContact={(id) => navigate(`/contacts/${id}`)} />}
        </Widget>
      </div>

      <div className={`col-span-12 order-8 md:order-6 min-w-0 ${visibleWidgets.includes("integrations") ? "" : "hidden"}`}>
        <Widget
          title="Integrations health"
          status={status}
          onRetry={retry}
          skeleton={<SkeletonRows rows={2} avatar />}
          isEmpty={!data?.integrations.length}
          emptyTitle="No integrations yet."
          emptyBody="Connect WhatsApp, Telegram, Stripe or Google Calendar from the Integrations page."
        >
          {data && <IntegrationsHealthStrip items={data.integrations} />}
        </Widget>
      </div>

      {reassigning && data && (
        <ReassignDialog
          leadName={reassigning.leadName}
          currentOwnerId={reassigning.ownerId}
          employees={data.team}
          onConfirm={confirmReassign}
          onCancel={() => setReassigning(null)}
        />
      )}
    </div>
  );
}
