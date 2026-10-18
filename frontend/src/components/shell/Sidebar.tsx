import { NavLink } from "react-router-dom";
import { Icon, ShieldLogo } from "../icons";
import { Avatar } from "../Avatar";
import { NAV_GROUPS, type NavItem } from "./nav";
import type { Availability } from "../../mock/types";

export function Sidebar({
  items,
  user,
  onLogout,
  collapsed,
  onToggleCollapsed,
}: {
  items: NavItem[];
  user: { name: string; role: string; avatarColor?: string; availability?: Availability } | null;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `sidebar-link relative flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} h-10 rounded-control text-sm font-medium transition-colors duration-150 ${
                        isActive ? "bg-primary-soft text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary" : "text-text-muted hover:bg-neutral-bg hover:text-text"
                      }`
                    }
                  >
                    <Icon name={item.icon} size={18} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      {user && (
        <div className={`sidebar-user p-3 border-t flex items-center shrink-0 ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <Avatar name={user.name} color={user.avatarColor ?? "var(--neutral-text)"} availability={user.availability} title={user.name} />
          {!collapsed && <div className="flex-1 min-w-0">
              <div className="sidebar-user-name text-sm font-medium truncate">{user.name}</div>
              <div className="sidebar-user-role text-xs truncate">{user.role}</div>
            </div>}
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="h-9 w-9 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg hover:text-text"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      )}
    </aside>
  );
}
