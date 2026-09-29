import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const pluginRoot = join(root, 'plugins/remcod');
const json = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const plugin = await json('plugins/remcod/plugin.json');
const mcp = await json('plugins/remcod/mcp.json');
assert.equal(plugin.name, 'remcod');
assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
assert.ok(plugin.extensions['com.openai'].interface.shortDescription.length <= 30);
assert.deepEqual(Object.keys(mcp.mcpServers), ['remcod']);
assert.deepEqual(mcp.mcpServers.remcod, { type: 'streamable-http', url: 'https://app.remcod.ru/api/mcp' });
for (const name of ['.codex-plugin', '.claude-plugin']) {
  const compatibility = await json(`plugins/remcod/${name}/plugin.json`);
  assert.equal(compatibility.name, plugin.name);
  assert.equal(compatibility.version, plugin.version);
}
for (const name of ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']) {
  const market = await json(name);
  assert.equal(market.plugins.length, 1);
  const source = market.plugins[0].source;
  assert.equal(typeof source === 'string' ? source : source.path, './plugins/remcod');
}
let skillCount = 0;
for (const dir of await readdir(join(pluginRoot, 'skills'))) {
  const text = await readFile(join(pluginRoot, 'skills', dir, 'SKILL.md'), 'utf8');
  assert.ok(text.startsWith(`---\nname: ${dir}\ndescription: `), dir);
  skillCount++;
}
async function walk(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (relative === '' && entry.name === '.git') continue;
    assert.ok(!['node_modules', 'backend', 'apps', '.env'].includes(entry.name), `Unexpected ${entry.name}`);
    assert.ok(!entry.name.startsWith('.env'), `Unexpected ${entry.name}`);
    const path = join(directory, entry.name);
    assert.equal((await lstat(path)).isSymbolicLink(), false, path);
    if (entry.isDirectory()) await walk(path, `${relative}/${entry.name}`);
    else {
      const text = await readFile(path, 'utf8');
      assert.ok(!/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|rmc[dor]_[A-Za-z0-9_-]{24,}|sk-[A-Za-z0-9_-]{24,})/u.test(text), `Sensitive material: ${entry.name}`);
    }
  }
}
await walk(root);
console.log(JSON.stringify({ status: 'passed', version: plugin.version, skills: skillCount, validation: 'package only; no authenticated business calls' }));
