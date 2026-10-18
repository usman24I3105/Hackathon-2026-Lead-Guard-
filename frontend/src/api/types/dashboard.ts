import type { Availability, IntegrationStatus, LeadStatus } from "../../mock/types";

/**
 * Response shape of GET /api/dashboard?scope=team|personal.
 * The server decides masking from the caller's permissions: a field the
 * caller may not see arrives as null (money) or with `visible: false`.
 */
export type DashboardScope = "team" | "personal";

export interface Trend {
  /** Change vs the previous period, in percent (rounded). */
  percent: number;
  direction: "up" | "down" | "flat";
  /** Whether "up" is good for this metric (false for response time, escalations). */
  upIsGood: boolean;
  comparedTo: string;
}

export type KpiId = "newLeads" | "avgResponse" | "escalations" | "recoveryQueue" | "collected";

export interface KpiMetric {
  id: KpiId;
  label: string;
  /** null = no data yet (e.g. no acknowledged leads to average). */
  value: number | null;
  /** Caller lacks permission to see the value; render it masked. */
  masked?: boolean;
  unit: "count" | "seconds" | "cents";
  definition: string;
  trend?: Trend;
  /** Attention count, e.g. items waiting in the recovery queue. */
  badge?: number;
}

export interface PipelineStageValue {
  stageId: string;
  stageName: string;
  valueCents: number | null;
  dealCount: number;
}

export interface RecoveryItem {
  leadId: string;
  leadName: string;
  source: string;
  reason: string;
  status: LeadStatus;
  ownerId: string;
  ownerName: string;
  ackDeadline: string;
  createdAt: string;
  overdue: boolean;
}

export interface EmployeeAvailability {
  userId: string;
  name: string;
  avatarColor: string;
  availability: Availability;
  openLeads: number;
  capacity: number;
}

export interface UpcomingAppointment {
  id: string;
  start: string;
  title: string;
  contactId: string;
  customerName: string;
  employeeName: string;
  provider: "google";
}

export type ActivityChannel = "whatsapp" | "telegram" | "stripe" | "google" | "system";

export interface ActivityItem {
  id: string;
  at: string;
  channel: ActivityChannel;
  text: string;
}

export interface IntegrationHealth {
  key: string;
  name: string;
  status: IntegrationStatus;
  lastSuccessAt?: string;
  lastErrorAt?: string;
}

export interface LeadSummary {
  id: string;
  name: string;
  source: string;
  status: LeadStatus;
  ownerName: string;
  createdAt: string;
}

export interface DashboardData {
  generatedAt: string;
  scope: DashboardScope;
  kpis: KpiMetric[];
  pipeline: { visible: boolean; stages: PipelineStageValue[] };
  recoveryQueue: RecoveryItem[];
  /** The single most urgent item, surfaced as a card on mobile. */
  highlightedLead: RecoveryItem | null;
  team: EmployeeAvailability[];
  appointments: UpcomingAppointment[];
  activity: ActivityItem[];
  integrations: IntegrationHealth[];
  /** Backing lists for the "View list" drill-downs, so counts always match. */
  lists: { newLeads: LeadSummary[]; escalations: LeadSummary[] };
}
