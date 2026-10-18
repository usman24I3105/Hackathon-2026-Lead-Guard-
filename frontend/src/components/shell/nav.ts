import type { IconName } from "../icons";
import { has, type Permission, type Role } from "../../lib/perm";

export type NavGroup = "Overview" | "Customer management" | "Communication" | "Operations" | "Configuration";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  /** Hides the link only — route guards and the server remain authoritative. */
  perm?: Permission;
}

export const NAV_GROUPS: NavGroup[] = [
  "Overview",
  "Customer management",
  "Communication",
  "Operations",
  "Configuration",
];

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", group: "Overview", perm: "dashboard.full" },
  { to: "/relay", label: "Live relay", icon: "leads", group: "Customer management", perm: "leads.view" },
  { to: "/leads", label: "Lead records", icon: "activity", group: "Customer management", perm: "leads.view" },
  { to: "/recovery", label: "Recovery queue", icon: "recovery", group: "Customer management", perm: "leads.view" },
  { to: "/contacts", label: "Contacts", icon: "contacts", group: "Customer management", perm: "contacts.view" },
  { to: "/companies", label: "Companies", icon: "companies", group: "Customer management", perm: "contacts.view" },
  { to: "/opportunities", label: "Opportunities", icon: "opportunities", group: "Customer management", perm: "pipeline.manage" },
  { to: "/pipeline", label: "Pipeline board", icon: "pipeline", group: "Customer management", perm: "pipeline.manage" },
  { to: "/conversations", label: "Conversations", icon: "message", group: "Communication", perm: "contacts.view" },
  { to: "/appointments", label: "Appointments", icon: "calendar", group: "Communication", perm: "contacts.view" },
  { to: "/payments", label: "Payments", icon: "payments", group: "Communication", perm: "contacts.view" },
  { to: "/team", label: "Team & availability", icon: "team", group: "Operations", perm: "leads.view" },
  { to: "/audit", label: "Audit log", icon: "audit", group: "Operations", perm: "audit.view" },
  { to: "/integrations", label: "Integrations", icon: "integrations", group: "Configuration", perm: "integrations.manage" },
  { to: "/settings", label: "Workspace settings", icon: "settings", group: "Configuration" },
];

export const BOTTOM_NAV_PATHS = ["/dashboard", "/relay", "/pipeline", "/contacts"];

export function visibleNav(role: Role | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.perm || (role && has({ role }, item.perm)));
}
