import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { useStoreState } from "../state/useStore";
import { Avatar } from "./Avatar";
import { has } from "../lib/perm";

const NAV = [
  { to: "/relay", label: "Relay", icon: "⚡", perm: "leads.view" as const },
  { to: "/pipeline", label: "Pipeline", icon: "▦", perm: "pipeline.manage" as const },
  { to: "/contacts", label: "Contacts", icon: "☎", perm: "contacts.view" as const },
  { to: "/dashboard", label: "Dashboard", icon: "◧", perm: "dashboard.full" as const },
  { to: "/recovery", label: "Recovery", icon: "⚑", perm: "leads.view" as const },
  { to: "/audit", label: "Audit", icon: "≡", perm: "audit.view" as const },
  { to: "/integrations", label: "Integrations", icon: "◎", perm: "integrations.manage" as const },
  { to: "/settings", label: "Settings", icon: "⚙", perm: "settings.manage" as const },
];

export function AppShell() {
  const { session, logout } = useAuth();
  const { team, demoMode } = useStoreState();
  const navigate = useNavigate();
  const me = team.find((m) => m.id === session?.userId);

  const demo = typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("demo") === "1" || demoMode);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper">
      <a href="#main" className="skip-link">Skip to content</a>

      <nav
        className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-line md:bg-surface md:min-h-screen md:sticky md:top-0"
        aria-label="Primary"
      >
        <div className="px-5 py-5 border-b border-line">
          <div className="font-display text-xl">LeadGuard</div>
          <div className="text-xs text-ink-2 mt-0.5">{session?.workspace}</div>
        </div>
        <ul className="flex-1 py-3 flex flex-col gap-1 px-2">
          {NAV.filter((n) => !session || has({ role: session.role }, n.perm)).map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 h-11 rounded-[10px] text-sm font-medium ${
                    isActive ? "bg-ink text-paper" : "text-ink hover:bg-paper"
                  }`
                }
              >
                <span aria-hidden>{n.icon}</span>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="p-3 border-t border-line flex items-center gap-2">
          {me && <Avatar name={me.name} color={me.avatarColor} availability={me.availability} />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{session?.name}</div>
            <div className="text-xs text-ink-2 truncate">{session?.role}</div>
          </div>
          <button
            className="text-xs text-ink-2 hover:text-ink underline"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        {demo && (
          <div className="bg-signal/90 text-ink text-xs text-center py-1 font-medium">
            demo workspace · 10 s windows
          </div>
        )}
        <main id="main" className="flex-1 min-w-0 pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 border-t border-line bg-surface flex z-40"
        aria-label="Primary"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.filter((n) => !session || has({ role: session.role }, n.perm))
          .slice(0, 5)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] text-[11px] font-medium ${
                  isActive ? "text-focus" : "text-ink-2"
                }`
              }
            >
              <span aria-hidden className="text-base leading-none">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
