import { useRef, useState, type FormEvent } from "react";
import { store, useStoreState } from "../../state/useStore";
import { Button, FormField, Input, Card } from "../../components/Primitives";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { dateLabel, clock } from "../../lib/format";
import { useToast } from "../../state/ToastContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Link } from "react-router-dom";
import { useFocusTrap } from "../../lib/useFocusTrap";

export function AppointmentsPanel({ contactId }: { contactId: string }) {
  const { appointments, integrations } = useStoreState();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Inspection");
  const [date, setDate] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusTrap(formRef, open, () => setOpen(false));

  const list = appointments.filter((a) => a.contactId === contactId);
  const calendar = integrations.find((i) => i.key === "google");
  const calendarReady = calendar?.status === "connected";

  function book(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    const start = new Date(date).toISOString();
    const end = new Date(new Date(date).getTime() + 3600_000).toISOString();
    try {
      store.bookAppointment(contactId, title, start, end);
      push("Appointment booked.", "success");
      setOpen(false);
    } catch (error) {
      push(error instanceof Error ? error.message : "Appointment could not be booked.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wide">Appointments</h3>
        {calendarReady ? (
          <Button variant="secondary" onClick={() => setOpen(true)}>+ Book</Button>
        ) : (
          <Link to="/integrations" className="text-xs text-text-muted underline underline-offset-2" title="Reconnect Google Calendar in Integrations">
            Calendar unavailable
          </Link>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing booked yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id}>
              <Card className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-ink-2">{dateLabel(a.start)} · {clock(a.start)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip kind={a.status as ChipKind} />
                  {a.status === "booked" && (
                    <button type="button" onClick={() => setCancelId(a.id)} className="text-xs underline text-ink-2 hover:text-ink h-9 px-1">
                      Cancel
                    </button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="appt-title">
          <form ref={formRef} onSubmit={book} className="bg-surface rounded-card border border-line w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 id="appt-title" className="text-lg font-semibold">Book an appointment</h2>
            <FormField label="Title" htmlFor="appt-title-field">
              <Input id="appt-title-field" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="Date and time" htmlFor="appt-date" required>
              <Input id="appt-date" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Book</Button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!cancelId}
        title="Cancel this appointment?"
        body="The connected calendar and this record will be updated when cancellation succeeds."
        confirmLabel="Cancel appointment"
        danger
        onConfirm={() => {
          if (cancelId) {
            store.cancelAppointment(cancelId);
            push("Appointment cancellation requested.", "info");
          }
          setCancelId(null);
        }}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
}
