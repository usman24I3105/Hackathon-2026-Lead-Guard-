import { useState } from "react";
import { store, useStoreState } from "../../state/useStore";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { Button, Card, FormField, Input, Select } from "../../components/Primitives";
import { Icon, type IconName } from "../../components/icons";
import { Notice, PageHeader } from "../../components/DesignSystem";
import { useToast } from "../../state/ToastContext";
import ChangePassword from "../auth/ChangePassword";
import type { Permission, Role } from "../../lib/perm";

const TABS = ["Stages", "Custom fields", "Assignment", "Team", "Roles & permissions", "My notifications", "Security"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS: Record<Tab, IconName> = { "Stages": "pipeline", "Custom fields": "list", "Assignment": "leads", "Team": "team", "Roles & permissions": "shield", "My notifications": "bell", "Security": "lock" };

export default function Settings({ navPosition = "right" }: { navPosition?: "right" | "left" } = {}) {
  const [tab, setTab] = useState<Tab>("Stages");
  const { session } = useAuth();
  const canManage = !session || has({ role: session.role }, "settings.manage");

  const readonlySection = !canManage && tab !== "My notifications" && tab !== "Security";
  return (
    <div className="page-content settings-page">
      <PageHeader eyebrow="Configuration" title="Workspace settings" subtitle="Configure LeadGuard for your team." />
      {readonlySection && <Notice variant="restricted" className="mb-4" title="Read-only">Manage settings permission is required to make changes.</Notice>}
      <div className="settings-layout" data-nav-position={navPosition}>
        <div className="settings-main-column" role="tabpanel" aria-label={tab}>
          {tab === "Stages" && <StagesTab canManage={canManage} />}
          {tab === "Custom fields" && <FieldsTab canManage={canManage} />}
          {tab === "Assignment" && <AssignmentTab canManage={canManage} />}
          {tab === "Team" && <TeamTab canManage={canManage} />}
          {tab === "Roles & permissions" && <AccessTab />}
          {tab === "My notifications" && <NotificationsTab />}
          {tab === "Security" && <ChangePassword />}
        </div>
        <SettingsNavigation navPosition={navPosition} tab={tab} onChange={setTab} />
      </div>
    </div>
  );
}

function SettingsNavigation({ navPosition, tab, onChange }: { navPosition: "right" | "left"; tab: Tab; onChange: (tab: Tab) => void }) {
  return <aside className="settings-nav-card" data-position={navPosition} aria-label="Settings sections">
    <label className="settings-mobile-label" htmlFor="settings-section">Settings section</label>
    <Select id="settings-section" className="settings-mobile-select" value={tab} onChange={(event) => onChange(event.target.value as Tab)}>{TABS.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
    <div className="settings-nav-group"><p>Workspace</p>{TABS.slice(0, 5).map((item) => <button key={item} type="button" aria-current={tab === item ? "page" : undefined} onClick={() => onChange(item)}><Icon name={TAB_ICONS[item]} size={16} /><span>{item}</span></button>)}</div>
    <div className="settings-nav-group"><p>Personal</p>{TABS.slice(5).map((item) => <button key={item} type="button" aria-current={tab === item ? "page" : undefined} onClick={() => onChange(item)}><Icon name={TAB_ICONS[item]} size={16} /><span>{item}</span></button>)}</div>
  </aside>;
}

function StagesTab({ canManage }: { canManage: boolean }) {
  const { stages, opportunities, customFields } = useStoreState();
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

  function updateStageConfig(id: string, patch: { requiredFields?: string[]; isClosed?: boolean }) {
    try {
      store.setStageConfig(id, patch);
      push("Stage settings updated.", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "Stage settings could not be saved.", "error");
    }
  }

  function reorderStage(id: string, targetIndex: number) {
    try {
      store.reorderStage(id, targetIndex);
    } catch (error) {
      push(error instanceof Error ? error.message : "Stage order could not be changed.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {stages.map((s, index) => {
        const count = opportunities.filter((o) => o.stageId === s.id).length;
        return (
          <Card key={s.id} className="stage-setting-card flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="stage-drag-handle" aria-hidden="true" title="Reorder with the arrow controls"><Icon name="menu" size={16} /></span>
              <Input
                defaultValue={s.name}
                disabled={!canManage}
                aria-label={`Stage name for ${s.name}`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && store.renameStage(s.id, e.target.value.trim())}
                className="stage-name-edit min-w-36 flex-1"
              />
              <span className="text-xs text-ink-2 shrink-0">{count} opportunit{count === 1 ? "y" : "ies"}</span>
              <Select aria-label={`Stage type for ${s.name}`} disabled={!canManage} value={s.isClosed ? "closed" : "open"} onChange={(e) => updateStageConfig(s.id, { isClosed: e.target.value === "closed" })} className="w-auto">
                <option value="open">Open stage</option><option value="closed">Closed stage</option>
              </Select>
              {canManage && <div className="flex items-center gap-1">
                <button type="button" aria-label={`Move ${s.name} earlier`} disabled={index === 0} onClick={() => reorderStage(s.id, index - 1)} className="h-9 w-9 rounded-control border border-border text-text-muted hover:bg-neutral-bg disabled:opacity-40">↑</button>
                <button type="button" aria-label={`Move ${s.name} later`} disabled={index === stages.length - 1} onClick={() => reorderStage(s.id, index + 1)} className="h-9 w-9 rounded-control border border-border text-text-muted hover:bg-neutral-bg disabled:opacity-40">↓</button>
                <button type="button" onClick={() => requestDelete(s.id, s.name)} className="h-9 px-2 text-xs text-alarm underline shrink-0">Delete</button>
              </div>}
            </div>
            {customFields.length > 0 && <fieldset className="stage-required">
              <legend className="px-1 text-xs font-medium text-ink-2">Required to enter this stage</legend>
              {customFields.map((field) => <label key={field.id}><input type="checkbox" checked={s.requiredFields.includes(field.label)} disabled={!canManage} onChange={(event) => updateStageConfig(s.id, { requiredFields: event.target.checked ? [...s.requiredFields, field.label] : s.requiredFields.filter((name) => name !== field.label) })} />{field.label}</label>)}
            </fieldset>}
          </Card>
        );
      })}

      {canManage && (
        <form
          className="settings-add-stage"
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
          <div className="bg-surface rounded-card border border-line w-full max-w-sm p-6 flex flex-col gap-4">
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
  const { customFields, stages } = useStoreState();
  const { push } = useToast();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"text" | "number" | "date" | "dropdown" | "checkbox">("text");
  const [options, setOptions] = useState("");
  const [stageId, setStageId] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {customFields.map((f) => (
        <Card key={f.id} className="p-3 flex items-center justify-between">
          <div><span className="font-medium">{f.label}</span>{f.stageId && <p className="mt-0.5 text-xs text-text-muted">Used for {stages.find((stage) => stage.id === f.stageId)?.name ?? "a pipeline stage"}</p>}</div>
          <span className="text-xs text-ink-2 capitalize">{f.type}{f.options?.length ? ` · ${f.options.length} options` : ""}</span>
        </Card>
      ))}

      {canManage && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            const parsedOptions = type === "dropdown" ? Array.from(new Set(options.split(",").map((option) => option.trim()).filter(Boolean))) : undefined;
            if (type === "dropdown" && (!parsedOptions || parsedOptions.length < 2)) {
              push("Add at least two comma-separated options.", "error");
              return;
            }
            store.addCustomField({ label: label.trim(), type, options: parsedOptions, stageId: stageId || undefined });
            push(`Added field “${label.trim()}”.`, "success");
            setLabel("");
            setOptions("");
            setStageId("");
          }}
        >
          <FormField label="Field label" htmlFor="field-label" required><Input id="field-label" placeholder="Roof type" value={label} onChange={(e) => setLabel(e.target.value)} /></FormField>
          <FormField label="Type" htmlFor="field-type"><Select id="field-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-auto">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="dropdown">Dropdown</option>
            <option value="checkbox">Checkbox</option>
          </Select></FormField>
          {type === "dropdown" && <FormField label="Options" htmlFor="field-options" required hint="Separate choices with commas."><Input id="field-options" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Shingle, Metal, Tile" /></FormField>}
          <FormField label="Stage association" htmlFor="field-stage"><Select id="field-stage" value={stageId} onChange={(e) => setStageId(e.target.value)} className="w-auto"><option value="">No stage association</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</Select></FormField>
          <Button type="submit" disabled={!canManage || !label.trim()}>Add field</Button>
        </form>
      )}
    </div>
  );
}

function AssignmentTab({ canManage }: { canManage: boolean }) {
  const { team, assignmentRules } = useStoreState();
  const [window_, setWindow] = useState(assignmentRules.acknowledgementSeconds);
  const [backupOwnerId, setBackupOwnerId] = useState(assignmentRules.backupOwnerId);
  const [managerOwnerId, setManagerOwnerId] = useState(assignmentRules.managerOwnerId);
  const { push } = useToast();

  return (
    <form
      className="flex flex-col gap-4 max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          store.setAssignmentRules({ acknowledgementSeconds: window_, backupOwnerId, managerOwnerId });
          push("Assignment rules saved. New assignments will use them.", "success");
        } catch (error) {
          push(error instanceof Error ? error.message : "Assignment settings are unavailable.", "error");
        }
      }}
    >
      <FormField label="Acknowledgement window (seconds)" htmlFor="window" hint="5–300 seconds. The server remains authoritative for live escalation.">
        <Input id="window" type="number" min={5} max={300} disabled={!canManage} value={window_} onChange={(e) => setWindow(Number(e.target.value))} />
      </FormField>
      <FormField label="Backup owner" htmlFor="backup">
        <Select id="backup" disabled={!canManage} value={backupOwnerId} onChange={(e) => setBackupOwnerId(e.target.value)}>
          {team.filter((m) => m.inRotation || m.id === backupOwnerId).map((m) => (
            <option key={m.id} value={m.id} disabled={!m.inRotation}>{m.name}{m.inRotation ? "" : " · not in rotation"}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Manager escalation" htmlFor="manager">
        <Select id="manager" disabled={!canManage} value={managerOwnerId} onChange={(e) => setManagerOwnerId(e.target.value)}>
          {team.filter((m) => ((m.role === "Manager" || m.role === "Owner") && m.inRotation) || m.id === managerOwnerId).map((m) => (
            <option key={m.id} value={m.id} disabled={!m.inRotation || m.role === "User"}>{m.name}{m.role === "User" ? " · not a manager" : !m.inRotation ? " · not in rotation" : ""}</option>
          ))}
        </Select>
      </FormField>
      {canManage && <Button type="submit" className="w-fit" disabled={!team.length || window_ < 5 || window_ > 300}>Save rules</Button>}
      <p className="text-xs text-text-muted">Preview mode applies these rules to newly routed leads. Existing deadlines are not rewritten.</p>
    </form>
  );
}

function AccessTab() {
  const roles: Role[] = ["Owner", "Manager", "User"];
  const permissions: { id: Permission; label: string }[] = [
    { id: "leads.view", label: "View leads" },
    { id: "leads.manage", label: "Manage leads" },
    { id: "contacts.view", label: "View contacts" },
    { id: "contacts.manage", label: "Manage contacts" },
    { id: "pipeline.manage", label: "Manage opportunities" },
    { id: "payments.manage", label: "Manage payments" },
    { id: "calendar.manage", label: "Manage calendar" },
    { id: "team.manage", label: "Manage team" },
    { id: "settings.manage", label: "Manage settings" },
    { id: "integrations.manage", label: "Manage integrations" },
    { id: "audit.view", label: "View audit log" },
    { id: "dashboard.full", label: "View full dashboard" },
  ];
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-text-muted">Current workspace role presets. The server enforces access; policy editing becomes available when the backend supports it.</p>
    <Card className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-neutral-bg/70 text-left"><tr><th className="px-3 py-3 font-medium">Permission</th>{roles.map((role) => <th key={role} className="px-3 py-3 text-center font-medium">{role}</th>)}</tr></thead><tbody>{permissions.map((permission) => <tr key={permission.id} className="border-t border-border"><th scope="row" className="px-3 py-2.5 text-left font-medium">{permission.label}</th>{roles.map((role) => { const allowed = has({ role }, permission.id); return <td key={role} className="px-3 py-2.5 text-center"><span role="img" className={allowed ? "text-success-text" : "text-text-muted"} aria-label={allowed ? "Allowed" : "Not allowed"}>{allowed ? "✓" : "—"}</span></td>; })}</tr>)}</tbody></table></Card>
  </div>;
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
