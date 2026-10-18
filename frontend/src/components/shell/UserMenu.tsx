import { useCallback, useId, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../icons";
import { useDismiss } from "./useDismiss";

export function UserMenu({
  user,
  onLogout,
}: {
  user: { name: string; role: string; avatarColor?: string };
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close, triggerRef);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Account menu for ${user.name}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full"
      >
        <Avatar name={user.name} color={user.avatarColor ?? "var(--neutral-text)"} size={32} />
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 top-full mt-1 z-40 w-56 rounded-card border border-border bg-surface shadow-lg p-1">
          <div className="px-3 py-2 border-b border-border mb-1">
            <div className="text-sm font-medium text-text truncate">{user.name}</div>
            <div className="text-xs text-text-muted">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-3 py-2 rounded-control text-sm text-text hover:bg-neutral-bg"
          >
            <Icon name="logout" size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
