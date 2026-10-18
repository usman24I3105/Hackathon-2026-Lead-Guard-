import { QueryClient } from "@tanstack/react-query";

// No persistence plugin is wired up anywhere — query cache lives in memory
// only and disappears on reload, same as session state. Devtools are
// imported lazily and only in DEV further down (see main.tsx).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});
