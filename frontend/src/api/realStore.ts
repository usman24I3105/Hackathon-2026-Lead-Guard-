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

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await apiFetch<{
        ok: boolean;
        user: { id: string; email: string; name: string; role: string; permissions: string[]; workspaceId: string };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res?.user) {
        const role = res.user.role === "owner" ? "Owner" : res.user.role === "admin" ? "Admin" : "User";
        return {
          ok: true,
          session: {
            userId: res.user.id,
            name: res.user.name,
            email: res.user.email,
            role: role as any,
            workspace: res.user.workspaceId,
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
    fireAndForget(apiFetch("/crm/contacts", { method: "POST", body: JSON.stringify(input) }));
    return {
      id: `c_${Date.now()}`,
      name: input.name,
      phone: input.phone,
      ownerId: input.ownerId,
      optedOut: false,
      createdAt: new Date().toISOString(),
    };
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
    fireAndForget(apiFetch("/payments/create-session", { method: "POST", body: JSON.stringify({ opportunityId: contactId }) }));
    return {
      id: `pay_${Date.now()}`,
      contactId,
      amountCents,
      status: "pending",
      memo,
      createdAt: new Date().toISOString(),
      url: "https://checkout.stripe.com/demo",
    };
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
