import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pluginRoot = join(root, "plugins/remcod");
const outputArg = process.argv[2];

if (!outputArg) {
  throw new Error("Usage: node scripts/package-chatgpt.mjs <new-output.zip>");
}

const output = resolve(outputArg);
const fromPlugin = relative(pluginRoot, output);
if (fromPlugin === "" || (!fromPlugin.startsWith(`..${sep}`) && fromPlugin !== ".." && !fromPlugin.startsWith(sep))) {
  throw new Error("Write the archive outside the plugin source directory");
}

try {
  await access(output);
  throw new Error("Refusing to overwrite an existing archive");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const manifest = JSON.parse(await readFile(join(pluginRoot, "plugin.json"), "utf8"));
assert.match(manifest.name, /^[a-z0-9][a-z0-9-]{0,63}$/u, "plugin name must be a safe directory name");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/u, "plugin version must be semantic versioning");

const staging = await mkdtemp(join(tmpdir(), "remcod-plugin-chatgpt-"));
try {
  await cp(pluginRoot, join(staging, manifest.name), { recursive: true, dereference: false });
  const zipped = spawnSync("zip", ["-q", "-r", output, manifest.name], {
    cwd: staging,
    encoding: "utf8",
  });
  if (zipped.error) throw zipped.error;
  if (zipped.status !== 0) throw new Error(zipped.stderr || "zip failed");

  const listing = spawnSync("unzip", ["-Z1", output], { encoding: "utf8" });
  if (listing.error) throw listing.error;
  if (listing.status !== 0) throw new Error(listing.stderr || "unzip listing failed");

  const entries = listing.stdout.split(/\r?\n/u).filter(Boolean);
  const roots = new Set(entries.map((entry) => entry.split("/")[0]));
  assert.deepEqual([...roots], [manifest.name], "archive must contain exactly one plugin directory");
  assert.ok(entries.includes(`${manifest.name}/plugin.json`), "plugin.json must be inside the plugin directory");
  assert.ok(entries.includes(`${manifest.name}/mcp.json`), "mcp.json must be inside the plugin directory");
  assert.ok(entries.some((entry) => entry.startsWith(`${manifest.name}/skills/`)), "skills must be inside the plugin directory");

  console.log(JSON.stringify({ status: "passed", version: manifest.version, packageRoot: manifest.name, entries: entries.length, archive: output }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
}
