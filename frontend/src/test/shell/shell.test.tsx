import { beforeAll, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ensureStore, store } from "../../state/useStore";
import { BOTTOM_NAV_PATHS, NAV_ITEMS, visibleNav } from "../../components/shell/nav";
import { SearchBox } from "../../components/shell/SearchBox";
import { BottomNav } from "../../components/shell/BottomNav";
import { StatusPill } from "../../components/StatusPill";

beforeAll(async () => {
  await ensureStore();
});

describe("navigation", () => {
  it("groups every product module into the application navigation", () => {
    expect(NAV_ITEMS.map((n) => n.label)).toEqual([
      "Dashboard", "Live relay", "Lead records", "Recovery queue", "Contacts", "Companies", "Opportunities",
      "Pipeline board", "Conversations", "Appointments", "Payments", "Team & availability", "Audit log",
      "Integrations", "Workspace settings",
    ]);
    expect(NAV_ITEMS.find((n) => n.label === "Live relay")?.to).toBe("/relay");
  });

  it("only links to routes that exist (no dead links)", () => {
    const routes = ["/dashboard", "/relay", "/leads", "/recovery", "/pipeline", "/contacts", "/companies", "/opportunities", "/conversations", "/appointments", "/payments", "/team", "/integrations", "/audit", "/settings"];
    for (const item of NAV_ITEMS) expect(routes).toContain(item.to);
  });

  it("hides links a role can't use, but keeps Settings for everyone", () => {
    const user = visibleNav("User").map((n) => n.to);
    expect(user).not.toContain("/dashboard");
    expect(user).not.toContain("/audit");
    expect(user).toContain("/settings");
    expect(visibleNav("Owner")).toHaveLength(NAV_ITEMS.length);
  });

  it("bottom nav has the spec's four destinations plus Menu", () => {
    expect(BOTTOM_NAV_PATHS).toEqual(["/dashboard", "/relay", "/pipeline", "/contacts"]);
    const items = NAV_ITEMS.filter((n) => BOTTOM_NAV_PATHS.includes(n.to));
    const html = renderToString(
      <MemoryRouter>
        <BottomNav items={items} menuOpen={false} onOpenMenu={() => {}} />
      </MemoryRouter>
    );
    for (const label of ["Dashboard", "Leads", "Pipeline", "Contacts", "Menu"]) expect(html).toContain(label);
  });
});

describe("search", () => {
  it("finds contacts by name and by phone digits", async () => {
    const byName = await store.search("marcus");
    expect(byName.some((r) => r.kind === "contact" && r.title === "Marcus Webb")).toBe(true);
    const byPhone = await store.search("0101");
    expect(byPhone.some((r) => r.title === "Marcus Webb")).toBe(true);
  });

  it("ignores queries shorter than 2 characters", async () => {
    expect(await store.search("m")).toEqual([]);
  });

  it("SearchBox is an accessible combobox with a label", () => {
    const html = renderToString(<SearchBox query="" onQueryChange={() => {}} results={[]} loading={false} onSelect={() => {}} />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain("Search contacts and leads");
  });

  it("returns workspaces with exactly one current", async () => {
    const ws = await store.listWorkspaces();
    expect(ws.filter((w) => w.current)).toHaveLength(1);
  });
});

describe("status pill colors follow the spec", () => {
  it("Busy is danger, On leave is warning", () => {
    expect(renderToString(<StatusPill status="busy" />)).toContain("var(--danger-text)");
    expect(renderToString(<StatusPill status="leave" />)).toContain("var(--warning-text)");
  });
});
