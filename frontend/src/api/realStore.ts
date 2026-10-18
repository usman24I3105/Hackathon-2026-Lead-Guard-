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
      return await apiFetch<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Couldn't sign in." };
    }
  }

  async signup(name: string, email: string, password: string, workspace: string): Promise<AuthResult> {
    try {
      return await apiFetch<AuthResult>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password, workspace }) });
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
    // Wired up by realtime/stream.ts once a backend exists; no-op until then.
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
    throw new ApiError(501, "not_configured", "Lead creation needs a connected backend.");
  }

  createCompany(_input: { name: string; contactIds: string[] }): Company {
    throw new ApiError(501, "not_configured", "Company records need a connected backend.");
  }

  createContact(_input: { name: string; phone: string; ownerId: string }): Contact {
    throw new ApiError(501, "not_configured", "Contact creation needs a connected backend.");
  }

  createOpportunity(_input: { title: string; contactId: string; stageId: string; valueCents: number | null }): Opportunity {
    throw new ApiError(501, "not_configured", "Opportunity creation needs a connected backend.");
  }

  setAvailability(userId: string, availability: Availability) {
    fireAndForget(apiFetch(`/team/${userId}/availability`, { method: "PATCH", body: JSON.stringify({ availability }) }));
  }

  setTeamFlags(userId: string, patch: Partial<TeamMember>) {
    fireAndForget(apiFetch(`/team/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }));
  }

  setAssignmentRules(_rules: { acknowledgementSeconds: number; backupOwnerId: string; managerOwnerId: string }) {
    throw new ApiError(501, "not_configured", "Assignment settings need a connected backend.");
  }

  reassignLead(leadId: string, userId: string) {
    fireAndForget(apiFetch(`/leads/${leadId}/reassign`, { method: "POST", body: JSON.stringify({ userId }) }));
  }

  moveOpportunity(oppId: string, stageId: string, fields?: Record<string, string>) {
    fireAndForget(apiFetch(`/opportunities/${oppId}/move`, { method: "POST", body: JSON.stringify({ stageId, fields }) }));
    return { ok: true as const, missing: [] as [] };
  }

  sendMessage(contactId: string, body: string) {
    fireAndForget(apiFetch(`/contacts/${contactId}/messages`, { method: "POST", body: JSON.stringify({ body }) }));
  }

  retryMessage(messageId: string) {
    fireAndForget(apiFetch(`/messages/${messageId}/retry`, { method: "POST" }));
  }

  createPaymentLink(contactId: string, amountCents: number, memo: string): Payment {
    fireAndForget(apiFetch(`/contacts/${contactId}/payments`, { method: "POST", body: JSON.stringify({ amountCents, memo }) }));
    throw new ApiError(501, "not_configured", "Payment links need a connected backend.");
  }

  toggleOptOut(contactId: string, optedOut: boolean) {
    fireAndForget(apiFetch(`/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify({ optedOut }) }));
  }

  bookAppointment(contactId: string, title: string, start: string, end: string): Appointment {
    fireAndForget(apiFetch(`/contacts/${contactId}/appointments`, { method: "POST", body: JSON.stringify({ title, start, end }) }));
    throw new ApiError(501, "not_configured", "Booking needs a connected backend.");
  }

  cancelAppointment(id: string) {
    fireAndForget(apiFetch(`/appointments/${id}/cancel`, { method: "POST" }));
  }

  addStage(name: string) {
    fireAndForget(apiFetch("/stages", { method: "POST", body: JSON.stringify({ name }) }));
  }

  setStageConfig(_id: string, _patch: { requiredFields?: string[]; isClosed?: boolean }) {
    throw new ApiError(501, "not_configured", "Pipeline configuration needs a connected backend.");
  }

  reorderStage(_id: string, _targetIndex: number) {
    throw new ApiError(501, "not_configured", "Pipeline ordering needs a connected backend.");
  }

  renameStage(id: string, name: string) {
    fireAndForget(apiFetch(`/stages/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
  }

  deleteStage(id: string, targetStageId: string) {
    fireAndForget(apiFetch(`/stages/${id}`, { method: "DELETE", body: JSON.stringify({ targetStageId }) }));
  }

  addCustomField(field: Omit<CustomField, "id">) {
    fireAndForget(apiFetch("/custom-fields", { method: "POST", body: JSON.stringify(field) }));
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
