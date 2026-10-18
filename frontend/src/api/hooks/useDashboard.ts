import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { store } from "../../state/useStore";
import type { DashboardScope } from "../types/dashboard";

export const dashboardKey = (scope: DashboardScope) => ["dashboard", scope] as const;

export function useDashboard(scope: DashboardScope) {
  const queryClient = useQueryClient();

  // Any data change (store update in mock mode, SSE event in real mode)
  // means the dashboard may be stale — refetch rather than patch locally,
  // so permission masking always comes from the server.
  useEffect(() => {
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    const offState = store.subscribe(invalidate);
    const offEvents = store.onEvent(invalidate);
    return () => {
      offState();
      offEvents();
    };
  }, [queryClient]);

  return useQuery({
    queryKey: dashboardKey(scope),
    queryFn: () => store.getDashboard(scope),
    placeholderData: (previous) => previous,
  });
}
