import { useRef } from "react";
import { Button } from "./Primitives";
import { useFocusTrap } from "../lib/useFocusTrap";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onCancel);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div ref={ref} className="bg-surface rounded-card border border-line w-full max-w-sm p-5 shadow-xl">
        <h2 id="confirm-title" className="text-lg font-semibold mb-1">{title}</h2>
        {body && <p className="text-sm text-ink-2 mb-4">{body}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
