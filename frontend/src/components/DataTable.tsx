import { useState, type ReactNode } from "react";
import { EmptyState, Skeleton } from "./Primitives";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
  sortDirection?: "ascending" | "descending" | "none";
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
      <div className="data-table-card" aria-label="Loading results">
        <table className="w-full text-sm"><thead><tr>{columns.map((column) => <th key={column.key} scope="col" style={{ width: column.width }}><Skeleton className="h-3 w-20" /></th>)}</tr></thead>
          <tbody>{Array.from({ length: 6 }).map((_, index) => <tr key={index}>{columns.map((column) => <td key={column.key}><Skeleton className="h-4 w-3/4" /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }

  if (!rows.length) {
    return <div className="data-table-card"><EmptyState title={emptyTitle} body={emptyBody} /></div>;
  }

  return (
    <div className="data-table-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" aria-sort={c.sortDirection ?? "none"} className={`${c.align === "right" ? "text-right" : "text-left"}`} style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
              <tr key={row.id} className="hover:bg-paper/60">
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={c.align === "right" ? "text-right tabular-nums" : "text-left"}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="data-table-footer flex items-center justify-between border-t border-border px-3 py-3 text-sm text-ink-2" aria-live="polite">
          <span>Showing {current * pageSize + 1}–{Math.min(rows.length, (current + 1) * pageSize)} of {rows.length}</span>
          {rows.length > pageSize && (
          <div className="flex gap-2">
            <button
              className="px-3 h-9 rounded-card border border-line disabled:opacity-40"
              disabled={current === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              className="px-3 h-9 rounded-card border border-line disabled:opacity-40"
              disabled={current >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
          )}
      </div>
    </div>
  );
}
