import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { store } from "../../state/useStore";

export function useWorkspaces() {
  return useQuery({ queryKey: ["workspaces"], queryFn: () => store.listWorkspaces(), staleTime: 5 * 60_000 });
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useSearch(query: string) {
  const q = useDebounced(query.trim(), 200);
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => store.search(q),
    enabled: q.length >= 2,
    placeholderData: (previous) => previous,
  });
}
