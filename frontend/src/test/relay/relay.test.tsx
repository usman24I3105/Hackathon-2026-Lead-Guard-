import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../state/AuthContext";
import { ToastProvider } from "../../state/ToastContext";
import { ensureStore, store } from "../../state/useStore";
import { setSession } from "../../lib/session";
import { AvailabilityMenu, RelayErrorState, RelayLoadingState } from "../../features/relay/RelayUi";
import { PreviewBanner } from "../../components/shell/PreviewBanner";
import { ActivityPopover } from "../../components/shell/ActivityPopover";
import { UserMenu } from "../../components/shell/UserMenu";
import { Button } from "../../components/Primitives";
import Relay from "../../features/relay/Relay";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(ui));
}

function key(target: EventTarget, k: string) {
  act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
}

function renderRelay() {
  mount(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider><Relay /></ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeAll(async () => {
  await ensureStore();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  act(() => setSession(null));
  window.localStorage.removeItem("leadguard-preview-banner-dismissed");
});

describe("Live Relay interactions", () => {
  it("queue tabs follow the arrow-key pattern and announce selection", () => {
    renderRelay();
    const attention = container.querySelector<HTMLButtonElement>('[role="tab"][id="relay-tab-attention"]')!;
    const acknowledged = container.querySelector<HTMLButtonElement>('[role="tab"][id="relay-tab-acknowledged"]')!;
    act(() => attention.focus());
    key(attention, "ArrowRight");
    expect(acknowledged.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(acknowledged);
    key(acknowledged, "Home");
    expect(attention.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(attention);
  });

  it("availability menu supports arrow-key navigation and selected state", () => {
    mount(<AvailabilityMenu memberId="user-test" availability="available" />);
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    act(() => trigger.click());
    const menu = document.body.querySelector<HTMLDivElement>('[role="menu"][aria-label="Set your availability"]')!;
    const items = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(items).toHaveLength(3);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
    expect(menu.closest(".relay-roster-list")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[0]);
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    key(items[0], "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    expect(items[1].textContent).toContain("Busy");
    key(window, "Escape");
    expect(document.body.querySelector('[aria-label="Set your availability"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("availability menu closes on an outside pointer without joining the roster flow", () => {
    mount(<div className="relay-roster-list"><AvailabilityMenu memberId="user-test" availability="available" /></div>);
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    act(() => trigger.click());
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it("lead timeline opens from the lead row and closes with Escape", () => {
    renderRelay();
    expect(container.querySelector('[role="table"][aria-label="Lead queue"]')).not.toBeNull();
    expect(container.querySelector('[role="columnheader"]')?.textContent).toBe("Lead");
    const lead = store.getState().leads.find((item) => item.status === "waiting");
    expect(lead).toBeDefined();
    const opener = container.querySelector<HTMLButtonElement>('[aria-label="Open timeline for ' + lead!.name + '"]')!;
    act(() => opener.click());
    expect(container.querySelector('[role="dialog"][aria-label="Timeline for ' + lead!.name + '"]')).not.toBeNull();
    key(window, "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("acknowledges a lead, selects the acknowledged view, and shows success feedback", () => {
    setSession({ userId: "u-imran", name: "Imran Qureshi", email: "imran@example.test", role: "User", workspace: "LeadGuard Roofing" });
    renderRelay();
    const acknowledge = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Acknowledge");
    expect(acknowledge).toBeDefined();
    act(() => acknowledge!.click());
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("relay-tab-acknowledged");
    const successButton = container.querySelector<HTMLButtonElement>('.relay-ack-button[data-state="success"]');
    expect(successButton?.textContent).toContain("Acknowledged");
    expect(successButton?.disabled).toBe(true);
  });
});

describe("Shared action buttons", () => {
  it("exposes variants and the compact table size", () => {
    mount(
      <>
        <Button variant="primary" size="md">Primary</Button>
        <Button variant="secondary" size="sm">Secondary</Button>
        <Button variant="ghost" size="lg">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="danger-ghost">Inline danger</Button>
        <Button variant="ghost" iconOnly aria-label="More actions" title="More actions">⋯</Button>
      </>
    );
    expect(container.querySelector(".ui-button--primary.ui-button--md")).not.toBeNull();
    expect(container.querySelector(".ui-button--secondary.ui-button--sm")).not.toBeNull();
    expect(container.querySelector(".ui-button--ghost.ui-button--lg")).not.toBeNull();
    expect(container.querySelector(".ui-button--danger")).not.toBeNull();
    expect(container.querySelector(".ui-button--danger-ghost")).not.toBeNull();
    const iconButton = container.querySelector<HTMLButtonElement>(".ui-button--icon-only");
    expect(iconButton?.getAttribute("aria-label")).toBe("More actions");
    expect(iconButton?.title).toBe("More actions");
  });

  it("keeps the label in place while loading and blocks repeat activation", () => {
    const onClick = vi.fn();
    mount(<Button loading onClick={onClick}>Save changes</Button>);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("data-state")).toBe("loading");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Save changes");
    expect(button.querySelector(".ui-button-spinner")).not.toBeNull();
    act(() => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps aria-disabled controls focusable while preventing activation", () => {
    const onClick = vi.fn();
    mount(<Button aria-disabled="true" focusableDisabled onClick={onClick}>Unavailable</Button>);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    act(() => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Relay states and shell notice", () => {
  it("renders loading and recoverable error states", () => {
    const retry = vi.fn();
    mount(<><RelayLoadingState /><RelayErrorState onRetry={retry} /></>);
    expect(container.querySelector('[role="status"][aria-label="Loading live relay"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  });

  it("dismisses the sample-data notice and remembers that choice", () => {
    mount(<PreviewBanner visible />);
    expect(container.textContent).toContain("sample data for frontend review");
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss preview workspace notice"]')!.click());
    expect(container.querySelector(".preview-banner")).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<PreviewBanner visible />));
    expect(container.querySelector(".preview-banner")).toBeNull();
  });

  it("opens the notification panel, marks activity read, and opens the audit log", () => {
    const onViewed = vi.fn();
    const onViewAudit = vi.fn();
    mount(
      <ActivityPopover
        audit={[{ id: "a-1", type: "lead.created", userName: "Sara Malik", at: new Date().toISOString() }]}
        unreadCount={1}
        onViewed={onViewed}
        onViewAudit={onViewAudit}
      />
    );
    act(() => container.querySelector<HTMLButtonElement>('[aria-haspopup="true"]')!.click());
    expect(container.querySelector('[role="region"][aria-label="Recent activity"]')).not.toBeNull();
    expect(onViewed).toHaveBeenCalledOnce();
    act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("View audit log"))!.click());
    expect(onViewAudit).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="region"][aria-label="Recent activity"]')).toBeNull();
  });

  it("account menu exposes profile, preferences, and sign out", () => {
    const onLogout = vi.fn();
    mount(
      <MemoryRouter>
        <UserMenu user={{ name: "Imran Qureshi", role: "User" }} onLogout={onLogout} />
      </MemoryRouter>
    );
    act(() => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click());
    expect(document.body.textContent).toContain("Profile");
    expect(document.body.querySelector('a[href="/settings"]')?.textContent).toContain("Preferences");
    expect(document.body.querySelector('[role="menu"]')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(document.body.querySelector('a[href="/settings"]'));
    act(() => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Sign out"))!.click());
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("sidebar account menu keeps a collapsed trigger labeled and opens outside sidebar flow", () => {
    mount(
      <MemoryRouter>
        <UserMenu user={{ name: "Imran Qureshi", role: "Manager" }} onLogout={() => undefined} placement="sidebar" collapsed />
      </MemoryRouter>
    );
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    expect(trigger.title).toContain("Imran Qureshi");
    act(() => trigger.click());
    const panel = document.body.querySelector<HTMLDivElement>('[role="menu"][aria-label="Account menu"]')!;
    expect(panel.parentElement).toBe(document.body);
    expect(panel.style.position).toBe("fixed");
    expect(panel.textContent).toContain("Manager");
  });
});
