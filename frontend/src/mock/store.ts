import {
  appointments as seedAppointments,
  auditLog as seedAudit,
  contacts as seedContacts,
  customFields as seedFields,
  freshLead,
  initialLeads,
  integrations as seedIntegrations,
  messages as seedMessages,
  opportunities as seedOpportunities,
  payments as seedPayments,
  stages as seedStages,
  team as seedTeam,
} from "./data";
import type {
  Appointment,
  AuditEntry,
  Availability,
  Contact,
  CustomField,
  Integration,
  Lead,
  Message,
  Opportunity,
  Payment,
  StageDef,
  TeamMember,
  TimelineEvent,
} from "./types";

export type RealtimeEvent =
  | { type: "lead.created"; leadId: string }
  | { type: "lead.escalated"; leadId: string; fromUserId: string; toUserId: string }
  | { type: "lead.acknowledged"; leadId: string }
  | { type: "lead.recovered"; leadId: string }
  | { type: "payment.updated"; paymentId: string }
  | { type: "message.updated"; contactId: string }
  | { type: "stream.reconnecting" }
  | { type: "stream.online" };

interface State {
  team: TeamMember[];
  leads: Lead[];
  stages: StageDef[];
  customFields: CustomField[];
  contacts: Contact[];
  opportunities: Opportunity[];
  messages: Message[];
  payments: Payment[];
  appointments: Appointment[];
  audit: AuditEntry[];
  integrations: Integration[];
  timelines: Record<string, TimelineEvent[]>;
  currentUserId: string;
  demoMode: boolean;
}

type Listener = () => void;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

class Store {
  private state: State;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<(e: RealtimeEvent) => void>();
  private tickHandle: number | null = null;

  constructor() {
    this.state = {
      team: seedTeam,
      leads: initialLeads,
      stages: seedStages,
      customFields: seedFields,
      contacts: seedContacts,
      opportunities: seedOpportunities,
      messages: seedMessages,
      payments: seedPayments,
      appointments: seedAppointments,
      audit: seedAudit,
      integrations: seedIntegrations,
      timelines: {},
      currentUserId: "u-imran",
      demoMode: false,
    };
    this.startTicking();
  }

  getState = () => {
    return this.state;
  };

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onEvent = (fn: (e: RealtimeEvent) => void) => {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  };

  private set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }

  private emit(e: RealtimeEvent) {
    this.eventListeners.forEach((fn) => fn(e));
  }

  private addAudit(entry: Omit<AuditEntry, "id" | "at">) {
    const row: AuditEntry = { ...entry, id: uid("au"), at: new Date().toISOString() };
    this.set((s) => ({ audit: [row, ...s.audit] }));
  }

  private addTimeline(leadId: string, label: string, actor: "system" | "user" = "system", actorName = "System") {
    const row: TimelineEvent = { id: uid("tl"), actor, actorName, label, at: new Date().toISOString() };
    this.set((s) => ({ timelines: { ...s.timelines, [leadId]: [...(s.timelines[leadId] ?? []), row] } }));
  }

  // ---- escalation engine ----
  private startTicking() {
    this.tickHandle = window.setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.tickHandle) window.clearInterval(this.tickHandle);
  }

  private tick() {
    const now = Date.now();
    let changed = false;
    const leads = this.state.leads.map((lead) => {
      if (lead.status !== "waiting" && lead.status !== "escalated") return lead;
      const deadline = new Date(lead.ackDeadline).getTime();
      if (now < deadline) return lead;
      changed = true;
      const nextLevel = Math.min(3, lead.level + 1) as 1 | 2 | 3;
      const fromUserId = lead.ownerId;
      const path = lead.escalationPath;
      const nextOwnerId = path[Math.min(nextLevel - 1, path.length - 1)] ?? lead.ownerId;
      if (nextLevel >= 3 && nextOwnerId === fromUserId) {
        this.addTimeline(lead.id, `Moved to recovery queue — no acknowledgement`);
        this.addAudit({ type: "lead.recovered", userName: "System", before: "Escalated", after: "Recovery" });
        this.emit({ type: "lead.recovered", leadId: lead.id });
        return { ...lead, status: "recovery" as const, recoveryReason: "No acknowledgement after full escalation" };
      }
      const toMember = this.state.team.find((m) => m.id === nextOwnerId);
      this.addTimeline(lead.id, `Escalated to ${toMember?.name ?? nextOwnerId} — no acknowledgement in 10s`);
      this.addAudit({ type: "lead.escalated", userName: "System", before: fromUserId, after: nextOwnerId });
      this.emit({ type: "lead.escalated", leadId: lead.id, fromUserId, toUserId: nextOwnerId });
      return {
        ...lead,
        status: "escalated" as const,
        level: nextLevel,
        ownerId: nextOwnerId,
        ackDeadline: new Date(now + 10_000).toISOString(),
      };
    });
    if (changed) this.set({ leads });
  }

  // ---- actions ----
  acknowledgeLead(leadId: string, userId: string) {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) return;
    const ttfr = Math.round((Date.now() - new Date(lead.createdAt).getTime()) / 1000);
    this.set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId ? { ...l, status: "acknowledged", ackedAt: new Date().toISOString(), ttfrSeconds: ttfr } : l
      ),
    }));
    const member = this.state.team.find((m) => m.id === userId);
    this.addTimeline(leadId, `Acknowledged by ${member?.name ?? userId} — first response in ${ttfr}s`, "user", member?.name);
    this.addAudit({ type: "lead.acknowledged", userName: member?.name ?? userId, after: `${ttfr}s` });
    this.emit({ type: "lead.acknowledged", leadId });
  }

  createLead(input: { name: string; phone: string; message: string; source: string }) {
    const availableMember = this.state.team.find((m) => m.availability === "available" && m.inRotation) ?? this.state.team[0];
    const path = this.state.team.filter((m) => m.inRotation).map((m) => m.id);
    const lead = freshLead({ ...input, ownerId: availableMember.id, escalationPath: path.length ? path : [availableMember.id] });
    this.set((s) => ({ leads: [lead, ...s.leads] }));
    this.addTimeline(lead.id, `New lead captured from ${input.source}`);
    this.emit({ type: "lead.created", leadId: lead.id });
    return lead;
  }

  setAvailability(userId: string, availability: Availability) {
    const member = this.state.team.find((m) => m.id === userId);
    this.set((s) => ({ team: s.team.map((m) => (m.id === userId ? { ...m, availability } : m)) }));
    this.addAudit({ type: "team.availability", userName: member?.name ?? userId, after: availability });
    if (availability !== "available") {
      // reassign their waiting leads immediately to an available teammate
      const fallback = this.state.team.find((m) => m.id !== userId && m.availability === "available" && m.inRotation);
      if (fallback) {
        this.set((s) => ({
          leads: s.leads.map((l) =>
            l.ownerId === userId && (l.status === "waiting" || l.status === "escalated")
              ? { ...l, ownerId: fallback.id, ackDeadline: new Date(Date.now() + 10_000).toISOString() }
              : l
          ),
        }));
      }
    }
  }

  setTeamFlags(userId: string, patch: Partial<TeamMember>) {
    this.set((s) => ({ team: s.team.map((m) => (m.id === userId ? { ...m, ...patch } : m)) }));
  }

  reassignLead(leadId: string, userId: string) {
    const member = this.state.team.find((m) => m.id === userId);
    this.set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId
          ? { ...l, ownerId: userId, status: "waiting", level: 1, ackDeadline: new Date(Date.now() + 10_000).toISOString(), recoveryReason: undefined }
          : l
      ),
    }));
    this.addTimeline(leadId, `Reassigned to ${member?.name ?? userId}`, "user");
    this.addAudit({ type: "lead.reassigned", userName: "You", after: member?.name ?? userId });
  }

  moveOpportunity(oppId: string, stageId: string, fields?: Record<string, string>) {
    const opp = this.state.opportunities.find((o) => o.id === oppId);
    const stage = this.state.stages.find((s) => s.id === stageId);
    if (!opp || !stage) return { ok: false as const, missing: [] as string[] };
    const merged = { ...opp.fields, ...(fields ?? {}) };
    const missing = stage.requiredFields.filter((f) => !merged[f]);
    if (missing.length) return { ok: false as const, missing };
    const fromStage = this.state.stages.find((s) => s.id === opp.stageId);
    this.set((s) => ({
      opportunities: s.opportunities.map((o) => (o.id === oppId ? { ...o, stageId, fields: merged } : o)),
    }));
    this.addAudit({ type: "opportunity.moved", userName: "You", before: fromStage?.name, after: stage.name });
    return { ok: true as const, missing: [] };
  }

  sendMessage(contactId: string, body: string) {
    const msg: Message = { id: uid("m"), contactId, direction: "out", body, status: "queued", at: new Date().toISOString() };
    this.set((s) => ({ messages: [...s.messages, msg] }));
    window.setTimeout(() => {
      this.set((s) => ({ messages: s.messages.map((m) => (m.id === msg.id ? { ...m, status: "sent" } : m)) }));
      this.emit({ type: "message.updated", contactId });
    }, 500);
    window.setTimeout(() => {
      const delivered = Math.random() > 0.15;
      this.set((s) => ({
        messages: s.messages.map((m) => (m.id === msg.id ? { ...m, status: delivered ? "delivered" : "failed" } : m)),
      }));
      this.emit({ type: "message.updated", contactId });
    }, 1600);
  }

  retryMessage(messageId: string) {
    this.set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: "queued" } : m)) }));
    window.setTimeout(() => {
      this.set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: "delivered" } : m)) }));
    }, 900);
  }

  createPaymentLink(contactId: string, amountCents: number, memo: string) {
    const payment: Payment = {
      id: uid("p"),
      contactId,
      amountCents,
      status: "pending",
      url: `https://pay.leadguard.app/lnk/${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      memo,
    };
    this.set((s) => ({ payments: [payment, ...s.payments] }));
    this.addAudit({ type: "payment.created", userName: "You", after: `$${(amountCents / 100).toFixed(2)} link` });
    window.setTimeout(() => {
      this.set((s) => ({ payments: s.payments.map((p) => (p.id === payment.id ? { ...p, status: "paid" } : p)) }));
      this.emit({ type: "payment.updated", paymentId: payment.id });
    }, 5000);
    return payment;
  }

  toggleOptOut(contactId: string, optedOut: boolean) {
    this.set((s) => ({ contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, optedOut } : c)) }));
  }

  bookAppointment(contactId: string, title: string, start: string, end: string) {
    const appt: Appointment = { id: uid("a"), contactId, title, start, end, status: "booked" };
    this.set((s) => ({ appointments: [...s.appointments, appt] }));
    return appt;
  }

  cancelAppointment(id: string) {
    this.set((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)) }));
  }

  addStage(name: string) {
    const stage: StageDef = { id: uid("st"), name, requiredFields: [] };
    this.set((s) => ({ stages: [...s.stages, stage] }));
  }

  renameStage(id: string, name: string) {
    const prior = this.state.stages.find((s) => s.id === id)?.name;
    this.set((s) => ({ stages: s.stages.map((st) => (st.id === id ? { ...st, name } : st)) }));
    this.addAudit({ type: "stage.renamed", userName: "You", before: prior, after: name });
  }

  deleteStage(id: string, targetStageId: string) {
    this.set((s) => ({
      stages: s.stages.filter((st) => st.id !== id),
      opportunities: s.opportunities.map((o) => (o.stageId === id ? { ...o, stageId: targetStageId } : o)),
    }));
  }

  addCustomField(field: Omit<CustomField, "id">) {
    this.set((s) => ({ customFields: [...s.customFields, { ...field, id: uid("cf") }] }));
  }

  reconnectIntegration(key: string) {
    this.set((s) => ({
      integrations: s.integrations.map((i) => (i.key === key ? { ...i, status: "connected", lastSuccess: new Date().toISOString(), lastError: undefined } : i)),
    }));
  }

  disconnectIntegration(key: string) {
    this.set((s) => ({ integrations: s.integrations.map((i) => (i.key === key ? { ...i, status: "not_configured" } : i)) }));
  }

  setDemoMode(on: boolean) {
    this.set({ demoMode: on });
  }

  runBatonDemo() {
    const lead = this.createLead({ name: "Harold Benning", phone: "+1 555-0999", message: "Need an urgent roof inspection after last night's storm.", source: "Public form" });
    return lead;
  }

  getTimeline(leadId: string) {
    return this.state.timelines[leadId] ?? [];
  }
}

export const store = new Store();
