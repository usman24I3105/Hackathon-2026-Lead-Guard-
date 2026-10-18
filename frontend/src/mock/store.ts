import {
  appointments as seedAppointments,
  auditLog as seedAudit,
  contacts as seedContacts,
  companies as seedCompanies,
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
  Company,
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
import type { StoreLike } from "../state/storeTypes";
import type { DashboardData, DashboardScope } from "../api/types/dashboard";
import type { SearchResult, Workspace } from "../api/types/shell";
import { getSession } from "../lib/session";
import { buildDashboard } from "./dashboard";

export type RealtimeEvent =
  | { type: "lead.created"; leadId: string }
  | { type: "lead.escalated"; leadId: string; fromUserId: string; toUserId: string }
  | { type: "lead.acknowledged"; leadId: string }
  | { type: "lead.recovered"; leadId: string }
  | { type: "payment.updated"; paymentId: string }
  | { type: "message.updated"; contactId: string }
  | { type: "stream.reconnecting" }
  | { type: "stream.online" };

export interface State {
  team: TeamMember[];
  leads: Lead[];
  stages: StageDef[];
  customFields: CustomField[];
  contacts: Contact[];
  companies: Company[];
  opportunities: Opportunity[];
  messages: Message[];
  payments: Payment[];
  appointments: Appointment[];
  audit: AuditEntry[];
  integrations: Integration[];
  timelines: Record<string, TimelineEvent[]>;
  currentUserId: string;
  demoMode: boolean;
  assignmentRules: { acknowledgementSeconds: number; backupOwnerId: string; managerOwnerId: string };
}

type Listener = () => void;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export class Store implements StoreLike {
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
      companies: seedCompanies,
      opportunities: seedOpportunities,
      messages: seedMessages,
      payments: seedPayments,
      appointments: seedAppointments,
      audit: seedAudit,
      integrations: seedIntegrations,
      timelines: {},
      currentUserId: "u-imran",
      demoMode: false,
      assignmentRules: {
        acknowledgementSeconds: 10,
        backupOwnerId: seedTeam[1]?.id ?? seedTeam[0]?.id ?? "",
        managerOwnerId: seedTeam.find((member) => member.role === "Manager")?.id ?? seedTeam[0]?.id ?? "",
      },
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
        ackDeadline: new Date(now + this.state.assignmentRules.acknowledgementSeconds * 1000).toISOString(),
      };
    });
    if (changed) this.set({ leads });
  }

  // ---- auth (mock only — see api/realStore.ts for the real-backend path) ----
  async login(email: string, password: string): ReturnType<StoreLike["login"]> {
    await new Promise((r) => setTimeout(r, 450));
    if (!password || password.length < 4) {
      return { ok: false, error: "Incorrect email or password." };
    }
    const member = this.state.team.find((m) => m.id === "u-imran");
    if (!member) return { ok: false, error: "That account couldn't be found." };
    return {
      ok: true,
      session: { userId: member.id, name: member.name, email, role: member.role, workspace: "LeadGuard Roofing" },
    };
  }

  async signup(name: string, email: string, _password: string, workspace: string): ReturnType<StoreLike["signup"]> {
    await new Promise((r) => setTimeout(r, 450));
    if (email.toLowerCase() === "taken@leadguard.app") {
      return { ok: false, error: "That email is already in use on another workspace." };
    }
    return {
      ok: true,
      session: { userId: "u-owais", name, email, role: "Owner", workspace: workspace || "My Roofing Co." },
    };
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
    const inRotation = new Set(this.state.team.filter((member) => member.inRotation).map((member) => member.id));
    const path = [availableMember.id, this.state.assignmentRules.backupOwnerId, this.state.assignmentRules.managerOwnerId]
      .filter((id, index, all) => !!id && inRotation.has(id) && all.indexOf(id) === index);
    const lead = freshLead({
      ...input,
      ownerId: availableMember.id,
      ackDeadline: new Date(Date.now() + this.state.assignmentRules.acknowledgementSeconds * 1000).toISOString(),
      escalationPath: path.length ? path : [availableMember.id],
    });
    this.set((s) => ({ leads: [lead, ...s.leads] }));
    this.addTimeline(lead.id, `New lead captured from ${input.source}`);
    this.emit({ type: "lead.created", leadId: lead.id });
    return lead;
  }

  createContact(input: { name: string; phone: string; ownerId: string }) {
    const contact: Contact = {
      id: uid("c"),
      name: input.name.trim(),
      phone: input.phone.trim(),
      ownerId: input.ownerId,
      optedOut: false,
      createdAt: new Date().toISOString(),
    };
    this.set((s) => ({ contacts: [contact, ...s.contacts] }));
    this.addAudit({ type: "contact.created", userName: "You", after: contact.name });
    return contact;
  }

  createCompany(input: { name: string; contactIds: string[] }) {
    const company: Company = {
      id: uid("co"),
      name: input.name.trim(),
      contactIds: [...new Set(input.contactIds)],
      createdAt: new Date().toISOString(),
    };
    this.set((s) => ({ companies: [company, ...s.companies] }));
    this.addAudit({ type: "company.created", userName: "You", after: company.name });
    return company;
  }

  createOpportunity(input: { title: string; contactId: string; stageId: string; valueCents: number | null }) {
    const opportunity: Opportunity = {
      id: uid("op"),
      contactId: input.contactId,
      title: input.title.trim(),
      stageId: input.stageId,
      valueCents: input.valueCents,
      fields: {},
      createdAt: new Date().toISOString(),
    };
    this.set((s) => ({ opportunities: [opportunity, ...s.opportunities] }));
    const stage = this.state.stages.find((item) => item.id === input.stageId);
    this.addAudit({ type: "opportunity.created", userName: "You", after: `${opportunity.title} · ${stage?.name ?? "New"}` });
    return opportunity;
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
              ? { ...l, ownerId: fallback.id, ackDeadline: new Date(Date.now() + this.state.assignmentRules.acknowledgementSeconds * 1000).toISOString() }
              : l
          ),
        }));
      }
    }
  }

  setTeamFlags(userId: string, patch: Partial<TeamMember>) {
    this.set((s) => ({ team: s.team.map((m) => (m.id === userId ? { ...m, ...patch } : m)) }));
  }

  setAssignmentRules(rules: { acknowledgementSeconds: number; backupOwnerId: string; managerOwnerId: string }) {
    const validIds = new Set(this.state.team.map((member) => member.id));
    if (!Number.isInteger(rules.acknowledgementSeconds) || rules.acknowledgementSeconds < 5 || rules.acknowledgementSeconds > 300) {
      throw new Error("Acknowledgement window must be between 5 and 300 seconds.");
    }
    const backup = this.state.team.find((member) => member.id === rules.backupOwnerId);
    const manager = this.state.team.find((member) => member.id === rules.managerOwnerId);
    if (!validIds.has(rules.backupOwnerId) || !validIds.has(rules.managerOwnerId) || !backup?.inRotation || !manager?.inRotation) {
      throw new Error("Choose team members who are in the assignment rotation.");
    }
    if (manager.role === "User") {
      throw new Error("Choose an owner or manager for the manager escalation step.");
    }
    this.set({ assignmentRules: { ...rules } });
    this.addAudit({ type: "assignment.rules_updated", userName: "You", after: `${rules.acknowledgementSeconds}s acknowledgement window` });
  }

  reassignLead(leadId: string, userId: string) {
    const member = this.state.team.find((m) => m.id === userId);
    this.set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId
          ? { ...l, ownerId: userId, status: "waiting", level: 1, ackDeadline: new Date(Date.now() + this.state.assignmentRules.acknowledgementSeconds * 1000).toISOString(), recoveryReason: undefined }
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
    const contact = this.state.contacts.find((c) => c.id === contactId);
    if (contact?.optedOut) {
      throw new Error("Contact has opted out of messaging.");
    }

    const msg: Message = { id: uid("m"), contactId, direction: "out", body, status: "queued", at: new Date().toISOString() };
    this.set((s) => ({ messages: [...s.messages, msg] }));

    // Real Twilio API dispatch
    const toPhone = contact?.phone || "+817054633568";
    fetch("http://localhost:3000/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toPhone,
        body,
        isWhatsApp: false,
        optedOut: contact?.optedOut || false,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        this.set((s) => ({
          messages: s.messages.map((m) => (m.id === msg.id ? { ...m, status: "sent" } : m)),
        }));
        this.emit({ type: "message.updated", contactId });
        // Simulate delivery confirmation callback
        window.setTimeout(() => {
          this.set((s) => ({
            messages: s.messages.map((m) => (m.id === msg.id ? { ...m, status: "delivered" } : m)),
          }));
          this.emit({ type: "message.updated", contactId });
        }, 1500);
      })
      .catch((err) => {
        console.error("Outbound message failed:", err.message);
        this.set((s) => ({
          messages: s.messages.map((m) => (m.id === msg.id ? { ...m, status: "failed" } : m)),
        }));
        this.emit({ type: "message.updated", contactId });
      });
  }

  retryMessage(messageId: string) {
    const msg = this.state.messages.find((m) => m.id === messageId);
    if (!msg) return;
    this.set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: "queued" } : m)) }));
    this.sendMessage(msg.contactId, msg.body);
  }

  createPaymentLink(contactId: string, amountCents: number, memo: string) {
    const payment: Payment = {
      id: uid("p"),
      contactId,
      amountCents,
      status: "pending",
      url: "",
      createdAt: new Date().toISOString(),
      memo,
    };
    this.set((s) => ({ payments: [payment, ...s.payments] }));
    this.addAudit({ type: "payment.created", userName: "You", after: `$${(amountCents / 100).toFixed(2)} link` });

    // Call real Stripe backend endpoint
    fetch("http://localhost:3000/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents,
        title: memo || "Opportunity Payment",
        contactId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.checkoutUrl) {
          this.set((s) => ({
            payments: s.payments.map((p) => (p.id === payment.id ? { ...p, url: data.checkoutUrl } : p)),
          }));
          this.emit({ type: "payment.updated", paymentId: payment.id });
        }
      })
      .catch((err) => console.error("Stripe Checkout creation failed:", err));

    return payment;
  }

  toggleOptOut(contactId: string, optedOut: boolean) {
    this.set((s) => ({ contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, optedOut } : c)) }));
  }

  bookAppointment(contactId: string, title: string, start: string, end: string) {
    const contact = this.state.contacts.find((c) => c.id === contactId);
    const appt: Appointment = { id: uid("a"), contactId, title, start, end, status: "booked" };
    this.set((s) => ({ appointments: [...s.appointments, appt] }));

    // Real Google Calendar booking dispatch
    fetch("http://localhost:3000/api/calendar/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: contact?.name || "Customer",
        customerEmail: "demo@example.com",
        summary: title,
        startDateTime: start,
        endDateTime: end,
        checkConflict: true,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("Appointment booked on Google Calendar:", data.htmlLink);
      })
      .catch((err) => {
        console.error("Calendar booking failed:", err.message);
      });

    return appt;
  }

  cancelAppointment(id: string) {
    this.set((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)) }));
  }

  addStage(name: string) {
    const stage: StageDef = { id: uid("st"), name, requiredFields: [] };
    this.set((s) => ({ stages: [...s.stages, stage] }));
  }

  setStageConfig(id: string, patch: { requiredFields?: string[]; isClosed?: boolean }) {
    const existing = this.state.stages.find((stage) => stage.id === id);
    if (!existing) return;
    const validFields = new Set(this.state.customFields.map((field) => field.label));
    const requiredFields = patch.requiredFields ?? existing.requiredFields;
    if (requiredFields.some((field) => !validFields.has(field))) throw new Error("A required field no longer exists.");
    this.set((s) => ({ stages: s.stages.map((stage) => stage.id === id ? { ...stage, ...patch, requiredFields: [...requiredFields] } : stage) }));
    this.addAudit({ type: "stage.config_updated", userName: "You", before: existing.name, after: patch.isClosed === undefined ? "Required fields updated" : patch.isClosed ? "Closed" : "Open" });
  }

  reorderStage(id: string, targetIndex: number) {
    const stages = [...this.state.stages];
    const currentIndex = stages.findIndex((stage) => stage.id === id);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= stages.length) return;
    const [stage] = stages.splice(currentIndex, 1);
    stages.splice(targetIndex, 0, stage);
    this.set({ stages });
    this.addAudit({ type: "stage.reordered", userName: "You", after: stage.name });
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

  async getDashboard(scope: DashboardScope): Promise<DashboardData> {
    return buildDashboard(this.state, getSession(), scope);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const name = getSession()?.workspace ?? "LeadGuard Roofing";
    return [{ id: "ws-1", name, current: true }];
  }

  async switchWorkspace(): Promise<void> {
    // Mock mode has a single workspace; nothing to switch to.
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, "");
    const matches = (name: string, phone: string) =>
      name.toLowerCase().includes(q) || (digits.length >= 3 && phone.replace(/\D/g, "").includes(digits));
    const contacts: SearchResult[] = this.state.contacts
      .filter((c) => matches(c.name, c.phone))
      .map((c) => ({ kind: "contact", id: c.id, title: c.name, subtitle: `Contact · ${c.phone}` }));
    const leads: SearchResult[] = this.state.leads
      .filter((l) => matches(l.name, l.phone))
      .map((l) => ({ kind: "lead", id: l.id, title: l.name, subtitle: `Lead · ${l.source}` }));
    return [...contacts, ...leads].slice(0, 8);
  }
}

export const store = new Store();
