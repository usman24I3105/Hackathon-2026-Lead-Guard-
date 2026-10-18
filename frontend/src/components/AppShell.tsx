import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { store, useStoreState } from "../state/useStore";
import { useToast } from "../state/ToastContext";
import { useSearch, useWorkspaces } from "../api/hooks/useShell";
import type { SearchResult } from "../api/types/shell";
import { Icon, ShieldLogo } from "./icons";
import { Sidebar } from "./shell/Sidebar";
import { WorkspaceSwitcher } from "./shell/WorkspaceSwitcher";
import { SearchBox } from "./shell/SearchBox";
import { UserMenu } from "./shell/UserMenu";
import { BottomNav } from "./shell/BottomNav";
import { MenuDrawer } from "./shell/MenuDrawer";
import { BOTTOM_NAV_PATHS, visibleNav } from "./shell/nav";
import { CommandPalette } from "./shell/CommandPalette";
import { ManualLeadModal } from "../features/relay/ManualLeadModal";
import { useThemePreference } from "../lib/useThemePreference";
import { useDismiss } from "./shell/useDismiss";
import { relativeTime } from "../lib/format";
import { has } from "../lib/perm";

export function AppShell() {
  const { session, logout } = useAuth();
  const { team, demoMode, audit } = useStoreState();
  const { push } = useToast();
  const navigate = useNavigate();
  const me = team.find((m) => m.id === session?.userId);

  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("leadguard-nav-collapsed") === "true");
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const activityRef = useRef<HTMLDivElement>(null);
  const { resolved: theme, toggle: toggleTheme } = useThemePreference();
  const search = useSearch(query);
  const workspaces = useWorkspaces();

  const nav = visibleNav(session?.role);
  const canCreateLead = !!session && has({ role: session.role }, "leads.manage");
  const bottomNav = nav.filter((n) => BOTTOM_NAV_PATHS.includes(n.to));
  const user = session
    ? { name: session.name, role: session.role, avatarColor: me?.avatarColor, availability: me?.availability }
    : null;
  const demo = import.meta.env.DEV || import.meta.env.VITE_API_MODE === "mock" ||
    (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("demo") === "1" || demoMode));

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeActivity = useCallback(() => setActivityOpen(false), []);
  useDismiss(activityOpen, activityRef, closeActivity);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        setMobileSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openResult(r: SearchResult) {
    setQuery("");
    setMobileSearchOpen(false);
    navigate(r.kind === "contact" ? `/contacts/${r.id}` : "/leads");
  }

  async function switchWorkspace(id: string) {
    try {
      await store.switchWorkspace(id);
      window.location.assign("/dashboard");
    } catch {
      push("We couldn't switch workspaces. Try again.", "error");
    }
  }

  const searchBox = (autoFocus?: boolean) => (
    <SearchBox
      query={query}
      onQueryChange={setQuery}
      results={search.data}
      loading={search.isFetching}
      onSelect={openResult}
      autoFocus={autoFocus}
    />
  );

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>

      <Sidebar
        items={nav}
        user={user}
        onLogout={logout}
        collapsed={collapsed}
        onToggleCollapsed={() => {
          const next = !collapsed;
          setCollapsed(next);
          window.localStorage.setItem("leadguard-nav-collapsed", String(next));
        }}
      />

      <div className={`flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ${collapsed ? "md:pl-[5.25rem]" : "md:pl-64"}`}>
        <header className="app-topbar sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="hidden md:grid h-16 grid-cols-[minmax(10rem,1fr)_minmax(12rem,32rem)_auto] items-center gap-4 px-6">
            <WorkspaceSwitcher
              className="max-w-60"
              workspaces={workspaces.data}
              fallbackName={session?.workspace ?? "Workspace"}
              onSwitch={switchWorkspace}
            />
            {searchBox()}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                aria-label="Open command menu"
                title="Open command menu (Ctrl or Cmd + K)"
                className="inline-flex h-10 items-center gap-2 rounded-control border border-border px-3 text-xs text-text-muted hover:bg-neutral-bg"
              >
                <Icon name="command" size={15} /><span className="hidden xl:inline">Jump to</span>
                <kbd className="rounded border border-border bg-neutral-bg px-1 py-0.5 text-[10px]">⌘K</kbd>
              </button>
              {canCreateLead && <button
                type="button"
                onClick={() => setQuickCreateOpen(true)}
                className="brand-gradient-button inline-flex h-10 items-center gap-1.5 rounded-control px-3 text-sm font-medium"
              >
                <Icon name="plus" size={16} /> <span className="hidden lg:inline">Add lead</span>
              </button>}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                className="h-10 w-10 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg hover:text-text"
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
              </button>
              <div className="relative" ref={activityRef}>
                <button
                  type="button"
                  onClick={() => setActivityOpen((value) => !value)}
                  aria-label="Recent activity"
                  aria-haspopup="true"
                  aria-expanded={activityOpen}
                  aria-controls="recent-activity-panel"
                  className="h-10 w-10 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg hover:text-text"
                >
                  <Icon name="activity" size={18} />
                </button>
                {activityOpen && (
                  <div id="recent-activity-panel" role="region" aria-label="Recent activity" className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-2 shadow-xl">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <h2 className="text-sm font-semibold">Recent activity</h2>
                      <span className="text-[11px] text-text-muted">Latest workspace events</span>
                    </div>
                    {audit.length ? audit.slice(0, 5).map((event) => (
                      <div key={event.id} className="flex items-start gap-2.5 rounded-control px-2 py-2 hover:bg-neutral-bg">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text">{event.type.replaceAll(".", " ")}</p>
                          <p className="text-[11px] text-text-muted">{event.userName} · {relativeTime(event.at)}</p>
                        </div>
                      </div>
                    )) : <p className="px-2 py-4 text-sm text-text-muted">No activity recorded yet.</p>}
                    <button type="button" onClick={() => { setActivityOpen(false); navigate("/audit"); }} className="mt-1 block w-full rounded-control px-2 py-2 text-left text-xs font-medium text-primary hover:bg-primary-soft">View audit log</button>
                  </div>
                )}
              </div>
              {user && <UserMenu user={user} onLogout={logout} />}
            </div>
          </div>

          {/* Mobile: logo, search icon + avatar; workspace on its own row. */}
          <div className="md:hidden">
            {mobileSearchOpen ? (
              <div className="flex items-center gap-2 h-14 px-3">
                <div className="flex-1 min-w-0">{searchBox(true)}</div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileSearchOpen(false);
                    setQuery("");
                  }}
                  aria-label="Close search"
                  className="h-11 w-11 shrink-0 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg"
                >
                  <Icon name="close" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 h-14 px-3">
                <ShieldLogo size={26} />
                <span className="mr-auto text-base font-semibold text-text">LeadGuard</span>
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(true)}
                  aria-label="Search contacts and leads"
                  className="h-10 w-10 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg"
                >
                  <Icon name="search" />
                </button>
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  aria-label="Open command menu"
                  className="h-10 w-10 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg"
                >
                  <Icon name="command" size={17} />
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                  className="h-10 w-10 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg"
                >
                  <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
                </button>
                {user && <UserMenu user={user} onLogout={logout} />}
              </div>
            )}
            <div className="px-4 pb-3">
              <WorkspaceSwitcher
                workspaces={workspaces.data}
                fallbackName={session?.workspace ?? "Workspace"}
                onSwitch={switchWorkspace}
              />
            </div>
          </div>
        </header>

        {demo && (
          <div className="flex items-center justify-center gap-2 border-b border-warning/20 bg-warning-bg px-3 py-1.5 text-center text-[11px] font-medium text-warning-text">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Preview workspace · sample data for frontend review
          </div>
        )}

        <main id="main" tabIndex={-1} className="flex-1 min-w-0 pb-24 md:pb-0 focus:outline-none">
          <Outlet />
        </main>
      </div>

      <BottomNav items={bottomNav} menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
      <MenuDrawer open={menuOpen} items={nav} onClose={closeMenu} onLogout={logout} />
      {commandOpen && <CommandPalette
        open={commandOpen}
        items={nav}
        onClose={() => setCommandOpen(false)}
        onNavigate={(path) => navigate(path)}
        onCreateLead={() => setQuickCreateOpen(true)}
        canCreateLead={canCreateLead}
      />}
      {canCreateLead && <ManualLeadModal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} />}
    </div>
  );
}
