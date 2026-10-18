import { useState, type FormEvent, type ReactNode } from "react";
import { store } from "../../state/useStore";
import { Button, FormField, Input, Textarea } from "../../components/Primitives";

export default function PublicForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "submitting" | "done" | "throttled">("idle");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (honeypot) return; // silently drop bot submissions
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Enter your name.";
    if (!/^[\d()+\-.\s]{7,}$/.test(phone.trim())) next.phone = "Enter a valid phone number.";
    if (!message.trim()) next.message = "Tell us what you need.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setState("submitting");
    window.setTimeout(() => {
      if (Math.random() < 0.06) {
        setState("throttled");
        return;
      }
      store.createLead({ name, phone, message, source: "Public form" });
      setState("done");
    }, 500);
  }

  if (state === "done") {
    return (
      <PublicShell>
        <div className="text-center py-6">
          <div className="text-4xl mb-3" aria-hidden>✓</div>
          <h1 className="text-xl font-semibold mb-1">Thanks! Someone will reply within 1 minute.</h1>
          <p className="text-sm text-ink-2">We've notified our team — keep an eye on your phone.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <h1 className="text-xl font-semibold mb-1">Get a fast quote</h1>
      <p className="text-sm text-ink-2 mb-6">Tell us what's going on — a real person replies within a minute.</p>

      {state === "throttled" && (
        <p className="text-sm rounded-[10px] border px-3 py-2.5 mb-4" style={{ borderColor: "var(--signal)", background: "var(--warn-bg)" }}>
          Please try again shortly.
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label="Your name" htmlFor="pf-name" required error={errors.name}>
          <Input id="pf-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Phone number" htmlFor="pf-phone" required error={errors.phone}>
          <Input id="pf-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
        <FormField label="What do you need?" htmlFor="pf-message" required error={errors.message}>
          <Textarea id="pf-message" required value={message} onChange={(e) => setMessage(e.target.value)} />
        </FormField>
        <div className="absolute left-[-9999px]" aria-hidden="true">
          <label htmlFor="company">Company</label>
          <input id="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>
        <Button type="submit" disabled={state === "submitting"} className="w-full mt-1">
          {state === "submitting" ? "Sending…" : "Request a quote"}
        </Button>
      </form>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-surface border border-line rounded-[10px] p-6 sm:p-8">
        <div className="font-display text-lg mb-6 text-ink-2">LeadGuard Roofing</div>
        {children}
      </div>
    </div>
  );
}
