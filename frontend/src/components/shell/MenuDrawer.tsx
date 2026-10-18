import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Icon, ShieldLogo } from "../icons";
import { NAV_GROUPS, type NavItem } from "./nav";
import { useFocusTrap } from "../../lib/useFocusTrap";

export function MenuDrawer({
  open,
  items,
  onClose,
  onLogout,
}: {
  open: boolean;
  items: NavItem[];
  onClose: () => void;
  onLogout: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const groups = NAV_GROUPS.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((section) => section.items.length > 0);

  useFocusTrap(panelRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-text/40" onClick={onClose} tabIndex={-1} />
      <div ref={panelRef} className="relative ml-auto flex h-full w-[min(20rem,85vw)] flex-col bg-surface shadow-xl">
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border">
          <ShieldLogo />
          <span className="text-lg font-semibold">LeadGuard</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto h-11 w-11 flex items-center justify-center rounded-control text-text-muted hover:bg-neutral-bg"
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="All pages" className="flex-1 overflow-y-auto p-3">
          {groups.map(({ group, items: sectionItems }) => (
            <section key={group} className="mb-4">
              <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{group}</h2>
              <ul className="flex flex-col gap-0.5">
                {sectionItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 h-12 rounded-control text-sm font-medium ${
                          isActive ? "bg-primary-soft text-primary" : "text-text hover:bg-neutral-bg"
                        }`
                      }
                    >
                      <Icon name={item.icon} size={20} />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="p-3 border-t border-border" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 px-3 h-12 rounded-control text-sm font-medium text-text hover:bg-neutral-bg"
          >
            <Icon name="logout" size={20} /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
