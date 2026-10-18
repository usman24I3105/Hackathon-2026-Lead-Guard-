import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles/fonts.css";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./state/AuthContext";
import { ToastProvider } from "./state/ToastContext";
import { ReauthProvider } from "./features/auth/reauth/ReauthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { queryClient } from "./api/queryClient";
import { ensureStore } from "./state/useStore";

async function main() {
  await ensureStore();

  if (import.meta.env.DEV) {
    const { ReactQueryDevtools } = await import("@tanstack/react-query-devtools");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AuthProvider>
                <ReauthProvider>
                  <ToastProvider>
                    <App />
                  </ToastProvider>
                </ReauthProvider>
              </AuthProvider>
            </BrowserRouter>
            <ReactQueryDevtools initialIsOpen={false} />
          </QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>
    );
    return;
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ReauthProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </ReauthProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

void main();
