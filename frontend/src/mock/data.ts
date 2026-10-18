import type {
  Appointment,
  AuditEntry,
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
} from "./types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const secondsFromNow = (s: number) => new Date(Date.now() + s * 1000).toISOString();

export const team: TeamMember[] = [
  { id: "u-imran", name: "Imran Qureshi", role: "User", availability: "available", inRotation: true, avatarColor: "#1D4ED8", capacity: 10 },
  { id: "u-dana", name: "Dana Cole", role: "Manager", availability: "available", inRotation: true, avatarColor: "#0F766E", capacity: 12 },
  { id: "u-sara", name: "Sara Malik", role: "User", availability: "available", inRotation: true, avatarColor: "#C2361B", capacity: 10 },
  { id: "u-owais", name: "Owais Tariq", role: "Owner", availability: "busy", inRotation: true, avatarColor: "#F2A81D", capacity: 6 },
];

export const stages: StageDef[] = [
  { id: "st-new", name: "New", requiredFields: [] },
  { id: "st-contacted", name: "Contacted", requiredFields: [] },
  { id: "st-quoted", name: "Quoted", requiredFields: ["Roof type"] },
  { id: "st-won", name: "Won", requiredFields: ["Roof type", "Contract value"], isClosed: true },
  { id: "st-lost", name: "Lost", requiredFields: [], isClosed: true },
];

export const customFields: CustomField[] = [
  { id: "cf-roof", label: "Roof type", type: "dropdown", options: ["Shingle", "Metal", "Tile", "Flat"], stageId: "st-quoted" },
  { id: "cf-contract", label: "Contract value", type: "number", stageId: "st-won" },
  { id: "cf-sqft", label: "Square footage", type: "number" },
  { id: "cf-inspect", label: "Inspection date", type: "date" },
  { id: "cf-financing", label: "Needs financing", type: "checkbox" },
];

export const contacts: Contact[] = [
  { id: "c-001", name: "Marcus Webb", phone: "+1 555-0101", ownerId: "u-imran", optedOut: false, createdAt: minutesAgo(240) },
  { id: "c-002", name: "Priya Nair", phone: "+1 555-0142", ownerId: "u-dana", optedOut: false, createdAt: minutesAgo(180) },
  { id: "c-003", name: "Jason Flores", phone: "+1 555-0177", ownerId: "u-sara", optedOut: true, createdAt: minutesAgo(600) },
  { id: "c-004", name: "Lindsey Carr", phone: "+1 555-0193", ownerId: "u-imran", optedOut: false, createdAt: minutesAgo(90) },
  { id: "c-005", name: "Tomas Reyes", phone: "+1 555-0220", ownerId: "u-dana", optedOut: false, createdAt: minutesAgo(30) },
  { id: "c-006", name: "Sister", phone: "+817054633568", ownerId: "u-imran", optedOut: false, createdAt: minutesAgo(10) },
];

export const companies: Company[] = [
  { id: "co-001", name: "Birchwood Properties", contactIds: ["c-001", "c-004"], createdAt: minutesAgo(240) },
  { id: "co-002", name: "Northstar Homes", contactIds: ["c-002"], createdAt: minutesAgo(180) },
  { id: "co-003", name: "Sunset Residential", contactIds: ["c-003"], createdAt: minutesAgo(600) },
  { id: "co-004", name: "Maple Ridge Builders", contactIds: ["c-005"], createdAt: minutesAgo(30) },
];

export const opportunities: Opportunity[] = [
  { id: "op-1", contactId: "c-001", title: "Roof replacement — 142 Birchwood", stageId: "st-quoted", valueCents: 1_840_000, fields: { "Roof type": "Shingle" }, createdAt: minutesAgo(200) },
  { id: "op-2", contactId: "c-002", title: "Storm damage repair — Elm Ct", stageId: "st-contacted", valueCents: 920_000, fields: {}, createdAt: minutesAgo(150) },
  { id: "op-3", contactId: "c-004", title: "New install — Cedar Ridge", stageId: "st-new", valueCents: null, fields: {}, createdAt: minutesAgo(80) },
  { id: "op-4", contactId: "c-005", title: "Gutter + roof combo — Maple Ave", stageId: "st-new", valueCents: 540_000, fields: {}, createdAt: minutesAgo(25) },
  { id: "op-5", contactId: "c-003", title: "Re-roof — Sunset Blvd", stageId: "st-won", valueCents: 2_260_000, fields: { "Roof type": "Tile", "Contract value": "2260000" }, createdAt: minutesAgo(900) },
];

export const messages: Message[] = [
  { id: "m-1", contactId: "c-001", direction: "in", body: "Hi, I filled out the form for a quote on my roof.", status: "delivered", at: minutesAgo(200) },
  { id: "m-2", contactId: "c-001", direction: "out", body: "Thanks Marcus — this is Imran from LeadGuard Roofing. Can you share a few photos of the damage?", status: "delivered", at: minutesAgo(198) },
  { id: "m-3", contactId: "c-001", direction: "in", body: "Sure, sending now.", status: "delivered", at: minutesAgo(195) },
  { id: "m-4", contactId: "c-001", direction: "out", body: "Got them — looks like a shingle job. Quote is ready, sending the link shortly.", status: "sent", at: minutesAgo(10) },
  { id: "m-5", contactId: "c-002", direction: "in", body: "The storm last week tore up part of my roof, need someone to look.", status: "delivered", at: minutesAgo(150) },
  { id: "m-6", contactId: "c-002", direction: "out", body: "Sorry to hear that, Priya. I can get a tech out tomorrow morning — does 9am work?", status: "failed", at: minutesAgo(140) },
  { id: "m-7", contactId: "c-005", direction: "in", body: "Interested in a quote for gutters and roof together.", status: "delivered", at: minutesAgo(25) },
];

export const payments: Payment[] = [
  { id: "p-1", contactId: "c-001", amountCents: 50000, status: "pending", url: "https://checkout.stripe.com/c/pay/cs_test_8f2a", createdAt: minutesAgo(9), memo: "Deposit — roof replacement" },
  { id: "p-2", contactId: "c-003", amountCents: 226000 * 10, status: "paid", url: "https://checkout.stripe.com/c/pay/cs_test_a913", createdAt: minutesAgo(600), memo: "Final payment — re-roof" },
];

export const appointments: Appointment[] = [
  { id: "a-1", contactId: "c-002", start: secondsFromNow(3600 * 20), end: secondsFromNow(3600 * 21), status: "booked", title: "Storm damage inspection" },
  { id: "a-2", contactId: "c-003", start: minutesAgo(-1440), end: minutesAgo(-1380), status: "completed", title: "Final walkthrough" },
];

export const auditLog: AuditEntry[] = [
  { id: "au-1", type: "lead.escalated", userName: "System", before: "Imran Qureshi", after: "Dana Cole", at: minutesAgo(40) },
  { id: "au-2", type: "opportunity.moved", userName: "Imran Qureshi", before: "New", after: "Quoted", at: minutesAgo(30) },
  { id: "au-3", type: "team.availability", userName: "Owais Tariq", before: "Available", after: "Busy", at: minutesAgo(60) },
  { id: "au-4", type: "payment.created", userName: "Imran Qureshi", before: "—", after: "$500.00 link", at: minutesAgo(9) },
  { id: "au-5", type: "stage.renamed", userName: "Owais Tariq", before: "Qualified", after: "Quoted", at: minutesAgo(1200) },
];

export const integrations: Integration[] = [
  { key: "whatsapp", name: "WhatsApp Business", status: "connected", lastSuccess: minutesAgo(5), maskedSecret: "wa_live_••••9f2a", limits: "1,000 msgs/day", capability: "Sends and receives conversation messages. Can't send template-free marketing broadcasts." },
  { key: "telegram", name: "Telegram escalation bot", status: "connected", lastSuccess: minutesAgo(40), maskedSecret: "tg_bot_••••k7q1", limits: "No daily limit", capability: "Pings your team on escalation. Can't read or send WhatsApp messages." },
  { key: "stripe", name: "Stripe payment links", status: "connected", lastSuccess: minutesAgo(9), maskedSecret: "sk_live_••••02ab", limits: "Standard Stripe rates", capability: "Creates one-off payment links and tracks status. Can't issue refunds automatically." },
  { key: "google", name: "Google Calendar", status: "needs_reconnect", lastError: minutesAgo(200), maskedSecret: "oauth_••••expired", limits: "—", capability: "Books and checks appointment availability. Reconnect to resume booking." },
];

export function freshLead(partial: Partial<Lead> & { name: string; phone: string; message: string; source: string }): Lead {
  return {
    id: `lead-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    ownerId: "u-imran",
    status: "waiting",
    level: 1,
    ackDeadline: secondsFromNow(10),
    escalationPath: ["u-imran", "u-dana", "u-sara"],
    ...partial,
  };
}

export const initialLeads: Lead[] = [
  freshLead({ name: "Grace Holloway", phone: "+1 555-0301", message: "Need a quote for a leaking roof, ASAP.", source: "Public form", ownerId: "u-imran", status: "waiting", ackDeadline: secondsFromNow(10) }),
  freshLead({ name: "Devon Pierce", phone: "+1 555-0388", message: "Interested in solar + roof bundle.", source: "Public form", ownerId: "u-sara", status: "acknowledged", ackDeadline: secondsFromNow(-120), ackedAt: minutesAgo(2), ttfrSeconds: 14 }),
  freshLead({ name: "Wendy Torres", phone: "+1 555-0455", message: "Gutter guards for a two-story house.", source: "Referral", ownerId: "u-dana", status: "acknowledged", ackDeadline: secondsFromNow(-600), ackedAt: minutesAgo(9), ttfrSeconds: 22 }),
];

/** Yesterday's / last month's figures, so the mock can report KPI trends. */
export const previousPeriod = {
  newLeads: 2,
  avgResponseSeconds: 24,
  escalations: 3,
  collectedCents: 1_850_000,
};
