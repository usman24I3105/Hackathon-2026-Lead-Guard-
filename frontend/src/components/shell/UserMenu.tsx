import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { Icon } from "../icons";
import { useDismiss } from "./useDismiss";
import { usePortalPosition } from "../usePortalPosition";
import type { Availability } from "../../mock/types";

export function UserMenu({
  user,
  onLogout,
  placement = "toolbar",
  collapsed = false,
}: {
  user: { name: string; role: string; avatarColor?: string; availability?: Availability };
  onLogout: () => void;
  placement?: "toolbar" | "sidebar";
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const menuPosition = usePortalPosition(open, triggerRef, panelRef, placement === "sidebar" ? "right-start" : "bottom-end", 8);
  useDismiss(open, ref, close, triggerRef, panelRef);

  useLayoutEffect(() => {
    if (open && menuPosition.visibility === "visible") {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open, menuPosition.visibility]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1 + items.length) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  return (
    <div ref={ref} className={placement === "sidebar" ? "user-menu user-menu-sidebar relative w-full" : "user-menu user-menu-toolbar relative"}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={"Account menu for " + user.name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={placement === "sidebar" && collapsed ? user.name + " · Account menu" : undefined}
        onClick={() => setOpen((o) => !o)}
        className={placement === "sidebar"
          ? "user-menu-trigger user-menu-trigger-sidebar" + (collapsed ? " is-collapsed" : "")
          : "user-menu-trigger user-menu-trigger-toolbar"}
      >
        <Avatar name={user.name} color={user.avatarColor ?? "var(--neutral-text)"} size={placement === "sidebar" ? 36 : 32} availability={user.availability} />
        {placement === "sidebar" && !collapsed && (
          <>
            <span className="user-menu-summary">
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </span>
            <Icon name="chevron-down" size={15} />
          </>
        )}
      </button>
      {open && createPortal(
        <div ref={panelRef} id={menuId} style={menuPosition} className={placement === "sidebar" ? "user-menu-panel user-menu-panel-sidebar" : "user-menu-panel user-menu-panel-toolbar"} role="menu" aria-label="Account menu" onKeyDown={onMenuKeyDown}>
          <div className="user-menu-profile">
            <span>Profile</span>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)} className="user-menu-item">
            <Icon name="settings" size={16} /> Preferences
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="user-menu-item"
          >
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
