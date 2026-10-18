import { useState } from "react";
import { store } from "../../state/useStore";
import { Card, Button } from "../../components/Primitives";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { SecretInput } from "../../components/SecretInput";
import { relativeTime } from "../../lib/format";
import { useToast } from "../../state/ToastContext";
import type { Integration } from "../../mock/types";
import { WebhookUrl } from "./WebhookUrl";

export function IntegrationCard({ integration, canManage }: { integration: Integration; canManage: boolean }) {
  const { push } = useToast();
  const [connecting, setConnecting] = useState(false);

  async function saveCredential(_value: string) {
    // Mock mode never sends the plaintext secret anywhere — a real backend
    // would receive it over TLS and store it server-side only.
    await new Promise((r) => setTimeout(r, 300));
    store.reconnectIntegration(integration.key);
    setConnecting(false);
    push(`${integration.name} connected.`);
  }

  async function testSlackAlert() {
    try {
      const { apiFetch } = await import("../../api/client");
      await apiFetch("/integrations/slack/test", { method: "POST" });
      push("Test alert sent to Slack #lead-alerts! Check your Slack channel.", "success");
    } catch {
      push("Failed to trigger Slack test alert.", "error");
    }
  }

  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{integration.name}</h3>
        <StatusChip kind={integration.status as ChipKind} />
      </div>
      <p className="text-sm text-ink-2">{integration.capability}</p>
      <dl className="text-xs text-ink-2 grid grid-cols-2 gap-1 mt-1">
        <dt>Limits</dt>
        <dd className="text-right">{integration.limits}</dd>
        {integration.maskedSecret && (
          <>
            <dt>Secret</dt>
            <dd className="text-right font-mono-tab">{integration.maskedSecret}</dd>
          </>
        )}
        {integration.lastSuccess && (
          <>
            <dt>Last success</dt>
            <dd className="text-right">{relativeTime(integration.lastSuccess)}</dd>
          </>
        )}
        {integration.lastError && (
          <>
            <dt>Last error</dt>
            <dd className="text-right" style={{ color: "var(--alarm)" }}>{relativeTime(integration.lastError)}</dd>
          </>
        )}
      </dl>

      {integration.status === "connected" && <WebhookUrl integrationKey={integration.key} />}

      {canManage ? (
        <div className="mt-2 flex flex-col gap-2">
          {integration.status === "connected" ? (
            <div className="flex flex-wrap gap-2">
              {integration.key === "slack" && (
                <Button variant="primary" onClick={testSlackAlert} className="self-start">
                  Send test alert
                </Button>
              )}
              <Button variant="secondary" onClick={() => store.disconnectIntegration(integration.key)} className="self-start">
                Disconnect
              </Button>
            </div>
          ) : connecting ? (
            <SecretInput label={`${integration.name} API key`} savingLabel="Connecting…" onSave={saveCredential} />
          ) : (
            <Button onClick={() => setConnecting(true)} className="self-start">
              {integration.status === "needs_reconnect" ? "Reconnect" : "Connect"}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-2 mt-2">You need the "Manage integrations" permission to change this.</p>
      )}
    </Card>
  );
}
