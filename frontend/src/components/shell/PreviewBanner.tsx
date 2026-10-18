import { useState } from "react";
import { Icon } from "../icons";

const DISMISSED_KEY = "leadguard-preview-banner-dismissed";

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function PreviewBanner({ visible }: { visible: boolean }) {
  const forceShown = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("showPreviewBanner") === "1";
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (!visible || (dismissed && !forceShown)) return null;

  return (
    <div className="preview-banner" role="status">
      <span className="preview-banner-dot" aria-hidden="true" />
      <span>Preview workspace <span aria-hidden="true">·</span> sample data for frontend review</span>
      <button
        type="button"
        aria-label="Dismiss preview workspace notice"
        title="Dismiss notice"
        onClick={() => {
          setDismissed(true);
          try { window.localStorage.setItem(DISMISSED_KEY, "true"); } catch { /* Storage is optional. */ }
        }}
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
