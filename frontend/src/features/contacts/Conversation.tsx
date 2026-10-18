import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { Button, Textarea } from "../../components/Primitives";
import { clock } from "../../lib/format";
import type { Message } from "../../mock/types";

const TICK: Record<Message["status"], string> = {
  queued: "…",
  sent: "✓",
  delivered: "✓✓",
  failed: "⚠",
};

function Bubble({ msg, onRetry }: { msg: Message; onRetry: () => void }) {
  const mine = msg.direction === "out";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-[14px] px-3.5 py-2 text-sm ${mine ? "bg-focus text-white" : "bg-paper text-ink border border-line"}`}>
        <p>{msg.body}</p>
        <div className={`mt-1 flex items-center gap-2 text-[11px] ${mine ? "text-white/75" : "text-ink-2"}`}>
          <span>{clock(msg.at)}</span>
          {mine && (
            <span style={{ color: msg.status === "failed" ? "#FFD7CC" : undefined }}>
              {TICK[msg.status]} {msg.status === "failed" ? "Failed" : msg.status === "queued" ? "Sending" : msg.status === "sent" ? "Sent" : "Delivered"}
            </span>
          )}
          {mine && msg.status === "failed" && (
            <button onClick={onRetry} className="underline font-medium">
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Conversation({ contactId, optedOut }: { contactId: string; optedOut: boolean }) {
  const { messages } = useStoreState();
  const [draft, setDraft] = useState("");
  const thread = messages.filter((m) => m.contactId === contactId);

  function send() {
    if (!draft.trim() || optedOut) return;
    store.sendMessage(contactId, draft.trim());
    setDraft("");
  }

  return (
    <div className="flex flex-col h-[520px] border border-line rounded-[10px] bg-surface">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {thread.length === 0 ? (
          <p className="text-sm text-ink-2 text-center my-auto">No messages yet.</p>
        ) : (
          thread.map((m) => <Bubble key={m.id} msg={m} onRetry={() => store.retryMessage(m.id)} />)
        )}
      </div>
      <div className="border-t border-line p-3">
        {optedOut ? (
          <p className="text-sm text-ink-2 bg-paper border border-line rounded-[10px] px-3 py-2.5 text-center">
            Contact opted out. Messaging is disabled.
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
