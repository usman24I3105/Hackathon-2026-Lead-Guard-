import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export type PortalPlacement = "bottom-start" | "bottom-end" | "right-start";

/** Positions a portaled panel against its trigger without affecting document flow. */
export function usePortalPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  placement: PortalPlacement,
  offset = 6
) {
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -10000,
    left: -10000,
    right: "auto",
    bottom: "auto",
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const anchorBox = anchor.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const edge = 8;
      let left = anchorBox.left;
      let top = anchorBox.bottom + offset;

      if (placement === "bottom-end") left = anchorBox.right - panelBox.width;
      if (placement === "right-start") {
        left = anchorBox.right + offset;
        top = anchorBox.top;
        if (left + panelBox.width > viewportWidth - edge) left = anchorBox.left - panelBox.width - offset;
      } else if (top + panelBox.height > viewportHeight - edge && anchorBox.top - panelBox.height - offset >= edge) {
        top = anchorBox.top - panelBox.height - offset;
      }

      left = Math.max(edge, Math.min(left, viewportWidth - panelBox.width - edge));
      top = Math.max(edge, Math.min(top, viewportHeight - panelBox.height - edge));
      setStyle({ position: "fixed", left, top, right: "auto", bottom: "auto", visibility: "visible" });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) resizeObserver?.observe(anchorRef.current);
    if (panelRef.current) resizeObserver?.observe(panelRef.current);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      resizeObserver?.disconnect();
    };
  }, [open, anchorRef, panelRef, placement, offset]);

  return style;
}
