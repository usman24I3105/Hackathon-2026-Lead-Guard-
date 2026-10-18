import { useCallback, useId, useRef, useState } from "react";
import type { SearchResult } from "../../api/types/shell";
import { Icon } from "../icons";
import { useDismiss } from "./useDismiss";

/** ARIA combobox: type, arrow through results, Enter to open, Escape to close. */
export function SearchBox({
  query,
  onQueryChange,
  results,
  loading,
  onSelect,
  autoFocus,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResult[] | undefined;
  loading: boolean;
  onSelect: (result: SearchResult) => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, wrapRef, close);

  const items = results ?? [];
  const showList = open && query.trim().length >= 2;

  function choose(r: SearchResult) {
    onSelect(r);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">Search contacts and leads</label>
      <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Search contacts and leads"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Enter" && active >= 0 && items[active]) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full h-10 pl-10 pr-3 rounded-control bg-neutral-bg border border-transparent text-sm text-text placeholder:text-text-muted focus-visible:bg-surface focus-visible:border-primary transition-colors"
      />
      <div aria-live="polite" className="sr-only">
        {showList && !loading ? `${items.length} result${items.length === 1 ? "" : "s"}` : ""}
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-full mt-1 z-40 max-h-80 overflow-y-auto rounded-card border border-border bg-surface shadow-lg py-1">
          {items.map((r, i) => (
            <li
              key={`${r.kind}-${r.id}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              onPointerEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer ${i === active ? "bg-primary-soft" : ""}`}
            >
              <div className="text-sm font-medium text-text truncate">{r.title}</div>
              <div className="text-xs text-text-muted truncate">{r.subtitle}</div>
            </li>
          ))}
          {!items.length && (
            <li role="presentation" className="px-3 py-2 text-sm text-text-muted">
              {loading ? "Searching…" : `No matches for "${query.trim()}"`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
