import { beforeAll, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { buildDashboard } from "../../mock/dashboard";
import { ensureStore, store } from "../../state/useStore";
import type { Session } from "../../lib/session";
import type { DashboardData } from "../../api/types/dashboard";
import { KpiCard } from "../../features/dashboard/components/KpiCard";
import { PipelineBarChart } from "../../features/dashboard/components/PipelineBarChart";
import { StatusPill } from "../../components/StatusPill";
import { EmployeeAvailabilityList } from "../../features/dashboard/components/EmployeeAvailabilityList";
import { OwnerViewToggle } from "../../features/dashboard/components/OwnerViewToggle";

const owner: Session = { userId: "u-owais", name: "Owais Tariq", email: "o@x.com", role: "Owner", workspace: "Test" };
const user: Session = { userId: "u-imran", name: "Imran Qureshi", email: "i@x.com", role: "User", workspace: "Test" };

let team: DashboardData;
let ownerPersonal: DashboardData;
let regular: DashboardData;

beforeAll(async () => {
  await ensureStore();
  const state = store.getState();
  team = buildDashboard(state, owner, "team");
  ownerPersonal = buildDashboard(state, owner, "personal");
  regular = buildDashboard(state, user, "team"); // asks for team, must get personal
});

const kpi = (d: DashboardData, id: string) => d.kpis.find((k) => k.id === id)!;

describe("dashboard data contract", () => {
  it("never gives a regular user the team scope, even if requested", () => {
    expect(regular.scope).toBe("personal");
  });

  it("masks money for regular users and for the owner's personal preview", () => {
    for (const d of [regular, ownerPersonal]) {
      expect(kpi(d, "collected").masked).toBe(true);
      expect(kpi(d, "collected").value).toBeNull();
      expect(d.pipeline.visible).toBe(false);
      expect(d.pipeline.stages.every((s) => s.valueCents === null)).toBe(true);
    }
  });

  it("shows money to the owner in team view", () => {
    expect(kpi(team, "collected").masked).toBe(false);
    expect(team.pipeline.visible).toBe(true);
    expect(team.pipeline.stages.some((s) => (s.valueCents ?? 0) > 0)).toBe(true);
  });

  it("excludes closed stages from open pipeline value", () => {
    expect(team.pipeline.stages.map((s) => s.stageName)).not.toContain("Won");
    expect(team.pipeline.stages.map((s) => s.stageName)).not.toContain("Lost");
  });

  it("KPI counts equal their drill-down list lengths", () => {
    expect(kpi(team, "newLeads").value).toBe(team.lists.newLeads.length);
    expect(kpi(team, "escalations").value).toBe(team.lists.escalations.length);
    expect(kpi(team, "recoveryQueue").value).toBe(team.recoveryQueue.length);
  });

  it("personal scope only includes the viewer's own leads", () => {
    const ownerNames = new Set(regular.lists.newLeads.map((l) => l.ownerName));
    expect([...ownerNames].every((n) => n === user.name)).toBe(true);
  });

  it("reports an open-lead ratio for every teammate", () => {
    expect(team.team.length).toBeGreaterThan(0);
    for (const e of team.team) {
      expect(e.capacity).toBeGreaterThan(0);
      expect(e.openLeads).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("dashboard components render from props alone", () => {
  it("KpiCard renders a masked value without leaking the number", () => {
    const html = renderToString(<KpiCard metric={{ ...kpi(regular, "collected") }} />);
    expect(html).toContain("•••");
    expect(html).toContain("requires permission");
  });

  it("KpiCard shows trend direction in text, not color alone", () => {
    const html = renderToString(
      <KpiCard metric={{ id: "newLeads", label: "New leads today", value: 6, unit: "count", definition: "d", trend: { percent: 20, direction: "up", upIsGood: true, comparedTo: "yesterday" } }} />
    );
    expect(html).toContain("20%");
    expect(html).toContain("higher");
  });

  it("PipelineBarChart hides dollar values when not visible", () => {
    const html = renderToString(<PipelineBarChart stages={[{ stageId: "s", stageName: "Quoted", valueCents: null, dealCount: 2 }]} visible={false} />);
    expect(html).toContain("•••");
    expect(html).toContain("2 deals");
    expect(html).not.toContain("$");
  });

  it("StatusPill always includes a text label", () => {
    for (const s of ["available", "busy", "leave", "offline"] as const) {
      expect(renderToString(<StatusPill status={s} />)).toMatch(/Available|Busy|On leave|Offline/);
    }
  });

  it("EmployeeAvailabilityList labels the ratio for screen readers", () => {
    const html = renderToString(
      <EmployeeAvailabilityList employees={[{ userId: "a", name: "Ana Diaz", avatarColor: "var(--primary)", availability: "busy", openLeads: 7, capacity: 10 }]} />
    );
    expect(html).toContain("7 of 10 open leads");
  });

  it("OwnerViewToggle uses the corrected description copy", () => {
    const html = renderToString(<OwnerViewToggle checked onChange={() => {}} />);
    expect(html).toContain("Regular users see only their own leads and response times.");
    expect(html).toContain('role="switch"');
  });
});
