import { useState, type FormEvent } from "react";
import { store, useStoreState } from "../../state/useStore";
import { Button, FormField, Input, Select } from "../../components/Primitives";
import { useToast } from "../../state/ToastContext";

export function FillFieldModal({
  oppId,
  stageId,
  missing,
  onClose,
}: {
  oppId: string;
  stageId: string;
  missing: string[];
  onClose: () => void;
}) {
  const { customFields } = useStoreState();
  const { push } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    if (missing.some((f) => !values[f]?.trim())) return;
    const result = store.moveOpportunity(oppId, stageId, values);
    if (result.ok) {
      push("Moved. Required fields saved.");
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="fill-field-title">
      <form onSubmit={submit} className="bg-surface rounded-[10px] border border-line w-full max-w-sm p-6 flex flex-col gap-4">
        <h2 id="fill-field-title" className="text-lg font-semibold">Fill in required fields</h2>
        <p className="text-sm text-ink-2">Fill in {missing.join(", ")} before moving to this stage.</p>
        {missing.map((field) => {
          const def = customFields.find((f) => f.label === field);
          return (
            <FormField key={field} label={field} htmlFor={`f-${field}`} required>
              {def?.type === "dropdown" ? (
                <Select id={`f-${field}`} value={values[field] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}>
                  <option value="">Choose…</option>
                  {def.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`f-${field}`}
                  type={def?.type === "number" ? "number" : "text"}
                  value={values[field] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                />
              )}
            </FormField>
          );
        })}
        <div className="flex justify-end gap-2 mt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save and move</Button>
        </div>
      </form>
    </div>
  );
}
