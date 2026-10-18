import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { Button, Textarea } from "../../components/Primitives";
import { Notice, Tooltip } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
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
      <article className={`conversation-bubble ${mine ? "conversation-bubble--out" : "conversation-bubble--in"}`}>
        <p>{msg.body}</p>
        <div className="conversation-bubble-meta">
          <span>{clock(msg.at)}</span>
          {mine && (
            <span className={msg.status === "failed" ? "text-danger-text" : ""}>
              {TICK[msg.status]} {msg.status === "failed" ? "Failed" : msg.status === "queued" ? "Sending" : msg.status === "sent" ? "Sent" : "Delivered"}
            </span>
          )}
          {mine && msg.status === "failed" && onRetry && (
            <button type="button" onClick={onRetry} className="app-link font-medium">
              Retry
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

export function Conversation({ contactId, optedOut }: { contactId: string; optedOut: boolean }) {
  const { messages, integrations } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [draft, setDraft] = useState("");
  const thread = messages.filter((m) => m.contactId === contactId).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
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
    <div className="conversation-panel">
      <div className="conversation-message-list">
        {thread.length === 0 ? (
          <p className="text-sm text-text-muted m-auto">No messages yet.</p>
        ) : (
          thread.map((m, index) => {
            const previous = thread[index - 1];
            const day = new Date(m.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            const previousDay = previous ? new Date(previous.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
            return <div key={m.id} className="conversation-message-group">{day !== previousDay && <div className="conversation-day-divider"><span>{day}</span></div>}<Bubble msg={m} onRetry={canSend ? () => store.retryMessage(m.id) : undefined} /></div>;
          })
        )}
      </div>
      <div className="conversation-composer">
        {!canSend && <Notice variant={optedOut ? "restricted" : "warning"} className="mb-2">{optedOut ? "Messaging is disabled because this contact opted out." : !canManage ? "Your role can review this conversation but cannot send replies." : <>WhatsApp is not connected. <Link to="/integrations" className="app-link">Manage integrations</Link></>}</Notice>}
        <div className="flex items-end gap-2">
          <Textarea aria-label="Message" value={draft} disabled={!canSend} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={canSend ? "Write a reply…" : "Replies are unavailable"} className="flex-1" />
          {canSend ? <Button onClick={send} disabled={!draft.trim()} leadingIcon={<Icon name="arrow-right" size={15} />}>Send</Button> : <Tooltip content={optedOut ? "This contact has opted out" : !canManage ? "You need contacts.manage permission to send" : "Connect WhatsApp to send a reply"}><span><Button disabled>Send</Button></span></Tooltip>}
        </div>
      </div>
    </div>
  );
}
