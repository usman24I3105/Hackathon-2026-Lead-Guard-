/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf-8");

function parseTheme(pattern: RegExp) {
  const block = css.match(pattern)?.[1] ?? "";
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

const themes = {
  light: parseTheme(/:root\s*\{([\s\S]*?)\}/),
  dark: parseTheme(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/),
};

type Color = { r: number; g: number; b: number; a: number };

function color(token: string, tokens: Record<string, string>, seen = new Set<string>()): Color {
  if (seen.has(token)) throw new Error(`Circular color token: ${token}`);
  seen.add(token);
  let value = tokens[token];
  if (!value) throw new Error(`Missing color token --${token}`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias) return color(alias[1], tokens, seen);
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) throw new Error(`Unsupported color value for --${token}: ${value}`);
  const parts = rgba[1].replace(/\s*\/\s*/, ",").split(/[\s,]+/).filter(Boolean).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function composite(foreground: Color, background: Color): Color {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function luminance(value: Color) {
  const linear = [value.r, value.g, value.b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function ratio(foreground: Color, background: Color) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

function blendedToken(foregroundToken: string, backgroundToken: string, tokens: Record<string, string>) {
  return composite(color(foregroundToken, tokens), color(backgroundToken, tokens));
}

describe.each(Object.entries(themes))("%s theme contrast (WCAG AA)", (_theme, tokens) => {
  it("defines the shared action and status tokens", () => {
    for (const name of ["bg", "surface", "surface-raised", "text", "text-muted", "border-strong", "action", "action-hover", "action-active", "action-soft", "action-ring", "on-action", "success-text", "success-bg", "warning-text", "warning-bg", "danger-text", "danger-bg", "neutral-text", "neutral-bg"]) {
      expect(tokens[name], `missing token --${name}`).toBeDefined();
    }
  });

  it.each([["text", "bg"], ["text", "surface"], ["text-muted", "bg"], ["text-muted", "surface"], ["success-text", "success-bg"], ["warning-text", "warning-bg"], ["danger-text", "danger-bg"], ["neutral-text", "neutral-bg"]])("text --%s on --%s is at least 4.5:1", (foreground, background) => {
    expect(ratio(color(foreground, tokens), color(background, tokens))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["action", "action-hover", "action-active"])("primary label on --%s is at least 4.5:1", (background) => {
    expect(ratio(color("on-action", tokens), color(background, tokens))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps action and muted text legible on the tinted action surface", () => {
    const surface = color("surface", tokens);
    for (const tint of ["action-soft", "action-soft-hover"]) {
      const soft = composite(color(tint, tokens), surface);
      expect(ratio(color("action", tokens), soft)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color("text-muted", tokens), soft)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["surface", "bg"])("action controls distinguish from --%s by at least 3:1", (background) => {
    expect(ratio(color("action", tokens), color(background, tokens))).toBeGreaterThanOrEqual(3);
  });

  it.each(["surface", "bg"])("the focus ring distinguishes from --%s by at least 3:1", (background) => {
    expect(ratio(blendedToken("action-ring", background, tokens), color(background, tokens))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the strong border visible against the surface", () => {
    expect(ratio(color("border-strong", tokens), color("surface", tokens))).toBeGreaterThanOrEqual(3);
  });
});
