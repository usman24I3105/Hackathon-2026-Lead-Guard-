import { NavLink } from "react-router-dom";
import { Icon } from "../icons";
import type { NavItem } from "./nav";

export function BottomNav({
  items,
  menuOpen,
  onOpenMenu,
}: {
  items: NavItem[];
  menuOpen: boolean;
  onOpenMenu: () => void;
}) {
  const cell = "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-medium transition-colors";
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `${cell} ${isActive ? "text-primary" : "text-text-muted hover:text-text"}`}
        >
          <Icon name={item.icon} size={22} />
          {item.to === "/relay" ? "Leads" : item.to === "/pipeline" ? "Pipeline" : item.label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className={`${cell} ${menuOpen ? "text-primary" : "text-text-muted hover:text-text"}`}
      >
        <Icon name="menu" size={22} />
        Menu
      </button>
    </nav>
  );
}
