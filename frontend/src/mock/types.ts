import type { Role } from "../lib/perm";

export type Availability = "available" | "busy" | "leave" | "offline";

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  availability: Availability;
  inRotation: boolean;
  avatarColor: string;
  telegramChatId?: string;
}

export type LeadStatus = "waiting" | "acknowledged" | "escalated" | "overdue" | "recovery";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  message: string;
  createdAt: string;
  ownerId: string;
  status: LeadStatus;
  level: 1 | 2 | 3;
  ackDeadline: string;
  ackedAt?: string;
  ttfrSeconds?: number;
  escalationPath: string[];
  recoveryReason?: string;
  contactId?: string;
}

export interface StageDef {
  id: string;
  name: string;
  requiredFields: string[];
}

export interface Opportunity {
  id: string;
  contactId: string;
  title: string;
  stageId: string;
  valueCents: number | null;
  fields: Record<string, string>;
  createdAt: string;
}

export type MessageStatus = "queued" | "sent" | "delivered" | "failed";

export interface Message {
  id: string;
  contactId: string;
  direction: "in" | "out";
  body: string;
  status: MessageStatus;
  at: string;
}

export type PaymentStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

export interface Payment {
  id: string;
  contactId: string;
  amountCents: number;
  status: PaymentStatus;
  url: string;
  createdAt: string;
  memo: string;
}

export type AppointmentStatus = "booked" | "cancelled" | "completed";

export interface Appointment {
  id: string;
  contactId: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  title: string;
}

export interface TimelineEvent {
  id: string;
  actor: "system" | "user";
  actorName: string;
  label: string;
  at: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  ownerId: string;
  optedOut: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  type: string;
  userName: string;
  before?: string;
  after?: string;
  at: string;
}

export type IntegrationStatus = "connected" | "error" | "not_configured" | "needs_reconnect";

export interface Integration {
  key: string;
  name: string;
  status: IntegrationStatus;
  lastSuccess?: string;
  lastError?: string;
  maskedSecret?: string;
  limits: string;
  capability: string;
}

export interface CustomField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "dropdown" | "checkbox";
  options?: string[];
  stageId?: string;
}
