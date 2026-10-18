import { store } from "../../state/useStore";
import { Card, Button } from "../../components/Primitives";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { relativeTime } from "../../lib/format";
import type { Integration } from "../../mock/types";

export function IntegrationCard({ integration, canManage }: { integration: Integration; canManage: boolean }) {
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
      {canManage ? (
        <div className="mt-2 flex gap-2">
          {integration.status === "connected" ? (
            <Button variant="secondary" onClick={() => store.disconnectIntegration(integration.key)}>Disconnect</Button>
          ) : (
            <Button onClick={() => store.reconnectIntegration(integration.key)}>
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
