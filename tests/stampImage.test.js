import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStampSvg, renderStampImage, validateImageSettings } from '../src/stampImage.js';

const config = { top_str: '部署名<&"', btm_str: '髙橋渡邊長い日本語氏名', top_font_size: 80, mid_font_size: 60, btm_font_size: 80, output_size: 100 };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function deferred() {
  let resolve;
  const promise = new Promise(ok => { resolve = ok; });
  return { promise, resolve };
}
function surface(size) {
  const order = [];
  const fonts = deferred(), draw = deferred(), encoding = deferred();
  const rgba = new Uint8ClampedArray(size * size * 4);
  rgba.set([199, 67, 50, 255], (Math.floor(size / 2) * size + 2) * 4);
  const canvas = { width: 0, height: 0,
    getContext: () => ({ getImageData: (x, y, w, h) => {
      assert.deepEqual([x, y, w, h], [0, 0, size, size]);
      order.push('rgba'); return { data: rgba, width: w, height: h };
    } }),
    toBlob: async (callback, type) => { order.push(type); await encoding.promise; callback(new Blob(['png'], { type })); },
  };
  const options = {
    waitFonts: async () => { order.push('font-start'); await fonts.promise; order.push('font-ready'); },
    createCanvas: () => canvas,
    renderer: { fromString: () => {
      order.push('renderer');
      return { resize: (w, h, fit) => assert.deepEqual([w, h, fit], [size, size, 'xMidYMid meet']),
        render: async () => { await draw.promise; order.push('draw'); } };
    } },
  };
  return { order, fonts, draw, encoding, canvas, options };
}

test('one escaped SVG source uses private bundled alias, all rows, and fits long names', () => {
  const svg = buildStampSvg(config, '令和7年10月22日');
  assert.match(svg, /部署名&lt;&amp;&quot;/);
  assert.match(svg, /髙橋渡邊長い日本語氏名/);
  assert.match(svg, /令和7年10月22日/);
  assert.equal((svg.match(/font-family="'estamp Shippori Mincho B1'"/g) || []).length, 3);
  assert.match(svg, /scale\(0\./);
  assert.doesNotMatch(svg, /<image|@font-face|https?:\/\/(?!www.w3.org)/);
});

for (const size of [50, 100, 200]) test(`render ${size}px waits fonts then drawing then PNG and preserves alpha`, async () => {
  const s = surface(size);
  let complete = false;
  const pending = renderStampImage(buildStampSvg(config, '令和7年10月22日'), size, s.options).then(result => { complete = true; return result; });
  assert.deepEqual(s.order, ['font-start']);
  s.fonts.resolve(); await new Promise(setImmediate);
  assert.deepEqual(s.order, ['font-start', 'font-ready', 'renderer']);
  assert.equal(s.canvas.width, size); assert.equal(s.canvas.height, size);
  s.draw.resolve(); await new Promise(setImmediate);
  assert.equal(complete, false);
  assert.deepEqual(s.order, ['font-start', 'font-ready', 'renderer', 'draw', 'image/png']);
  s.encoding.resolve();
  const result = await pending;
  assert.equal(result.png.type, 'image/png');
  assert.equal(result.width, size); assert.equal(result.height, size);
  assert.ok(result.rgba instanceof Uint8Array);
  assert.equal(result.rgba.length, size * size * 4);
  assert.equal(result.rgba[3], 0); assert.ok(result.rgba.includes(255));
});

test('invalid sizes, font/render/canvas/PNG failures propagate actionable messages', async () => {
  for (const output_size of [undefined, 0, -1, 1.5, 4097]) {
    assert.throws(() => validateImageSettings({ ...config, output_size }), /出力サイズ/);
  }
  for (const key of ['top_font_size', 'mid_font_size', 'btm_font_size']) {
    assert.throws(() => validateImageSettings({ ...config, [key]: undefined }), /文字サイズ/);
  }
  await assert.rejects(renderStampImage('', 0), /出力サイズ/);
  await assert.rejects(renderStampImage('', 100, { waitFonts: async () => { throw new Error('書体エラー'); } }), /書体エラー/);
  await assert.rejects(renderStampImage('', 100, { waitFonts: async () => {}, createCanvas: () => ({ getContext: () => null }) }), /画像を作成できません/);
  const s = surface(100); s.fonts.resolve();
  s.options.renderer.fromString = () => ({ resize() {}, render: async () => { throw new Error('描画エラー'); } });
  await assert.rejects(renderStampImage('', 100, s.options), /描画エラー/);
  const p = surface(100); p.fonts.resolve(); p.draw.resolve();
  p.canvas.toBlob = callback => callback(null);
  await assert.rejects(renderStampImage('', 100, p.options), /PNGを作成できません/);
});

test('clipboard contract is RGBA -> Image resource -> writeImage; no read or base64 conversion', () => {
  const app = read('../src/App.svelte');
  assert.match(app, /Image\.new\(rendered\.rgba, rendered\.width, rendered\.height\)/);
  assert.match(app, /await writeImage\(image\)/);
  assert.match(app, /finally\s*\{\s*await image.close\(\)/);
  for (const source of [app, read('../src/stampImage.js')]) assert.doesNotMatch(source, /btoa|atob|toDataURL|readImage|readText/);
  const caps = JSON.parse(read('../src-tauri/capabilities/main-window.json'));
  assert.deepEqual(caps.windows, ['main']);
  assert.deepEqual(caps.permissions.filter(p => p.startsWith('clipboard-manager:')), ['clipboard-manager:allow-write-image']);
});
