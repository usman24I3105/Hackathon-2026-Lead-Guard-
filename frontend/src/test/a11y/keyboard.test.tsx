import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SearchBox } from "../../components/shell/SearchBox";
import { WorkspaceSwitcher } from "../../components/shell/WorkspaceSwitcher";
import { OwnerViewToggle } from "../../features/dashboard/components/OwnerViewToggle";
import { useFocusTrap } from "../../lib/useFocusTrap";
import type { SearchResult } from "../../api/types/shell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(ui));
}

function key(target: EventTarget, k: string, opts: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

const RESULTS: SearchResult[] = [
  { kind: "contact", id: "c-1", title: "Marcus Webb", subtitle: "Contact" },
  { kind: "lead", id: "l-1", title: "Grace Holloway", subtitle: "Lead" },
];

describe("keyboard support", () => {
  it("search: arrow keys move the active option and Enter selects it", () => {
    const onSelect = vi.fn();
    function Harness() {
      const [q, setQ] = useState("ma");
      return <SearchBox query={q} onQueryChange={setQ} results={RESULTS} loading={false} onSelect={onSelect} />;
    }
    mount(<Harness />);
    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    act(() => input.focus());
    key(input, "ArrowDown");
    key(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toMatch(/opt-1$/);
    expect(container.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
    key(input, "Enter");
    expect(onSelect).toHaveBeenCalledWith(RESULTS[1]);
  });

  it("search: announces the result count politely", () => {
    mount(<SearchBox query="ma" onQueryChange={() => {}} results={RESULTS} loading={false} onSelect={() => {}} />);
    act(() => container.querySelector<HTMLInputElement>("input")!.focus());
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("2 results");
  });

  it("popover: Escape closes it and returns focus to its button", () => {
    mount(
      <WorkspaceSwitcher
        workspaces={[{ id: "w1", name: "LeadGuard Roofing", current: true }]}
        fallbackName="LeadGuard Roofing"
        onSwitch={() => {}}
      />
    );
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="true"]')!;
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const option = container.querySelector<HTMLButtonElement>("ul button")!;
    act(() => option.focus());
    key(window, "Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("focus trap: focuses inside, wraps Tab, handles Escape, restores focus", () => {
    const onEscape = vi.fn();
    function Dialog() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, true, onEscape);
      return (
        <div ref={ref}>
          <button>first</button>
          <button>last</button>
        </div>
      );
    }
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>opener</button>
          {open && <Dialog />}
        </>
      );
    }
    mount(<Harness />);
    const opener = [...container.querySelectorAll("button")].find((b) => b.textContent === "opener")!;
    act(() => opener.focus());
    act(() => opener.click());
    const [first, last] = [...container.querySelectorAll("button")].filter((b) => b.textContent !== "opener");
    expect(document.activeElement).toBe(first);

    act(() => last.focus());
    key(window, "Tab");
    expect(document.activeElement).toBe(first);
    key(window, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);

    key(window, "Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);

    act(() => opener.click()); // close
    expect(document.activeElement).toBe(opener);
  });

  it("owner view toggle is an operable, labelled switch", () => {
    const onChange = vi.fn();
    mount(<OwnerViewToggle checked onChange={onChange} />);
    const sw = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    const labelId = sw.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelId)?.textContent).toBe("Owner view");
    act(() => sw.click());
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
