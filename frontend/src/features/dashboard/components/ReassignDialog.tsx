import { useRef, useState } from "react";
import { useFocusTrap } from "../../../lib/useFocusTrap";
import type { EmployeeAvailability } from "../../../api/types/dashboard";
import { Button, FormField, Select } from "../../../components/Primitives";

export function ReassignDialog({
  leadName,
  currentOwnerId,
  employees,
  onConfirm,
  onCancel,
}: {
  leadName: string;
  currentOwnerId: string;
  employees: EmployeeAvailability[];
  onConfirm: (userId: string) => void;
  onCancel: () => void;
}) {
  const candidates = employees.filter((e) => e.userId !== currentOwnerId);
  const [selected, setSelected] = useState(
    () => candidates.find((e) => e.availability === "available")?.userId ?? candidates[0]?.userId ?? ""
  );
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reassign-title">
      <div ref={ref} className="bg-surface rounded-card border border-border shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <h2 id="reassign-title" className="text-lg font-semibold">Reassign {leadName}</h2>
        <FormField label="New owner" htmlFor="reassign-owner">
          <Select id="reassign-owner" data-autofocus value={selected} onChange={(e) => setSelected(e.target.value)}>
            {candidates.map((e) => (
              <option key={e.userId} value={e.userId}>
                {e.name} — {e.availability === "leave" ? "on leave" : e.availability} ({e.openLeads}/{e.capacity})
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={!selected} onClick={() => onConfirm(selected)}>Reassign</Button>
        </div>
      </div>
    </div>
  );
}
