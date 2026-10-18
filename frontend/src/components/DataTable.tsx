import { useState, type ReactNode } from "react";
import { EmptyState, Skeleton } from "./Primitives";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyTitle,
  emptyBody,
  pageSize = 25,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle: string;
  emptyBody?: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  const slice = rows.slice(current * pageSize, current * pageSize + pageSize);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} className={`py-2.5 px-3 font-medium text-ink-2 text-xs uppercase tracking-wide ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
            <tr key={row.id} className="border-b border-line/70 hover:bg-paper/60">
              {columns.map((c) => (
                <td key={c.key} className={`py-2.5 px-3 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between px-3 py-3 text-sm text-ink-2">
          <span>
            {current * pageSize + 1}–{Math.min(rows.length, (current + 1) * pageSize)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 h-9 rounded-[10px] border border-line disabled:opacity-40"
              disabled={current === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              className="px-3 h-9 rounded-[10px] border border-line disabled:opacity-40"
              disabled={current >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
