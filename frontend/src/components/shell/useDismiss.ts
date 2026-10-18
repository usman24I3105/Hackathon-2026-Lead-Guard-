import { useEffect, type RefObject } from "react";

/**
 * Closes a popover on Escape or a click outside `ref`. On Escape, focus goes
 * back to `returnFocusRef` (the trigger) so keyboard users don't lose their place.
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnFocusRef?: RefObject<HTMLElement | null>,
  portaledRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      returnFocusRef?.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || portaledRef?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, ref, onClose, returnFocusRef, portaledRef]);
}
