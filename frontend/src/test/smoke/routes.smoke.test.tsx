import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../state/AuthContext";
import { ToastProvider } from "../../state/ToastContext";
import { ReauthProvider } from "../../features/auth/reauth/ReauthProvider";
import { queryClient } from "../../api/queryClient";
import { ensureStore } from "../../state/useStore";
import { setSession } from "../../lib/session";
import App from "../../App";

// Temporary, throwaway verification that every route renders without
// throwing — this is what would have caught the `getState` `this`-binding
// bug and the Proxy/adapter refactor regressions before they shipped.
describe("route smoke test", () => {
  it("renders every top-level route without throwing", async () => {
    await ensureStore();
    setSession({ userId: "u-imran", name: "Imran Qureshi", email: "x@x.com", role: "User", workspace: "Test Co" });

    const routes = [
      "/login",
      "/signup",
      "/relay",
      "/pipeline",
      "/contacts",
      "/dashboard",
      "/recovery",
      "/audit",
      "/integrations",
      "/settings",
      "/contacts/c-001",
      "/f/demo",
    ];

    for (const route of routes) {
      const render = () =>
        renderToString(
          <MemoryRouter initialEntries={[route]}>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <ReauthProvider>
                  <ToastProvider>
                    <App />
                  </ToastProvider>
                </ReauthProvider>
              </AuthProvider>
            </QueryClientProvider>
          </MemoryRouter>
        );
      expect(render, `route ${route} should render without throwing`).not.toThrow();
    }
  });
});
