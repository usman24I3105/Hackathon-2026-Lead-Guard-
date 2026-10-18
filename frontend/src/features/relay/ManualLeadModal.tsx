import { useRef, useState, type FormEvent } from "react";
import { store } from "../../state/useStore";
import { Button, FormField, Input, Textarea } from "../../components/Primitives";
import { useToast } from "../../state/ToastContext";
import { useFocusTrap } from "../../lib/useFocusTrap";

export function ManualLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusTrap(formRef, open, onClose);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    try {
      store.createLead({ name, phone, message: message || "No message provided.", source: "Manual entry" });
    } catch (submitError) {
      const messageText = submitError instanceof Error ? submitError.message : "The lead could not be added.";
      setError(messageText);
      push(messageText, "error");
      return;
    }
    push(`${name} added to the Relay.`, "success");
    setName("");
    setPhone("");
    setMessage("");
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-lead-title">
      <form ref={formRef} onSubmit={submit} className="bg-surface rounded-card border border-line w-full max-w-md p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="manual-lead-title" className="text-lg font-semibold">Add a lead manually</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-paper">✕</button>
        </div>
        {error && name.trim() && phone.trim() && <p role="alert" className="rounded-control border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger-text">{error}</p>}
        <FormField label="Name" htmlFor="ml-name" required error={error && !name.trim() ? error : undefined}>
          <Input id="ml-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Phone" htmlFor="ml-phone" required>
          <Input id="ml-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <FormField label="Message" htmlFor="ml-message" hint="What they're asking about.">
          <Textarea id="ml-message" value={message} onChange={(e) => setMessage(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2 mt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add lead</Button>
        </div>
      </form>
    </div>
  );
}
