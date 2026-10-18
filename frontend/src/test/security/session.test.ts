import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getSession, onSessionClear, setSession, subscribeSession } from "../../lib/session";
import { queryClient } from "../../api/queryClient";

function fakeLocation(pathname: string, search = "") {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { pathname, search, assign },
  });
  return assign;
}

describe("session store", () => {
  beforeEach(() => {
    setSession(null);
  });

  it("starts with no session", () => {
    expect(getSession()).toBeNull();
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    setSession({ userId: "u-1", name: "Test User", email: "t@example.com", role: "Owner", workspace: "Acme" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSession()?.userId).toBe("u-1");
    unsubscribe();
    setSession(null);
    expect(listener).toHaveBeenCalledTimes(1); // no call after unsubscribe
  });

  it("clearSession clears the session, runs clear hooks, and clears the query cache", () => {
    setSession({ userId: "u-1", name: "Test User", email: "t@example.com", role: "Owner", workspace: "Acme" });
    queryClient.setQueryData(["probe"], { ok: true });

    const hook = vi.fn();
    const unregister = onSessionClear(hook);
    const assign = fakeLocation("/relay");

    clearSession();

    expect(getSession()).toBeNull();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["probe"])).toBeUndefined();
    expect(assign).toHaveBeenCalledWith("/login");

    unregister();
  });

  it("clearSession encodes a safe returnTo but drops an unsafe one", () => {
    setSession({ userId: "u-1", name: "Test User", email: "t@example.com", role: "Owner", workspace: "Acme" });
    const assign = fakeLocation("/pipeline");
    clearSession({ returnTo: "/pipeline" });
    expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fpipeline");

    setSession({ userId: "u-1", name: "Test User", email: "t@example.com", role: "Owner", workspace: "Acme" });
    const assign2 = fakeLocation("/pipeline");
    clearSession({ returnTo: "//evil.com" });
    expect(assign2).toHaveBeenCalledWith("/login");
  });

  it("clearSession does not re-navigate if already on the target", () => {
    setSession({ userId: "u-1", name: "Test User", email: "t@example.com", role: "Owner", workspace: "Acme" });
    const assign = fakeLocation("/login");
    clearSession();
    expect(assign).not.toHaveBeenCalled();
  });
});
