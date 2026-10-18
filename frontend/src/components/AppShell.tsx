import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { store, useStoreState } from "../state/useStore";
import { useToast } from "../state/ToastContext";
import { useSearch, useWorkspaces } from "../api/hooks/useShell";
import type { SearchResult } from "../api/types/shell";
import { Icon, ShieldLogo } from "./icons";
import { Button } from "./Primitives";
import { Sidebar } from "./shell/Sidebar";
import { WorkspaceSwitcher } from "./shell/WorkspaceSwitcher";
import { SearchBox } from "./shell/SearchBox";
import { UserMenu } from "./shell/UserMenu";
import { ActivityPopover } from "./shell/ActivityPopover";
import { PreviewBanner } from "./shell/PreviewBanner";
import { BottomNav } from "./shell/BottomNav";
import { MenuDrawer } from "./shell/MenuDrawer";
import { BOTTOM_NAV_PATHS, visibleNav } from "./shell/nav";
import { CommandPalette } from "./shell/CommandPalette";
import { ManualLeadModal } from "../features/relay/ManualLeadModal";
import { useThemePreference } from "../lib/useThemePreference";
import { has } from "../lib/perm";

function readPreference(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writePreference(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* Preferences are optional. */ }
}

export function AppShell() {
  const { session, logout } = useAuth();
  const { team, leads, messages, demoMode, audit } = useStoreState();
  const { push } = useToast();
  const navigate = useNavigate();
  const me = team.find((m) => m.id === session?.userId);

  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readPreference("leadguard-nav-collapsed") === "true");
  const [compactNav, setCompactNav] = useState(() => typeof window !== "undefined" && window.innerWidth < 1280);
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [seenActivityId, setSeenActivityId] = useState(() => readPreference("leadguard-activity-seen") ?? audit[0]?.id ?? "");
  const { resolved: theme, toggle: toggleTheme } = useThemePreference();
  const search = useSearch(query);
  const workspaces = useWorkspaces();

  const nav = visibleNav(session?.role);
  const canCreateLead = !!session && has({ role: session.role }, "leads.manage");
  const relayCount = leads.filter((lead) => lead.status === "waiting" || lead.status === "escalated").length;
  const recoveryCount = leads.filter((lead) => lead.status === "recovery").length;
  const failedMessageCount = messages.filter((message) => message.status === "failed").length;
  const seenActivityIndex = audit.findIndex((event) => event.id === seenActivityId);
  const unreadActivityCount = !seenActivityId ? 0 : seenActivityIndex < 0 ? audit.length : seenActivityIndex;
  const bottomNav = nav.filter((n) => BOTTOM_NAV_PATHS.includes(n.to));
  const user = session
    ? { name: session.name, role: session.role, avatarColor: me?.avatarColor, availability: me?.availability }
    : null;
  const demo = import.meta.env.DEV || import.meta.env.VITE_API_MODE === "mock" ||
    (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("demo") === "1" || demoMode));

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const markActivityRead = useCallback(() => {
    const latestId = audit[0]?.id ?? "";
    if (!latestId) return;
    setSeenActivityId(latestId);
    writePreference("leadguard-activity-seen", latestId);
  }, [audit]);

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

  useEffect(() => {
    const updateCompact = () => setCompactNav(window.innerWidth < 1280);
    window.addEventListener("resize", updateCompact);
    return () => window.removeEventListener("resize", updateCompact);
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
      shortcutHint={!autoFocus}
    />
  );

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="skip-link">Skip to content</a>

      <Sidebar
        items={nav}
        user={user}
        onLogout={logout}
        collapsed={collapsed || compactNav}
        relayCount={relayCount}
        recoveryCount={recoveryCount}
        conversationCount={failedMessageCount}
        onToggleCollapsed={() => {
          const next = !collapsed;
          setCollapsed(next);
          writePreference("leadguard-nav-collapsed", String(next));
        }}
      />

      <div className={`flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ${collapsed || compactNav ? "md:pl-[5.25rem]" : "md:pl-64"}`}>
        <PreviewBanner visible={demo} />
        <header className="app-topbar sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="hidden xl:grid h-16 grid-cols-[minmax(10rem,1fr)_minmax(12rem,32rem)_auto] items-center gap-4 px-6">
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
                <kbd className="rounded border border-border bg-neutral-bg px-1 py-0.5 text-[10px]">{typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
              </button>
              {canCreateLead && <Button
                type="button"
                size="lg"
                aria-label="Add lead"
                onClick={() => setQuickCreateOpen(true)}
              >
                <Icon name="plus" size={16} /> <span className="hidden lg:inline">Add lead</span>
              </Button>}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                className="h-10 w-10 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg hover:text-text"
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
              </button>
              <ActivityPopover audit={audit} unreadCount={unreadActivityCount} onViewed={markActivityRead} onViewAudit={() => navigate("/audit")} />
              {user && <UserMenu user={user} onLogout={logout} />}
            </div>
          </div>

          {/* Mobile keeps the primary workspace controls within thumb reach. */}
          <div className="xl:hidden">
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
                <ActivityPopover audit={audit} unreadCount={unreadActivityCount} onViewed={markActivityRead} onViewAudit={() => navigate("/audit")} />
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

        <main id="main" tabIndex={-1} className="app-main-safe flex-1 min-w-0 focus:outline-none">
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
