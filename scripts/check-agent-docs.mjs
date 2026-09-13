#!/usr/bin/env node
// Keeps the AI-agent docs small, linked and true to the code.
// Runs in CI and as `npm run check -- docs`. Exits 1 with one line per problem.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const problems = [];
const fail = (message) => problems.push(message);

const AGENTS_MAX_LINES = 150;
const DOC_MAX_BYTES = 40_000;
const PLAYBOOK_MAX_LINES = 40;
const listMarkdown = (dir) => readdirSync(join(root, dir)).filter((name) => name.endsWith(".md")).map((name) => `${dir}/${name}`);
const playbooks = listMarkdown("docs/playbooks");
const docs = [...listMarkdown("docs"), ...playbooks];

// 1. AGENTS.md is loaded into every agent session, so it must stay short.
const agentLines = read("AGENTS.md").split("\n").length;
if (agentLines > AGENTS_MAX_LINES) fail(`AGENTS.md has ${agentLines} lines (max ${AGENTS_MAX_LINES}); move detail into docs/`);

// 2. Claude and Gemini only see AGENTS.md through these imports.
for (const [file, line] of [["CLAUDE.md", "@AGENTS.md"], ["GEMINI.md", "@./AGENTS.md"]]) {
  if (!existsSync(join(root, file)) || !read(file).split("\n").includes(line)) fail(`${file} must contain a line "${line}"`);
}

// 3. Every doc opens with a summary so agents can decide without reading it all.
for (const doc of docs) {
  const head = read(doc).split("\n").slice(0, 6).join("\n");
  if (!/^> /m.test(head)) fail(`${doc} needs a short "> **Summary:** / > **Read when:**" note right under its title`);
  const bytes = statSync(join(root, doc)).size;
  if (doc !== "docs/CHANGELOG.md" && bytes > DOC_MAX_BYTES) fail(`${doc} is ${Math.round(bytes / 1000)} KB (max ${DOC_MAX_BYTES / 1000} KB); split it`);
}

// Playbooks are step lists; long ones stop being followed.
for (const playbook of playbooks) {
  const lines = read(playbook).split("\n").length;
  if (lines > PLAYBOOK_MAX_LINES) fail(`${playbook} has ${lines} lines (max ${PLAYBOOK_MAX_LINES})`);
}

// 4. Relative markdown links resolve.
for (const file of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "README.md", ...docs]) {
  if (!existsSync(join(root, file))) continue;
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split("#")[0];
    if (path && !existsSync(join(root, dirname(file), path))) fail(`${file}: broken link ${target}`);
  }
}

// 5. Paths named in CODEMAP.md still exist.
const codemapBases = ["", "backend", "backend/src", "backend/src/routes", "backend/src/services", "backend/src/middleware", "frontend/src"];
const codemap = read("docs/CODEMAP.md");
for (const [, token] of codemap.matchAll(/`([^`\s]+)`/g)) {
  const names = token.split(/[\s,]+/);
  for (const name of names) {
    let candidate = null;
    if (/^[\w./-]+\.(js|jsx|mjs|md)$/.test(name) || /^[\w./-]+\/$/.test(name)) candidate = name;
    else if (/^[a-z]\w*Service$/.test(name) || name === "supplierKybGate" || name === "reservationProviders") candidate = `${name}.js`;
    if (!candidate) continue;
    if (!codemapBases.some((base) => existsSync(join(root, base, candidate)))) fail(`docs/CODEMAP.md: path not found: ${name}`);
  }
}

// 6. Library majors in LIBRARIES.md match package.json.
const major = (pkg, dep) => {
  const json = JSON.parse(read(pkg));
  const spec = json.dependencies?.[dep] ?? json.devDependencies?.[dep];
  return spec ? spec.replace(/^[^\d]*/, "").split(".")[0] : null;
};
const libraries = read("docs/LIBRARIES.md");
const expectations = [
  ["backend/package.json", "express", "Express"],
  ["backend/package.json", "zod", "zod"],
  ["frontend/package.json", "zod", "zod"],
  ["package.json", "zod", "zod"],
  ["frontend/package.json", "react", "React"],
  ["frontend/package.json", "react-router-dom", "react-router"],
  ["frontend/package.json", "vite", "Vite"],
  ["package.json", "next", "Next.js"],
  ["frontend/package.json", "tailwindcss", "Tailwind CSS"],
  ["package.json", "tailwindcss", "Tailwind CSS"],
];
for (const [pkg, dep, label] of expectations) {
  const version = major(pkg, dep);
  if (version && !libraries.includes(`| ${label} ${version} |`)) {
    fail(`docs/LIBRARIES.md: ${pkg} has ${dep} ${version}.x but no "${label} ${version}" row; update the table and its Context7 ID`);
  }
}

if (problems.length) {
  console.log(problems.map((problem) => `✖ ${problem}`).join("\n"));
  console.log(`\n${problems.length} agent-doc problem(s). See AGENTS.md and docs/CODEMAP.md.`);
  process.exit(1);
}
console.log(`✔ agent docs OK (AGENTS.md ${agentLines}/${AGENTS_MAX_LINES} lines, ${docs.length} docs)`);
