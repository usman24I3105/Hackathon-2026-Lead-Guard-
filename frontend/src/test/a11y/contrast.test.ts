/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Reads the actual token values, so changing a color in index.css re-checks it here.
// (Read from disk: Vitest stubs CSS imports, `?raw` included, to an empty string.
// Vitest runs from the frontend/ root.)
const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf-8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const tokens: Record<string, string> = {};
for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2];
tokens.white = "#ffffff";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string) {
  const [a, b] = [luminance(tokens[fg]), luminance(tokens[bg])].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// [foreground, background] pairs that actually appear as text in the UI.
const TEXT_PAIRS: [string, string][] = [
  ["text", "bg"], ["text", "surface"], ["text", "neutral-bg"],
  ["text-muted", "bg"], ["text-muted", "surface"], ["text-muted", "neutral-bg"], ["text-muted", "primary-soft"],
  ["primary", "surface"], ["primary", "primary-soft"],
  ["white", "primary"], ["white", "primary-hover"],
  ["success-text", "surface"], ["success-text", "success-bg"],
  ["warning-text", "surface"], ["warning-text", "warning-bg"],
  ["danger-text", "surface"], ["danger-text", "danger-bg"],
  ["neutral-text", "surface"], ["neutral-text", "neutral-bg"],
  ["white", "warning-text"], // KPI attention badge
  ["white", "danger-text"], // danger button
];

// Non-text UI that must be distinguishable (WCAG 1.4.11): control outlines, focus ring, alert border.
const UI_PAIRS: [string, string][] = [
  ["border-strong", "surface"],
  ["primary", "surface"],
  ["primary", "bg"],
  ["danger", "surface"],
];

describe("color contrast (WCAG AA)", () => {
  it("parsed the tokens it needs", () => {
    for (const [fg, bg] of [...TEXT_PAIRS, ...UI_PAIRS]) {
      expect(tokens[fg], `missing token --${fg}`).toBeDefined();
      expect(tokens[bg], `missing token --${bg}`).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("UI %s on %s is at least 3:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
