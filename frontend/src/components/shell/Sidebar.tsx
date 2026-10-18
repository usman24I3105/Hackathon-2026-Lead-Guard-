import { NavLink } from "react-router-dom";
import { Icon, ShieldLogo } from "../icons";
import { UserMenu } from "./UserMenu";
import { NAV_GROUPS, type NavItem } from "./nav";
import type { Availability } from "../../mock/types";

export function Sidebar({
  items,
  user,
  onLogout,
  collapsed,
  onToggleCollapsed,
  relayCount = 0,
  recoveryCount = 0,
  conversationCount = 0,
}: {
  items: NavItem[];
  user: { name: string; role: string; avatarColor?: string; availability?: Availability } | null;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  relayCount?: number;
  recoveryCount?: number;
  conversationCount?: number;
}) {
  const groups = NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className={`app-sidebar hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r transition-[width] duration-200 ${collapsed ? "w-[5.25rem]" : "w-64"}`}>
      <div className={`sidebar-brand relative flex items-center h-16 border-b shrink-0 ${collapsed ? "justify-center px-2" : "gap-2.5 px-5"}`}>
        <ShieldLogo />
        {!collapsed && <span className="text-lg font-semibold text-text">LeadGuard</span>}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={`h-9 w-9 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg hover:text-text ${collapsed ? "absolute top-[3.35rem] right-[-0.7rem] rounded-full border border-border bg-surface shadow-sm" : "ml-auto"}`}
        >
          <Icon name={collapsed ? "menu" : "chevron-left"} size={17} />
        </button>
      </div>

      <nav aria-label="Primary" className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-3"}`}>
        {groups.map(({ group, items: sectionItems }) => (
          <section key={group} className="mb-4">
            {!collapsed && <h2 className="sidebar-group-title px-3 mb-1 text-[11px] font-semibold">{group}</h2>}
            <ul className="flex flex-col gap-0.5">
              {sectionItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={collapsed ? `${item.label}${item.to === "/relay" && relayCount ? ` · ${relayCount} need attention` : ""}` : undefined}
                    aria-label={collapsed ? `${item.label}${item.to === "/relay" && relayCount ? `, ${relayCount} need attention` : ""}` : undefined}
                    className={({ isActive }) =>
                      `sidebar-link ${item.to === "/relay" ? "is-relay-link" : ""} relative flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} h-10 rounded-control text-sm font-medium transition-colors duration-150 ${
                        isActive ? "bg-primary-soft text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary" : "text-text-muted hover:bg-neutral-bg hover:text-text"
                      }`
                    }
                  >
                    <Icon name={item.icon} size={18} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {item.to === "/relay" && relayCount > 0 && (
                      <span className={"sidebar-count" + (collapsed ? " is-collapsed" : "")} aria-hidden="true">
                        {relayCount > 99 ? "99+" : relayCount}
                      </span>
                    )}
                    {(item.to === "/recovery" ? recoveryCount : item.to === "/conversations" ? conversationCount : 0) > 0 && (
                      <span className={"sidebar-count" + (collapsed ? " is-collapsed" : "")} aria-hidden="true">
                        {(item.to === "/recovery" ? recoveryCount : conversationCount) > 99 ? "99+" : item.to === "/recovery" ? recoveryCount : conversationCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      {user && (
        <div className="sidebar-user shrink-0 border-t p-3">
          <UserMenu user={user} onLogout={onLogout} placement="sidebar" collapsed={collapsed} />
        </div>
      )}
    </aside>
  );
}
