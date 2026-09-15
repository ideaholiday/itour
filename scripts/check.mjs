#!/usr/bin/env node
// One quiet verification command for humans and AI agents.
// Prints one line per passing step; on failure prints only the useful tail.
//
//   npm run check                 # docs + unit + integration + frontend build
//   npm run check -- unit         # only the named steps (docs, test-db, unit, integration, frontend, next)

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = {
  docs: { cwd: ".", cmd: "node", args: ["scripts/check-agent-docs.mjs"] },
  "test-db": { cwd: "backend", cmd: "node", args: ["scripts/prepare-test-db.js"] },
  unit: { cwd: "backend", cmd: "node", args: ["--test", "--test-reporter=dot", "test/**/*.test.js"] },
  integration: { cwd: "backend", cmd: "node", args: ["--test", "--test-reporter=dot", "integration/**/*.test.js"] },
  frontend: { cwd: "frontend", cmd: "npm", args: ["run", "build"] },
  next: { cwd: ".", cmd: "npm", args: ["run", "build"], optIn: true },
};

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !steps[name]);
if (unknown.length) {
  console.error(`Unknown step: ${unknown.join(", ")}. Choose from: ${Object.keys(steps).join(", ")}`);
  process.exit(2);
}
const selected = requested.length ? requested : Object.keys(steps).filter((name) => !steps[name].optIn);

function run({ cwd, cmd, args }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: join(root, cwd), env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

// Keep failure reports short: drop stack frames and dot-progress lines, keep the tail.
function summarize(output) {
  const failedAt = output.indexOf("Failed tests:");
  const body = failedAt >= 0 ? output.slice(failedAt) : output;
  const lines = body.split("\n").filter((line) => !/^\s+at\s/.test(line) && !/^[.X]+$/.test(line.trim()));
  return lines.slice(-80).join("\n");
}

let failed = 0;
for (const name of selected) {
  const started = Date.now();
  const { code, output } = await run(steps[name]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (code === 0) {
    console.log(`✔ ${name} (${seconds}s)`);
  } else {
    failed += 1;
    console.log(`✖ ${name} (${seconds}s, exit ${code})\n${summarize(output)}\n`);
  }
}

console.log(failed ? `\n${failed} of ${selected.length} steps failed` : `\nAll ${selected.length} steps passed`);
process.exit(failed ? 1 : 0);
