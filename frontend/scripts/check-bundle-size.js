import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const assetsDirectory = path.resolve("dist/assets");
const maximumJavaScriptBytes = Number(process.env.MAX_JS_CHUNK_KIB || 250) * 1024;
const maximumEntryBytes = Number(process.env.MAX_INITIAL_JS_KIB || 225) * 1024;
const chunks = readdirSync(assetsDirectory)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({ file, bytes: statSync(path.join(assetsDirectory, file)).size }))
  .sort((left, right) => right.bytes - left.bytes);

if (!chunks.length) throw new Error("No production JavaScript chunks were found.");

const largest = chunks[0];
const kib = (largest.bytes / 1024).toFixed(1);
const limitKib = (maximumJavaScriptBytes / 1024).toFixed(0);
console.log(`Largest JavaScript chunk: ${largest.file} (${kib} KiB; budget ${limitKib} KiB)`);

if (largest.bytes > maximumJavaScriptBytes) {
  console.error("Bundle performance budget exceeded. Split the largest route or dependency before merging.");
  process.exitCode = 1;
}

const html = readFileSync(path.resolve("dist/index.html"), "utf8");
const entryFile = html.match(/<script[^>]+src="\/assets\/([^"?]+\.js)"/)?.[1];
const entry = chunks.find(({ file }) => file === entryFile);
if (!entry) throw new Error("The production JavaScript entry chunk could not be identified.");

const entryKib = (entry.bytes / 1024).toFixed(1);
const entryLimitKib = (maximumEntryBytes / 1024).toFixed(0);
console.log(`Initial JavaScript entry: ${entry.file} (${entryKib} KiB; budget ${entryLimitKib} KiB)`);

if (entry.bytes > maximumEntryBytes) {
  console.error("Initial bundle budget exceeded. Keep traveler pages and optional providers route-loaded.");
  process.exitCode = 1;
}
