// Mock-only: builds the GET /api/dashboard response from in-memory state, so
// dev mode behaves like the real endpoint. Never bundled into production
// (only reachable via mock/store.ts, which api/adapter.ts gates).
import { has } from "../lib/perm";
import type { Session } from "../lib/session";
import type {
  ActivityItem,
  DashboardData,
  DashboardScope,
  KpiMetric,
  LeadSummary,
  RecoveryItem,
  Trend,
} from "../api/types/dashboard";
import type { State } from "./store";
import type { Lead } from "./types";
import { previousPeriod } from "./data";

function trend(current: number, previous: number, upIsGood: boolean, comparedTo: string): Trend {
  if (previous === 0) {
    return { percent: current > 0 ? 100 : 0, direction: current > 0 ? "up" : "flat", upIsGood, comparedTo };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return { percent: Math.abs(percent), direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat", upIsGood, comparedTo };
}

function startOfToday(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  busy: "Busy",
  leave: "On leave",
  offline: "Offline",
};

export function buildDashboard(state: State, viewer: Session | null, requested: DashboardScope): DashboardData {
  const now = new Date();
  const nowMs = now.getTime();
  const role = viewer?.role ?? "User";
  // Regular users can only ever get their own view; the server enforces this.
  const scope: DashboardScope = role === "User" ? "personal" : requested;
  const canSeeMoney = has({ role }, "dashboard.full") && scope === "team";

  const nameOf = (userId: string) => state.team.find((m) => m.id === userId)?.name ?? userId;
  const scoped = scope === "personal" ? state.leads.filter((l) => l.ownerId === viewer?.userId) : state.leads;

  const today = startOfToday(now);
  const newLeads = scoped.filter((l) => new Date(l.createdAt).getTime() >= today);
  const escalations = newLeads.filter((l) => l.level > 1);
  const acknowledged = scoped.filter((l) => l.status === "acknowledged" && l.ttfrSeconds != null);
  const avgResponse = acknowledged.length
    ? Math.round(acknowledged.reduce((sum, l) => sum + (l.ttfrSeconds ?? 0), 0) / acknowledged.length)
    : null;
  const collected = state.payments
    .filter((p) => p.status === "paid" && new Date(p.createdAt).getTime() >= startOfMonth(now))
    .reduce((sum, p) => sum + p.amountCents, 0);

  const toRecoveryItem = (l: Lead): RecoveryItem => ({
    leadId: l.id,
    leadName: l.name,
    source: l.source,
    reason: l.recoveryReason ?? `No acknowledgement — escalated to level ${l.level}`,
    status: l.status,
    ownerId: l.ownerId,
    ownerName: nameOf(l.ownerId),
    ackDeadline: l.ackDeadline,
    createdAt: l.createdAt,
    overdue: l.status === "recovery" || new Date(l.ackDeadline).getTime() < nowMs,
  });

  const recoveryQueue = scoped
    .filter((l) => l.status === "recovery" || l.status === "escalated")
    .map(toRecoveryItem)
    .sort((a, b) => new Date(a.ackDeadline).getTime() - new Date(b.ackDeadline).getTime());
  const inRecovery = recoveryQueue.filter((r) => r.status === "recovery").length;
  const highlightedLead = recoveryQueue.find((r) => r.status === "escalated") ?? recoveryQueue[0] ?? null;

  const kpis: KpiMetric[] = [
    {
      id: "newLeads",
      label: scope === "personal" ? "My new leads today" : "New leads today",
      value: newLeads.length,
      unit: "count",
      definition: "Leads captured since midnight, from any source.",
      trend: trend(newLeads.length, previousPeriod.newLeads, true, "yesterday"),
    },
    {
      id: "avgResponse",
      label: scope === "personal" ? "My response time" : "Avg. response time",
      value: avgResponse,
      unit: "seconds",
      definition: "Average time from lead capture to first acknowledgement.",
      trend: avgResponse == null ? undefined : trend(avgResponse, previousPeriod.avgResponseSeconds, false, "yesterday"),
    },
    {
      id: "escalations",
      label: "Escalations today",
      value: escalations.length,
      unit: "count",
      definition: "Leads captured today that missed at least one acknowledgement window.",
      trend: trend(escalations.length, previousPeriod.escalations, false, "yesterday"),
    },
    {
      id: "recoveryQueue",
      label: "Recovery queue",
      value: recoveryQueue.length,
      unit: "count",
      definition: "Leads that are escalating or went through full escalation with no acknowledgement.",
      badge: inRecovery || undefined,
    },
    {
      id: "collected",
      label: "Collected revenue",
      value: canSeeMoney ? collected : null,
      masked: !canSeeMoney,
      unit: "cents",
      definition: "Payments marked Paid this calendar month. Pending links are not counted.",
      trend: canSeeMoney ? trend(collected, previousPeriod.collectedCents, true, "last month") : undefined,
    },
  ];

  const pipelineStages = state.stages
    .filter((s) => !s.isClosed)
    .map((s) => {
      const deals = state.opportunities.filter((o) => o.stageId === s.id);
      return {
        stageId: s.id,
        stageName: s.name,
        valueCents: canSeeMoney ? deals.reduce((sum, o) => sum + (o.valueCents ?? 0), 0) : null,
        dealCount: deals.length,
      };
    });

  const team = state.team.map((m) => ({
    userId: m.id,
    name: m.name,
    avatarColor: m.avatarColor,
    availability: m.availability,
    openLeads: state.leads.filter((l) => l.ownerId === m.id && l.status !== "recovery").length,
    capacity: m.capacity,
  }));

  const appointments = state.appointments
    .filter((a) => a.status === "booked" && new Date(a.start).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)
    .map((a) => {
      const contact = state.contacts.find((c) => c.id === a.contactId);
      return {
        id: a.id,
        start: a.start,
        title: a.title,
        contactId: a.contactId,
        customerName: contact?.name ?? "Unknown contact",
        employeeName: contact ? nameOf(contact.ownerId) : "Unassigned",
        provider: "google" as const,
      };
    });

  const fromAudit: ActivityItem[] = state.audit.map((e) => {
    const before = e.before ? nameOf(e.before) : "";
    const after = e.after ? nameOf(e.after) : "";
    switch (e.type) {
      case "lead.escalated":
        return { id: e.id, at: e.at, channel: "telegram", text: `Lead escalated from ${before} to ${after}` };
      case "lead.acknowledged":
        return { id: e.id, at: e.at, channel: "system", text: `${e.userName} acknowledged a lead in ${after}` };
      case "lead.recovered":
        return { id: e.id, at: e.at, channel: "system", text: "A lead moved to the recovery queue" };
      case "lead.reassigned":
        return { id: e.id, at: e.at, channel: "system", text: `${e.userName} reassigned a lead to ${after}` };
      case "payment.created":
        return { id: e.id, at: e.at, channel: "stripe", text: `${e.userName} sent a ${after}` };
      case "opportunity.moved":
        return { id: e.id, at: e.at, channel: "system", text: `${e.userName} moved a deal from ${before} to ${after}` };
      case "team.availability":
        return { id: e.id, at: e.at, channel: "system", text: `${e.userName} is now ${AVAILABILITY_LABEL[after.toLowerCase()] ?? after}` };
      case "stage.renamed":
        return { id: e.id, at: e.at, channel: "system", text: `${e.userName} renamed stage ${before} to ${after}` };
      default:
        return { id: e.id, at: e.at, channel: "system", text: `${e.userName}: ${e.type}` };
    }
  });
  const fromMessages: ActivityItem[] = state.messages
    .filter((m) => m.direction === "in")
    .map((m) => ({
      id: m.id,
      at: m.at,
      channel: "whatsapp" as const,
      text: `New WhatsApp message from ${state.contacts.find((c) => c.id === m.contactId)?.name ?? "a contact"}`,
    }));
  const activity = [...fromAudit, ...fromMessages]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  const summarize = (l: Lead): LeadSummary => ({
    id: l.id,
    name: l.name,
    source: l.source,
    status: l.status,
    ownerName: nameOf(l.ownerId),
    createdAt: l.createdAt,
  });

  return {
    generatedAt: now.toISOString(),
    scope,
    kpis,
    pipeline: { visible: canSeeMoney, stages: pipelineStages },
    recoveryQueue,
    highlightedLead,
    team,
    appointments,
    activity,
    integrations: state.integrations.map((i) => ({
      key: i.key,
      name: i.name,
      status: i.status,
      lastSuccessAt: i.lastSuccess,
      lastErrorAt: i.lastError,
    })),
    lists: { newLeads: newLeads.map(summarize), escalations: escalations.map(summarize) },
  };
}
