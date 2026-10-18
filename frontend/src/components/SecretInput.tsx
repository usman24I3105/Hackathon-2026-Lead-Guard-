import { useId, useState } from "react";
import { Button, Input } from "./Primitives";

/**
 * For any credential (API key, webhook secret, OAuth token). Never
 * prefilled with a real value — only a masked placeholder is ever shown
 * after saving, matching what the integration card displays elsewhere.
 */
export function SecretInput({
  label,
  onSave,
  savingLabel = "Saving…",
}: {
  label: string;
  onSave: (value: string) => Promise<void> | void;
  savingLabel?: string;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value) return;
    setSaving(true);
    await onSave(value);
    setSaving(false);
    setValue(""); // never keep the plaintext secret around after a save
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the new value"
          className="flex-1"
        />
        <Button type="button" variant="secondary" disabled={!value || saving} onClick={save}>
          {saving ? savingLabel : "Save"}
        </Button>
      </div>
    </div>
  );
}
