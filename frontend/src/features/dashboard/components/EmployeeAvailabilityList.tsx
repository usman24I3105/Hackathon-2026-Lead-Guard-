import type { EmployeeAvailability } from "../../../api/types/dashboard";
import { Avatar } from "../../../components/Avatar";
import { StatusPill } from "../../../components/StatusPill";

export function EmployeeAvailabilityList({ employees }: { employees: EmployeeAvailability[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {employees.map((e) => {
        const atCapacity = e.openLeads >= e.capacity;
        return (
          <li key={e.userId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Avatar name={e.name} color={e.avatarColor} size={32} />
            <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">{e.name}</span>
            <StatusPill status={e.availability} />
            <span
              className="font-mono-tab text-sm w-14 text-right"
              style={{ color: atCapacity ? "var(--danger-text)" : "var(--text-muted)" }}
              aria-label={`${e.openLeads} of ${e.capacity} open leads${atCapacity ? ", at capacity" : ""}`}
            >
              {e.openLeads} / {e.capacity}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
