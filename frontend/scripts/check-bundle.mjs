#!/usr/bin/env node
// Fails the build if mock fixtures, seed data, or demo-looking credentials
// ended up in the production bundle. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = join(import.meta.dirname, "..", "..", "backend", "public");

// Concrete markers from src/mock/**, not the generic word "mock" — that word
// also appears in the (legitimate, shipped) adapter-selection code itself.
const FORBIDDEN = [
  "Imran Qureshi",
  "Dana Cole",
  "Sara Malik",
  "Owais Tariq",
  "Grace Holloway",
  "Devon Pierce",
  "Wendy Torres",
  "Harold Benning",
  "freshLead",
  "u-imran",
  "u-dana",
  "u-sara",
  "u-owais",
  "wa_live_",
  "sk_live_",
  "tg_bot_",
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|css|html)$/.test(entry)) out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(DIST_DIR);
} catch {
  console.error(`check-bundle: no build output found at ${DIST_DIR}. Run "npm run build" first.`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const content = readFileSync(file, "utf-8");
  for (const needle of FORBIDDEN) {
    if (content.includes(needle)) {
      console.error(`check-bundle: found "${needle}" in ${file}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    "\nMock/seed data leaked into the production bundle. Make sure VITE_API_MODE isn't set to " +
      '"mock" for this build, and that api/adapter.ts still gates the mock/ import behind ' +
      "import.meta.env.DEV / VITE_API_MODE."
  );
  process.exit(1);
}

console.log(`check-bundle: clean (${files.length} files scanned in ${DIST_DIR}).`);
