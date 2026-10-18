import { useState } from "react";
import { Card, Button } from "../../components/Primitives";

/**
 * Scaffold only — there's no hook-token backend route yet. Wire the real
 * value in once per-workspace webhook tokens exist; until then this shows
 * the shape of the UI without claiming the URL actually works.
 */
export function WebhookUrl({ integrationKey }: { integrationKey: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://api.leadguard.app/webhooks/${integrationKey}/<workspace-token>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard may be unavailable; the field is still visible to copy manually
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-2 uppercase tracking-wide mb-0.5">Webhook URL</div>
        <div className="text-sm font-mono-tab truncate">{url}</div>
      </div>
      <Button variant="secondary" onClick={copy} className="shrink-0">{copied ? "Copied!" : "Copy"}</Button>
    </Card>
  );
}
