import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { Button, Card, FormField, Input, Select } from "../../components/Primitives";
import { useToast } from "../../state/ToastContext";
import ChangePassword from "../auth/ChangePassword";

const TABS = ["Stages", "Custom fields", "Assignment", "Team", "My notifications", "Security"] as const;
type Tab = (typeof TABS)[number];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("Stages");
  const { session } = useAuth();
  const canManage = !session || has({ role: session.role }, "settings.manage");

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-2">Configure LeadGuard without code.</p>
      </header>

      <div role="tablist" aria-label="Settings sections" className="flex gap-1 border-b border-line mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3.5 h-10 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
              tab === t ? "border-ink text-ink" : "border-transparent text-ink-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!canManage && tab !== "My notifications" && tab !== "Security" && (
        <p className="text-sm text-ink-2 mb-4">You need the "Manage settings" permission to change this — showing read-only.</p>
      )}

      {tab === "Stages" && <StagesTab canManage={canManage} />}
      {tab === "Custom fields" && <FieldsTab canManage={canManage} />}
      {tab === "Assignment" && <AssignmentTab canManage={canManage} />}
      {tab === "Team" && <TeamTab canManage={canManage} />}
      {tab === "My notifications" && <NotificationsTab />}
      {tab === "Security" && <ChangePassword />}
    </div>
  );
}

function StagesTab({ canManage }: { canManage: boolean }) {
  const { stages, opportunities } = useStoreState();
  const { push } = useToast();
  const [newStage, setNewStage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [moveTo, setMoveTo] = useState("");

  function requestDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
    setMoveTo(stages.find((s) => s.id !== id)?.id ?? "");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const count = opportunities.filter((o) => o.stageId === deleteTarget.id).length;
    if (count > 0 && !moveTo) return;
    store.deleteStage(deleteTarget.id, moveTo);
    push(`Deleted "${deleteTarget.name}".`);
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.map((s) => {
        const count = opportunities.filter((o) => o.stageId === s.id).length;
        return (
          <Card key={s.id} className="p-3 flex items-center gap-3">
            <Input
              defaultValue={s.name}
              disabled={!canManage}
              aria-label={`Stage name for ${s.name}`}
              onBlur={(e) => e.target.value !== s.name && store.renameStage(s.id, e.target.value)}
              className="flex-1"
            />
            <span className="text-xs text-ink-2 shrink-0">{count} opportunit{count === 1 ? "y" : "ies"}</span>
            {canManage && (
              <button onClick={() => requestDelete(s.id, s.name)} className="text-xs text-alarm underline shrink-0">
                Delete
              </button>
            )}
          </Card>
        );
      })}

      {canManage && (
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newStage.trim()) return;
            store.addStage(newStage.trim());
            setNewStage("");
          }}
        >
          <Input aria-label="New stage name" placeholder="New stage name" value={newStage} onChange={(e) => setNewStage(e.target.value)} />
          <Button type="submit">Add stage</Button>
        </form>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-[10px] border border-line w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Delete "{deleteTarget.name}"?</h2>
            {opportunities.filter((o) => o.stageId === deleteTarget.id).length > 0 ? (
              <FormField label="Move existing opportunities to" htmlFor="move-to" required>
                <Select id="move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  {stages.filter((s) => s.id !== deleteTarget.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <p className="text-sm text-ink-2">This stage is empty — nothing else is affected.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete}>Delete stage</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldsTab({ canManage }: { canManage: boolean }) {
  const { customFields } = useStoreState();
  const { push } = useToast();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"text" | "number" | "date" | "dropdown" | "checkbox">("text");

  return (
    <div className="flex flex-col gap-3">
      {customFields.map((f) => (
        <Card key={f.id} className="p-3 flex items-center justify-between">
          <span className="font-medium">{f.label}</span>
          <span className="text-xs text-ink-2 capitalize">{f.type}</span>
        </Card>
      ))}

      {canManage && (
        <form
          className="flex flex-wrap gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            store.addCustomField({ label: label.trim(), type });
            push(`Added field "${label.trim()}".`);
            setLabel("");
          }}
        >
          <Input aria-label="Field label" placeholder="Field label" value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1 min-w-[160px]" />
          <Select aria-label="Field type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-auto">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="dropdown">Dropdown</option>
            <option value="checkbox">Checkbox</option>
          </Select>
          <Button type="submit">Add field</Button>
        </form>
      )}
    </div>
  );
}

function AssignmentTab({ canManage }: { canManage: boolean }) {
  const [window_, setWindow] = useState(10);
  const { team } = useStoreState();
  const { push } = useToast();

  return (
    <form
      className="flex flex-col gap-4 max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        push("Assignment settings saved.");
      }}
    >
      <FormField label="Acknowledgement window (seconds)" htmlFor="window" hint="How long before a lead escalates to the next person.">
        <Input id="window" type="number" min={5} disabled={!canManage} value={window_} onChange={(e) => setWindow(Number(e.target.value))} />
      </FormField>
      <FormField label="Backup owner" htmlFor="backup">
        <Select id="backup" disabled={!canManage} defaultValue={team[1]?.id}>
          {team.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Manager escalation" htmlFor="manager">
        <Select id="manager" disabled={!canManage} defaultValue={team.find((m) => m.role === "Manager")?.id}>
          {team.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </FormField>
      {canManage && <Button type="submit" className="w-fit">Save</Button>}
    </form>
  );
}

function TeamTab({ canManage }: { canManage: boolean }) {
  const { team } = useStoreState();
  return (
    <div className="flex flex-col gap-3">
      {team.map((m) => (
        <Card key={m.id} className="p-3 flex items-center gap-3 flex-wrap">
          <span className="font-medium flex-1 min-w-[140px]">{m.name}</span>
          <span className="text-xs text-ink-2 bg-paper border border-line rounded-full px-2 py-0.5">{m.role}</span>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={m.inRotation}
              disabled={!canManage}
              onChange={(e) => store.setTeamFlags(m.id, { inRotation: e.target.checked })}
            />
            In escalation rotation
          </label>
        </Card>
      ))}
    </div>
  );
}

function NotificationsTab() {
  const { session } = useAuth();
  const { team } = useStoreState();
  const { push } = useToast();
  const me = team.find((m) => m.id === session?.userId);
  const [chatId, setChatId] = useState(me?.telegramChatId ?? "");

  return (
    <form
      className="flex flex-col gap-4 max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (me) store.setTeamFlags(me.id, { telegramChatId: chatId });
        push("Saved");
      }}
    >
      <FormField label="Telegram chat ID" htmlFor="tg" hint="Get this from @leadguard_bot in Telegram — we'll ping you here on escalation.">
        <Input id="tg" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="e.g. 583921047" />
      </FormField>
      <Button type="submit" className="w-fit">Save</Button>
    </form>
  );
}
