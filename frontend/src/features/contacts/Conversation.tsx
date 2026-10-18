import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { Button, Textarea } from "../../components/Primitives";
import { clock } from "../../lib/format";
import type { Message } from "../../mock/types";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { Link } from "react-router-dom";
import { useToast } from "../../state/ToastContext";

const TICK: Record<Message["status"], string> = {
  queued: "…",
  sent: "✓",
  delivered: "✓✓",
  failed: "⚠",
};

function Bubble({ msg, onRetry }: { msg: Message; onRetry?: () => void }) {
  const mine = msg.direction === "out";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-[14px] px-3.5 py-2 text-sm ${mine ? "bg-focus text-white" : "bg-paper text-ink border border-line"}`}>
        <p>{msg.body}</p>
        <div className={`mt-1 flex items-center gap-2 text-[11px] ${mine ? "text-white/75" : "text-ink-2"}`}>
          <span>{clock(msg.at)}</span>
          {mine && (
            <span style={{ color: msg.status === "failed" ? "var(--danger-bg)" : undefined }}>
              {TICK[msg.status]} {msg.status === "failed" ? "Failed" : msg.status === "queued" ? "Sending" : msg.status === "sent" ? "Sent" : "Delivered"}
            </span>
          )}
          {mine && msg.status === "failed" && onRetry && (
            <button type="button" onClick={onRetry} className="underline font-medium">
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Conversation({ contactId, optedOut }: { contactId: string; optedOut: boolean }) {
  const { messages, integrations } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [draft, setDraft] = useState("");
  const thread = messages.filter((m) => m.contactId === contactId);
  const canManage = !session || has({ role: session.role }, "contacts.manage");
  const channelReady = integrations.find((integration) => integration.key === "whatsapp")?.status === "connected";
  const canSend = canManage && channelReady && !optedOut;

  function send() {
    if (!draft.trim() || !canSend) return;
    try {
      store.sendMessage(contactId, draft.trim());
      setDraft("");
      push("Message queued for delivery.", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "The message could not be sent.", "error");
    }
  }

  return (
    <div className="flex flex-col h-[520px] border border-line rounded-card bg-surface">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {thread.length === 0 ? (
          <p className="text-sm text-ink-2 text-center my-auto">No messages yet.</p>
        ) : (
          thread.map((m) => <Bubble key={m.id} msg={m} onRetry={canSend ? () => store.retryMessage(m.id) : undefined} />)
        )}
      </div>
      <div className="border-t border-line p-3">
        {!canSend ? (
          <p className="text-sm text-text-muted rounded-card border border-border bg-neutral-bg px-3 py-2.5 text-center">
            {optedOut ? "Contact opted out. Messaging is disabled." : !canManage ? "Your role can review this conversation but cannot send replies." : <>WhatsApp is not connected. <Link to="/integrations" className="font-medium text-primary underline">Manage integrations</Link></>}
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              aria-label="Message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Write a reply…"
              className="flex-1"
            />
            <Button onClick={send} disabled={!draft.trim()}>Send</Button>
          </div>
        )}
      </div>
    </div>
  );
}
