import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, FormField, Input, Select } from "../../components/Primitives";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusChip } from "../../components/StatusChip";
import { clock, dateLabel } from "../../lib/format";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";

function localDateTimeMinimum() {
  const next = new Date(Date.now() + 60_000);
  next.setSeconds(0, 0);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Appointments() {
  const { appointments, contacts, integrations } = useStoreState();
  const { push } = useToast();
  const calendarReady = integrations.find((integration) => integration.key === "google")?.status === "connected";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [title, setTitle] = useState("Inspection");
  const [start, setStart] = useState("");
  const [minimumStart] = useState(localDateTimeMinimum);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const rows = useMemo(() => appointments.filter((appointment) => {
    if (status !== "all" && appointment.status !== status) return false;
    const contact = contacts.find((person) => person.id === appointment.contactId);
    return `${appointment.title} ${contact?.name ?? ""} ${contact?.phone ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [appointments, contacts, query, status]);

  function book(event: FormEvent) {
    event.preventDefault();
    const effectiveContactId = contactId || contacts[0]?.id || "";
    const startAt = new Date(start);
    if (!calendarReady || !effectiveContactId || !title.trim() || Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) return;
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    try {
      store.bookAppointment(effectiveContactId, title.trim(), startAt.toISOString(), endAt.toISOString());
      push("Appointment booked.", "success");
      setCreateOpen(false); setStart(""); setTitle("Inspection");
    } catch (error) {
      push(error instanceof Error ? error.message : "Calendar booking is unavailable.", "error");
    }
  }

  const cancel = useCallback(() => {
    if (!cancelId) return;
    try {
      store.cancelAppointment(cancelId);
      push("Appointment cancellation requested.", "info");
    } catch (error) {
      push(error instanceof Error ? error.message : "Appointment could not be cancelled.", "error");
    }
    setCancelId(null);
  }, [cancelId, push]);

  const activeContactId = contactId || contacts[0]?.id || "";

  return <div className="p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-medium text-primary">Communication</p><h1 className="text-2xl font-semibold">Appointments</h1><p className="mt-1 text-sm text-text-muted">Keep inspections and follow-ups coordinated with customer records.</p></div><Button onClick={() => setCreateOpen((open) => !open)} disabled={!calendarReady}>Book appointment</Button></header>
    {!calendarReady && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text"><span>Google Calendar needs to be connected before appointments can be booked.</span><Link to="/integrations" className="font-medium underline underline-offset-2">Manage integrations</Link></div>}
    {createOpen && <Card className="mb-4 p-4"><form onSubmit={book} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
      <FormField label="Contact" htmlFor="appointment-contact" required><Select id="appointment-contact" value={activeContactId} onChange={(event) => setContactId(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</Select></FormField>
      <FormField label="Appointment title" htmlFor="appointment-title" required><Input id="appointment-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></FormField>
      <FormField label="Start date and time" htmlFor="appointment-start" required><Input id="appointment-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} min={minimumStart} required /></FormField>
      <div className="flex gap-2"><Button type="submit" disabled={!calendarReady || !activeContactId || !title.trim() || !start}>Book one-hour slot</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
    </form><p className="mt-3 text-xs text-text-muted">Availability and the final booking response come from the calendar integration.</p></Card>}
    <div className="mb-4 flex flex-wrap gap-2"><Input aria-label="Search appointments" placeholder="Search customer or appointment…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-52 flex-1 sm:max-w-sm" /><Select aria-label="Filter appointments by status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto"><option value="all">All appointments</option><option value="booked">Booked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></div>
    <Card className="overflow-hidden">
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-neutral-bg/70 text-left text-xs text-text-muted"><tr><th className="px-4 py-3 font-medium">Appointment</th><th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Date & time</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>{rows.map((appointment) => { const contact = contacts.find((person) => person.id === appointment.contactId); return <tr key={appointment.id} className="border-t border-border/80 hover:bg-neutral-bg/50"><td className="px-4 py-3 font-medium">{appointment.title}</td><td className="px-4 py-3">{contact ? <Link to={`/contacts/${contact.id}`} className="text-primary hover:underline">{contact.name}</Link> : <span className="text-text-muted">Contact unavailable</span>}</td><td className="px-4 py-3"><span>{dateLabel(appointment.start)}</span><p className="text-xs text-text-muted">{clock(appointment.start)}–{clock(appointment.end)}</p></td><td className="px-4 py-3"><StatusChip kind={appointment.status} /></td><td className="px-4 py-3">{appointment.status === "booked" ? <Button variant="tertiary" className="h-9 px-2 text-danger-text" onClick={() => setCancelId(appointment.id)}>Cancel booking</Button> : <span className="text-xs text-text-muted">—</span>}</td></tr>; })}</tbody></table></div> : <EmptyState title="No appointments match these filters." body={appointments.length ? "Try another search or status." : "Appointments will appear here when they are scheduled for a contact."} />}
      {rows.length > 0 && <div className="border-t border-border px-4 py-3 text-xs text-text-muted">{rows.length} appointment{rows.length === 1 ? "" : "s"}</div>}
    </Card>
    <ConfirmDialog open={!!cancelId} title="Cancel this appointment?" body="This will update the appointment record and its calendar event when connected." confirmLabel="Cancel appointment" danger onConfirm={cancel} onCancel={() => setCancelId(null)} />
  </div>;
}
