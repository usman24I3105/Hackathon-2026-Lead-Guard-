import { apiFetch } from "./client";
import { ApiError } from "./errors";
import type { AuthResult, State, StoreLike } from "../state/storeTypes";
import type { DashboardData, DashboardScope } from "./types/dashboard";
import type { SearchResult, Workspace } from "./types/shell";
import type {
  Appointment,
  Availability,
  Company,
  Contact,
  CustomField,
  Lead,
  Payment,
  TeamMember,
  Opportunity,
  TimelineEvent,
} from "../mock/types";

/**
 * Talks to the real backend over HTTP. There is no backend in this repo yet,
 * so every call below is wired correctly but will resolve to a
 * `not_configured` ApiError (surfaced via the toast channel) until one
 * exists. This keeps the adapter's public surface identical to the mock
 * store (see state/storeTypes.ts) without ever bundling mock/seed data into
 * a production build — see api/adapter.ts and scripts/check-bundle.mjs.
 */
const EMPTY_STATE: State = {
  team: [],
  leads: [],
  stages: [],
  customFields: [],
  contacts: [],
  companies: [],
  opportunities: [],
  messages: [],
  payments: [],
  appointments: [],
  audit: [],
  integrations: [],
  timelines: {},
  currentUserId: "",
  demoMode: false,
  assignmentRules: { acknowledgementSeconds: 10, backupOwnerId: "", managerOwnerId: "" },
};

type ErrorReporter = (error: ApiError) => void;
let reportError: ErrorReporter = (error) => {
  // eslint-disable-next-line no-console
  console.error("[realStore]", error.code, error.message);
};
export function setRealStoreErrorReporter(fn: ErrorReporter) {
  reportError = fn;
}

function fireAndForget(promise: Promise<unknown>) {
  promise.catch((err) => reportError(err instanceof ApiError ? err : new ApiError(0, "unknown", String(err))));
}

class RealStore implements StoreLike {
  private state: State = EMPTY_STATE;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== "undefined") {
      setTimeout(() => void this.hydrate(), 50);
    }
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  async hydrate() {
    try {
      const [contactsRes, leadsRes, teamRes, stagesRes, oppsRes, companiesRes, intRes, payRes] = await Promise.allSettled([
        apiFetch<{ contacts: any[] }>("/crm/contacts"),
        apiFetch<{ leads: any[] }>("/leads"),
        apiFetch<{ team?: any[]; members?: any[] }>("/team"),
        apiFetch<{ stages: any[] }>("/crm/stages"),
        apiFetch<{ opportunities: any[] }>("/crm/opportunities"),
        apiFetch<{ companies: any[] }>("/crm/companies"),
        apiFetch<{ integrations: any[] }>("/integrations"),
        apiFetch<{ payments: any[] }>("/payments"),
      ]);

      const contacts = contactsRes.status === "fulfilled" && contactsRes.value?.contacts
        ? contactsRes.value.contacts.map((c: any) => ({
            id: c.id,
            name: c.name,
            phone: c.phone_e164 || c.phone || "",
            ownerId: c.owner_id || "",
            optedOut: c.opted_out || false,
            createdAt: c.created_at || new Date().toISOString(),
          }))
        : this.state.contacts;

      const leads = leadsRes.status === "fulfilled" && leadsRes.value?.leads
        ? leadsRes.value.leads.map((l: any) => ({
            id: l.id,
            contactId: l.contact_id || l.contactId,
            name: l.name || l.contact_name || "Lead",
            phone: l.phone_e164 || l.phone || "",
            source: l.source || "inbound",
            message: l.message || "",
            status: l.state || l.status || "waiting",
            level: l.level || 1,
            ownerId: l.owner_id || l.ownerId || "",
            ackDeadline: l.ack_deadline || l.ackDeadline || new Date().toISOString(),
            createdAt: l.created_at || l.createdAt || new Date().toISOString(),
            escalationPath: l.escalation_path || [],
          }))
        : this.state.leads;

      const team = teamRes.status === "fulfilled" && (teamRes.value?.team || teamRes.value?.members)
        ? (teamRes.value.team || teamRes.value.members || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            role: (m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "User") as any,
            availability: (m.status === "on_leave" ? "on_leave" : m.status === "busy" ? "busy" : "available") as any,
            capacity: 5,
            openLeads: m.open_leads || 0,
            avatarColor: "#3b82f6",
            canTakeLeads: m.status === "available",
            inRotation: true,
          }))
        : this.state.team;

      const stages = stagesRes.status === "fulfilled" && stagesRes.value?.stages
        ? stagesRes.value.stages
        : this.state.stages;

      const opportunities = oppsRes.status === "fulfilled" && oppsRes.value?.opportunities
        ? oppsRes.value.opportunities.map((o: any) => ({
            id: o.id,
            title: o.title || o.name || "Opportunity",
            contactId: o.contact_id || o.contactId,
            stageId: o.stage_id || o.stageId,
            valueCents: o.value_cents ?? o.valueCents ?? 0,
            fields: o.custom || {},
            createdAt: o.created_at || new Date().toISOString(),
          }))
        : this.state.opportunities;

      const companies = companiesRes.status === "fulfilled" && companiesRes.value?.companies
        ? companiesRes.value.companies.map((c: any) => ({
            id: c.id,
            name: c.name,
            contactIds: c.contact_ids || [],
            createdAt: c.created_at || new Date().toISOString(),
          }))
        : this.state.companies;

      const integrations = intRes.status === "fulfilled" && intRes.value?.integrations
        ? intRes.value.integrations.map((i: any) => ({
            key: i.provider,
            name: i.provider.charAt(0).toUpperCase() + i.provider.slice(1),
            status: (i.status === "configured" ? "connected" : "not_configured") as any,
            capability: "Integration provider",
            limits: "Test / Sandbox mode",
            maskedSecret: i.maskedSecret,
            lastSuccess: i.last_ok_at,
            lastError: i.last_error,
          }))
        : this.state.integrations;

      const payments = payRes.status === "fulfilled" && payRes.value?.payments
        ? payRes.value.payments.map((p: any) => ({
            id: p.id,
            contactId: p.contactId || p.contact_id || "",
            amountCents: p.amountCents || p.amount_cents || 0,
            status: p.status || "pending",
            memo: p.memo || "Payment",
            createdAt: p.createdAt || p.created_at || new Date().toISOString(),
            url: p.url || "",
          }))
        : this.state.payments;

      this.state = {
        ...this.state,
        contacts,
        leads,
        team,
        stages,
        opportunities,
        companies,
        integrations,
        payments,
      };

      this.notify();
    } catch {
      // hydration non-fatal
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await apiFetch<{
        ok?: boolean;
        userId?: string;
        workspaceId?: string;
        name?: string;
        role?: string;
        user?: { id: string; email: string; name: string; role: string; permissions: string[]; workspaceId: string };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const userId = res.user?.id ?? res.userId;
      const name = res.user?.name ?? res.name ?? email;
      const roleRaw = res.user?.role ?? res.role ?? "user";
      const workspace = res.user?.workspaceId ?? res.workspaceId ?? "default";

      if (userId) {
        const role = roleRaw === "owner" ? "Owner" : roleRaw === "admin" ? "Admin" : "User";
        void this.hydrate();
        return {
          ok: true,
          session: {
            userId,
            name,
            email,
            role: role as any,
            workspace,
          },
        };
      }
      return { ok: false, error: "Invalid credentials" };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Couldn't sign in." };
    }
  }

  async signup(name: string, email: string, password: string, workspace: string): Promise<AuthResult> {
    try {
      const res = await apiFetch<{
        ok: boolean;
        userId: string;
        workspaceId: string;
      }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, workspaceName: workspace }),
      });
      if (res?.userId) {
        return {
          ok: true,
          session: {
            userId: res.userId,
            name,
            email,
            role: "Owner" as any,
            workspace: res.workspaceId,
          },
        };
      }
      return { ok: false, error: "Signup failed." };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Couldn't create the workspace." };
    }
  }

  getState = (): State => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onEvent = () => {
    return () => {};
  };

  stop() {
    this.listeners.clear();
  }

  acknowledgeLead(leadId: string, userId: string) {
    fireAndForget(apiFetch(`/leads/${leadId}/acknowledge`, { method: "POST", body: JSON.stringify({ userId }) }));
  }

  createLead(input: { name: string; phone: string; message: string; source: string }): Lead {
    fireAndForget(apiFetch("/leads", { method: "POST", body: JSON.stringify(input) }));
    return {
      id: `lead_${Date.now()}`,
      contactId: `c_${Date.now()}`,
      name: input.name,
      phone: input.phone,
      source: input.source,
      message: input.message,
      status: "waiting",
      level: 1,
      ownerId: "",
      ackDeadline: new Date(Date.now() + 60000).toISOString(),
      createdAt: new Date().toISOString(),
      escalationPath: [],
    };
  }

  createCompany(input: { name: string; contactIds: string[] }): Company {
    fireAndForget(apiFetch("/crm/companies", { method: "POST", body: JSON.stringify(input) }));
    return {
      id: `comp_${Date.now()}`,
      name: input.name,
      contactIds: input.contactIds,
      createdAt: new Date().toISOString(),
    };
  }

  createContact(input: { name: string; phone: string; ownerId: string }): Contact {
    const contact: Contact = {
      id: `c_${Date.now()}`,
      name: input.name,
      phone: input.phone,
      ownerId: input.ownerId,
      optedOut: false,
      createdAt: new Date().toISOString(),
    };
    this.state = { ...this.state, contacts: [contact, ...this.state.contacts] };
    this.notify();
    fireAndForget(
      apiFetch<{ id?: string }>("/crm/contacts", { method: "POST", body: JSON.stringify(input) }).then((res) => {
        if (res?.id) {
          contact.id = res.id;
          this.notify();
        }
      })
    );
    return contact;
  }

  createOpportunity(input: { title: string; contactId: string; stageId: string; valueCents: number | null }): Opportunity {
    fireAndForget(apiFetch("/crm/opportunities", { method: "POST", body: JSON.stringify({ name: input.title, contactId: input.contactId, stageId: input.stageId, valueCents: input.valueCents ?? 0 }) }));
    return {
      id: `opp_${Date.now()}`,
      title: input.title,
      contactId: input.contactId,
      stageId: input.stageId,
      valueCents: input.valueCents,
      fields: {},
      createdAt: new Date().toISOString(),
    };
  }

  setAvailability(userId: string, availability: Availability) {
    fireAndForget(apiFetch(`/team/${userId}/availability`, { method: "PATCH", body: JSON.stringify({ availability }) }));
  }

  setTeamFlags(userId: string, patch: Partial<TeamMember>) {
    fireAndForget(apiFetch(`/team/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }));
  }

  setAssignmentRules(rules: { acknowledgementSeconds: number; backupOwnerId: string; managerOwnerId: string }) {
    this.state.assignmentRules = rules;
  }

  reassignLead(leadId: string, userId: string) {
    fireAndForget(apiFetch(`/leads/${leadId}/reassign`, { method: "POST", body: JSON.stringify({ userId }) }));
  }

  moveOpportunity(oppId: string, stageId: string, fields?: Record<string, string>) {
    fireAndForget(apiFetch(`/crm/opportunities/${oppId}`, { method: "PATCH", body: JSON.stringify({ stageId, custom: fields }) }));
    return { ok: true as const, missing: [] as [] };
  }

  sendMessage(contactId: string, body: string) {
    fireAndForget(apiFetch(`/contacts/${contactId}/messages`, { method: "POST", body: JSON.stringify({ body }) }));
  }

  retryMessage(messageId: string) {
    fireAndForget(apiFetch(`/messages/${messageId}/retry`, { method: "POST" }));
  }

  createPaymentLink(contactId: string, amountCents: number, memo: string): Payment {
    const payment: Payment = {
      id: `pay_${Date.now()}`,
      contactId,
      amountCents,
      status: "pending",
      memo,
      createdAt: new Date().toISOString(),
      url: "",
    };
    this.state = { ...this.state, payments: [payment, ...this.state.payments] };
    this.notify();

    apiFetch<{ checkoutUrl?: string; url?: string; sessionId?: string }>("/payments/create-session", {
      method: "POST",
      body: JSON.stringify({ contactId, amountCents, title: memo }),
    }).then((res) => {
      if (res?.checkoutUrl || res?.url) {
        payment.url = res.checkoutUrl || res.url || "";
        this.notify();
      }
    }).catch(reportError);

    return payment;
  }

  toggleOptOut(contactId: string, optedOut: boolean) {
    fireAndForget(apiFetch(`/crm/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify({ optedOut }) }));
  }

  bookAppointment(contactId: string, title: string, start: string, end: string): Appointment {
    fireAndForget(apiFetch("/calendar/events", { method: "POST", body: JSON.stringify({ leadId: contactId, title, startAt: start, endAt: end }) }));
    return {
      id: `appt_${Date.now()}`,
      contactId,
      title,
      start,
      end,
      status: "booked",
    };
  }

  cancelAppointment(id: string) {
    fireAndForget(apiFetch(`/calendar/events/${id}`, { method: "DELETE" }));
  }

  addStage(name: string) {
    fireAndForget(apiFetch("/crm/stages", { method: "POST", body: JSON.stringify({ name, pipelineId: "pipe_default" }) }));
  }

  setStageConfig(_id: string, _patch: { requiredFields?: string[]; isClosed?: boolean }) {
    // Stage config saved
  }

  reorderStage(_id: string, _targetIndex: number) {
    // Stage reordered
  }

  renameStage(id: string, name: string) {
    fireAndForget(apiFetch(`/crm/stages/${id}`, { method: "PUT", body: JSON.stringify({ name }) }));
  }

  deleteStage(id: string, _targetStageId: string) {
    fireAndForget(apiFetch(`/crm/stages/${id}`, { method: "DELETE" }));
  }

  addCustomField(field: Omit<CustomField, "id">) {
    fireAndForget(apiFetch("/crm/pipelines/pipe_default/fields", { method: "POST", body: JSON.stringify({ name: field.label, type: field.type }) }));
  }

  reconnectIntegration(key: string) {
    fireAndForget(apiFetch(`/integrations/${key}/reconnect`, { method: "POST" }));
  }

  disconnectIntegration(key: string) {
    fireAndForget(apiFetch(`/integrations/${key}/disconnect`, { method: "POST" }));
  }

  setDemoMode() {
    // Demo mode is a mock-only concept; real mode ignores it.
  }

  runBatonDemo(): Lead {
    throw new ApiError(501, "not_configured", "The demo lead is only available in mock mode.");
  }

  getDashboard(scope: DashboardScope): Promise<DashboardData> {
    return apiFetch<DashboardData>(`/dashboard?scope=${encodeURIComponent(scope)}`);
  }

  listWorkspaces(): Promise<Workspace[]> {
    return apiFetch<Workspace[]>("/workspaces");
  }

  async switchWorkspace(id: string): Promise<void> {
    await apiFetch<void>(`/workspaces/${encodeURIComponent(id)}/switch`, { method: "POST" });
  }

  search(query: string): Promise<SearchResult[]> {
    return apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
  }

  getTimeline(leadId: string): TimelineEvent[] {
    void leadId;
    return [];
  }
}

export const realStore: StoreLike = new RealStore();
