import type { Availability, Appointment, Company, Contact, CustomField, Lead, Opportunity, Payment, TeamMember, TimelineEvent } from "../mock/types";
import type { RealtimeEvent } from "../mock/store";
import type { State } from "../mock/store";
import type { Session } from "../lib/session";
import type { DashboardData, DashboardScope } from "../api/types/dashboard";
import type { SearchResult, Workspace } from "../api/types/shell";

export type { State, RealtimeEvent };

export type AuthResult = { ok: true; session: Session } | { ok: false; error: string };

/**
 * The public surface both the mock store and the real-API store must
 * implement, so every feature file can keep calling `store.xxx()` and
 * `useStoreState()` unchanged regardless of which one the adapter picked.
 */
export interface StoreLike {
  login(email: string, password: string): Promise<AuthResult>;
  signup(name: string, email: string, password: string, workspace: string): Promise<AuthResult>;

  getState(): State;
  subscribe(fn: () => void): () => void;
  onEvent(fn: (e: RealtimeEvent) => void): () => void;
  stop(): void;

  acknowledgeLead(leadId: string, userId: string): void;
  createLead(input: { name: string; phone: string; message: string; source: string }): Lead;
  createContact(input: { name: string; phone: string; ownerId: string }): Contact;
  createCompany(input: { name: string; contactIds: string[] }): Company;
  createOpportunity(input: { title: string; contactId: string; stageId: string; valueCents: number | null }): Opportunity;
  setAvailability(userId: string, availability: Availability): void;
  setTeamFlags(userId: string, patch: Partial<TeamMember>): void;
  setAssignmentRules(rules: { acknowledgementSeconds: number; backupOwnerId: string; managerOwnerId: string }): void;
  reassignLead(leadId: string, userId: string): void;
  moveOpportunity(
    oppId: string,
    stageId: string,
    fields?: Record<string, string>
  ): { ok: boolean; missing: string[] };
  sendMessage(contactId: string, body: string): void;
  retryMessage(messageId: string): void;
  createPaymentLink(contactId: string, amountCents: number, memo: string): Payment;
  toggleOptOut(contactId: string, optedOut: boolean): void;
  bookAppointment(contactId: string, title: string, start: string, end: string): Appointment;
  cancelAppointment(id: string): void;
  addStage(name: string): void;
  setStageConfig(id: string, patch: { requiredFields?: string[]; isClosed?: boolean }): void;
  reorderStage(id: string, targetIndex: number): void;
  renameStage(id: string, name: string): void;
  deleteStage(id: string, targetStageId: string): void;
  addCustomField(field: Omit<CustomField, "id">): void;
  reconnectIntegration(key: string): void;
  disconnectIntegration(key: string): void;
  setDemoMode(on: boolean): void;
  runBatonDemo(): Lead;
  getTimeline(leadId: string): TimelineEvent[];

  /** GET /api/dashboard — the server applies scope and permission masking. */
  getDashboard(scope: DashboardScope): Promise<DashboardData>;

  listWorkspaces(): Promise<Workspace[]>;
  /** Switches the session's active workspace server-side; caller reloads after. */
  switchWorkspace(id: string): Promise<void>;
  search(query: string): Promise<SearchResult[]>;
}
