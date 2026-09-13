import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Meta WhatsApp templates are positional and approved with a fixed number of
 * variables; a send with a different count is rejected. Every call site for
 * the same WHATSAPP_TEMPLATE_<KEY> must therefore pass the same number of
 * values. This scans the source so a mismatch fails here, not in production.
 */

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

// Counts the top-level elements of the array literal that starts at `open` ("[").
function countArrayElements(source, open) {
  let depth = 0;
  let elements = 0;
  let sawValue = false;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipString(source, i);
      sawValue = true;
      continue;
    }
    if ("([{".includes(char)) {
      depth++;
      if (depth > 1) sawValue = true;
      continue;
    }
    if (")]}".includes(char)) {
      depth--;
      if (depth === 0) return elements + (sawValue ? 1 : 0);
      continue;
    }
    if (depth === 1 && char === ",") {
      elements++;
      sawValue = false;
    } else if (depth === 1 && !/\s/.test(char)) {
      sawValue = true;
    }
  }
  throw new Error("Unterminated template value array");
}

function skipString(source, start) {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") { i++; continue; }
    if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
      let depth = 1;
      i += 2;
      for (; i < source.length && depth > 0; i++) {
        if (source[i] === "`" || source[i] === '"' || source[i] === "'") i = skipString(source, i);
        else if (source[i] === "{") depth++;
        else if (source[i] === "}") depth--;
      }
      i--;
      continue;
    }
    if (source[i] === quote) return i;
  }
  throw new Error("Unterminated string");
}

function templateCallSites() {
  const sites = [];
  for (const file of sourceFiles(srcDir)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/whatsAppTemplate\(\s*process\.env\.(WHATSAPP_TEMPLATE_[A-Z_]+)\s*,\s*\[/g)) {
      const open = match.index + match[0].length - 1;
      const line = source.slice(0, match.index).split("\n").length;
      sites.push({ key: match[1], count: countArrayElements(source, open), at: `${path.relative(srcDir, file)}:${line}` });
    }
  }
  return sites;
}

test("counts template values across strings, template literals and nested calls", () => {
  const source = 'x([a, "b,c", `d ${fn(1, [2, 3])} e`, f(g, h), { i: 1, j: 2 }])';
  assert.equal(countArrayElements(source, source.indexOf("[")), 5);
  assert.equal(countArrayElements("[]", 0), 0);
  assert.equal(countArrayElements("[a, b,\n]", 0), 2);
});

test("every WhatsApp template key is sent with one consistent number of values", () => {
  const sites = templateCallSites();
  assert.ok(sites.length >= 15, `expected to find the template call sites, found ${sites.length}`);

  const byKey = new Map();
  for (const site of sites) byKey.set(site.key, [...(byKey.get(site.key) || []), site]);

  const mismatches = [...byKey.entries()]
    .filter(([, list]) => new Set(list.map((site) => site.count)).size > 1)
    .map(([key, list]) => `${key}: ${list.map((site) => `${site.count} at ${site.at}`).join(", ")}`);
  assert.deepEqual(mismatches, [], "Template value counts differ; Meta rejects sends that don't match the approved template");
});
