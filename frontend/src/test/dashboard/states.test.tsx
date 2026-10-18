import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Widget } from "../../features/dashboard/components/Widget";
import { ensureStore } from "../../state/useStore";
import { setSession } from "../../lib/session";
import type { StoreLike } from "../../state/storeTypes";
import { AuthProvider } from "../../state/AuthContext";
import { ToastProvider } from "../../state/ToastContext";
import Dashboard from "../../features/dashboard/Dashboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let instance: StoreLike;

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(ui));
}

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

beforeAll(async () => {
  instance = await ensureStore();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("Widget states", () => {
  it("loading: busy, shows skeleton, hides content", () => {
    mount(
      <Widget title="Live activity" status="loading" skeleton={<div data-testid="sk" />}>
        <p>real content</p>
      </Widget>
    );
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("[data-testid=sk]")).not.toBeNull();
    expect(container.textContent).not.toContain("real content");
  });

  it("error: shows a message and Retry calls onRetry", () => {
    const onRetry = vi.fn();
    mount(<Widget title="Live activity" status="error" onRetry={onRetry} />);
    expect(container.textContent).toContain("We couldn't load live activity.");
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Retry")!;
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("empty: explains what will appear and hides the header action", () => {
    mount(
      <Widget title="Recovery queue" isEmpty emptyTitle="Nothing needs rescue." action={<span>3 overdue</span>}>
        <p>table</p>
      </Widget>
    );
    expect(container.textContent).toContain("Nothing needs rescue.");
    expect(container.textContent).not.toContain("3 overdue");
    expect(container.textContent).not.toContain("table");
  });
});

describe("Dashboard error state", () => {
  it("shows an error with Retry in every widget when the request fails, and Retry refetches", async () => {
    setSession({ userId: "u-owais", name: "Owais Tariq", email: "o@x.com", role: "Owner", workspace: "Test" });
    const spy = vi.spyOn(instance, "getDashboard").mockRejectedValue(new Error("boom"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mount(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthProvider>
            <ToastProvider>
              <Dashboard />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await flush();

    const retries = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Retry");
    // Key numbers, availability, needs-attention, activity, pipeline, recovery, appointments, integrations.
    expect(retries.length).toBe(8);
    expect(container.textContent).not.toContain("Error:");

    const callsBefore = spy.mock.calls.length;
    await act(async () => retries[0].click());
    await flush();
    expect(spy.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
