import { describe, test, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));

const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);

/** Every module reachable from `entry` through static `import ... from './x.js'` statements. */
function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, spec] of read(file).matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      queue.push(relative(ROOT, join(ROOT, dirname(file), spec)).split('\\').join(posix.sep));
    }
  }
  return [...seen];
}

describe('manifest', () => {
  test('version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  test('description fits the Chrome Web Store limit', () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  test('every referenced file exists', () => {
    const files = [
      manifest.action.default_popup,
      manifest.options_ui.page,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
      ...manifest.content_scripts.flatMap((script) => script.js),
    ];
    for (const file of files) expect(existsSync(join(ROOT, file))).toBe(true);
  });

  test('asks only for the permissions the docs explain', () => {
    expect(manifest.permissions.sort()).toEqual(['activeTab', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
  });

  test('content scripts and web-accessible resources cover the same console hosts', () => {
    const hosts = new Set(manifest.content_scripts.flatMap((script) => script.matches));
    for (const resource of manifest.web_accessible_resources) expect(new Set(resource.matches)).toEqual(hosts);
  });

  test('the loader imports a module the page is allowed to load, along with all of its imports', () => {
    const [, entry] = read('src/content/loader.js').match(/getURL\('([^']+)'\)/);
    const patterns = manifest.web_accessible_resources.flatMap((resource) => resource.resources).map(globToRegExp);
    const graph = moduleGraph(entry);
    expect(graph.length).toBeGreaterThan(5);
    for (const file of graph) {
      expect(existsSync(join(ROOT, file))).toBe(true);
      expect({ file, exposed: patterns.some((pattern) => pattern.test(file)) }).toEqual({ file, exposed: true });
    }
  });

  test('the main-world bridge and the guard agree on the attribute name', () => {
    const bridge = read('src/content/nav-bridge.js').match(/const ATTR = '([^']+)'/)[1];
    const guard = read('src/content/guard.js').match(/export const NAV_ATTR = '([^']+)'/)[1];
    expect(bridge).toBe(guard);
  });

  test('the bridge runs in the main world and the loader does not', () => {
    const byFile = Object.fromEntries(manifest.content_scripts.map((script) => [script.js[0], script.world ?? 'ISOLATED']));
    expect(byFile).toEqual({ 'src/content/nav-bridge.js': 'MAIN', 'src/content/loader.js': 'ISOLATED' });
  });
});
