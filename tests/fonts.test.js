import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadStampFonts } from '../src/fonts.js';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? files(child) : [child];
  });
}

test('source and build inputs contain no external Google font URL', () => {
  const inputs = ['index.html', 'package.json', 'vite.config.ts', 'tailwind.config.cjs',
    'postcss.config.cjs', 'svelte.config.js', 'src-tauri/tauri.conf.json'].map(path => resolve(root, path));
  inputs.push(...files(resolve(root, 'src')), ...files(resolve(root, 'public')));
  const visited = new Set();
  function check(path) {
    if (visited.has(path) || ['.ttf', '.png', '.svg', '.ico'].includes(extname(path))) return;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com/i, relative(root, path));
    // Follow imported dependency CSS too: Skeleton's upstream theme imports a remote font.
    for (const [, imported] of source.matchAll(/['"]([^'"\n]+\.(?:css|postcss))['"]/g)) {
      const local = resolve(dirname(path), imported);
      check(existsSync(local) ? local : createRequire(path).resolve(imported));
    }
  }
  inputs.forEach(check);
});

test('font faces reference only the four bundled original files with matching OFL and notices hashes', () => {
  const css = read('src/app.postcss');
  const notices = read('THIRD-PARTY-NOTICES.md');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => match[1]);
  assert.equal(faces.length, 4);
  const expected = new Set([
    'bizudpgothic/BIZUDPGothic-Regular.ttf', 'bizudpgothic/BIZUDPGothic-Bold.ttf',
    'shipporiminchob1/ShipporiMinchoB1-Regular.ttf', 'shipporiminchob1/ShipporiMinchoB1-Bold.ttf',
  ]);
  for (const face of faces) {
    const urls = [...face.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)].map(match => match[1]);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].startsWith('/fonts/'));
    assert.ok(expected.delete(urls[0].slice('/fonts/'.length)), urls[0]);
    const path = `public${urls[0]}`;
    const bytes = readFileSync(resolve(root, path));
    const oflPath = `${dirname(path)}/OFL.txt`;
    const ofl = read(oflPath);
    assert.ok(notices.includes(ofl.split('\n')[0]));
    assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
    for (const [name, contents] of [[path, bytes], [oflPath, readFileSync(resolve(root, oflPath))]]) {
      const hash = createHash('sha256').update(contents).digest('hex');
      assert.ok(notices.includes(`| \`${name}\` | \`${hash}\` |`), name);
    }
    assert.match(face, /font-weight:\s*(400|700)/);
    assert.match(face, /font-style:\s*normal/);
  }
  assert.equal(expected.size, 0);
  assert.equal(files(resolve(root, 'public/fonts')).filter(path => path.endsWith('.ttf')).length, 4);
});

test('all seal text specifies Shippori while UI and license resources stay local', () => {
  const app = read('src/App.svelte');
  const texts = [...app.matchAll(/<text\s+([^>]+)>/g)].map(match => match[1]);
  assert.equal(texts.length, 3);
  for (const text of texts) assert.match(text, /font-family='Shippori Mincho B1'/);
  assert.match(read('src/app.postcss'), /font-family: 'BIZ UDPGothic', sans-serif/);
  const resources = JSON.parse(read('src-tauri/tauri.conf.json')).bundle.resources;
  for (const path of ['../LICENSE', '../THIRD-PARTY-NOTICES.md',
    '../public/fonts/bizudpgothic/OFL.txt', '../public/fonts/shipporiminchob1/OFL.txt',
    '../licenses/skeleton-LICENSE.txt']) {
    assert.ok(resources[path]);
    readFileSync(resolve(root, 'src-tauri', path));
  }
  const licenses = read('src/Licenses.svelte');
  assert.match(licenses, /ライセンス/);
  for (const path of ['THIRD-PARTY-NOTICES.md', 'LICENSE',
    'public/fonts/bizudpgothic/OFL.txt', 'public/fonts/shipporiminchob1/OFL.txt',
    'licenses/skeleton-LICENSE.txt']) {
    assert.ok(licenses.includes(`${path}?raw`));
  }
});

test('font loading waits for both weights and rejects missing or failed faces', async () => {
  const requests = [];
  let finishBold;
  let done = false;
  const loading = loadStampFonts({ load: (font, text) => {
    requests.push({ font, text });
    return font.startsWith('400') ? Promise.resolve([{}]) : new Promise(resolve => { finishBold = resolve; });
  } }).then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false);
  assert.deepEqual(requests.map(request => request.font), [
    '400 16px "Shippori Mincho B1"', '700 16px "Shippori Mincho B1"',
  ]);
  finishBold([{}]);
  await loading;
  assert.equal(done, true);
  await assert.rejects(loadStampFonts({ load: async () => [] }), /見つかりません/);
  await assert.rejects(loadStampFonts({ load: async () => { throw new Error('font decode failed'); } }), /decode failed/);
});
