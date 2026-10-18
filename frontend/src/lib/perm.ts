export type Permission =
  | "leads.view"
  | "leads.manage"
  | "pipeline.manage"
  | "contacts.view"
  | "contacts.manage"
  | "payments.manage"
  | "calendar.manage"
  | "team.manage"
  | "settings.manage"
  | "integrations.manage"
  | "audit.view"
  | "dashboard.full";

export type Role = "Owner" | "Manager" | "User";

const PRESETS: Record<Role, Permission[]> = {
  Owner: [
    "leads.view", "leads.manage", "pipeline.manage", "contacts.view", "contacts.manage",
    "payments.manage", "calendar.manage", "team.manage", "settings.manage",
    "integrations.manage", "audit.view", "dashboard.full",
  ],
  Manager: [
    "leads.view", "leads.manage", "pipeline.manage", "contacts.view", "contacts.manage",
    "payments.manage", "calendar.manage", "audit.view", "dashboard.full",
  ],
  User: ["leads.view", "contacts.view", "calendar.manage"],
};

export interface PermCtx {
  role: Role;
  extraFlags?: Permission[];
}

export function has(ctx: PermCtx, perm: Permission): boolean {
  if (PRESETS[ctx.role]?.includes(perm)) return true;
  return !!ctx.extraFlags?.includes(perm);
}
