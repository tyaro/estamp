import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAMP_FONT, buildStampSvg, hasLongStampLine, splitStampText, renderStampImage, validateImageSettings } from '../src/stampImage.js';
import { bundledStampMetrics } from './helpers/fontMetrics.js';

const config = { top_str: '部署名<&"', btm_str: '髙橋渡邊長い日本語氏名', top_font_size: 80, mid_font_size: 60, btm_font_size: 80, output_size: 100 };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('half/full-width spaces split only names into two balanced lines; warnings count each Unicode line', () => {
  for (const space of [' ', '　', ' 　']) {
    assert.deepEqual(splitStampText(`国際事業推進部${space}髙橋渡邊`), ['国際事業推進部', '髙橋渡邊']);
    const svg = buildStampSvg({ ...config, top_str: `国際事業推進部${space}髙橋渡邊`, btm_str: `山田${space}太郎` }, '2025 10 22');
    assert.equal((svg.match(/<text /g) ?? []).length, 5);
    assert.match(svg, />2025 10 22<\/text>/);
  }
  assert.equal(splitStampText(' 営業 第一　髙橋 太郎　').length, 2);
  assert.equal(hasLongStampLine('一二三四五六七八'), false);
  assert.equal(hasLongStampLine('一二三四五六七八九'), true);
  assert.equal(hasLongStampLine('国際事業推進部 髙橋渡邊'), false);
  assert.equal(hasLongStampLine('𠮷'.repeat(8)), false);
  assert.equal(hasLongStampLine('𠮷'.repeat(9)), true);
});

test('100px long-name geometry uses bundled glyph bounds: two lines, >=9px ink and >=75% width', t => {
  const context = bundledStampMetrics();
  const svg = buildStampSvg({ ...config, top_str: '国際事業推進部 髙橋渡邊', btm_str: '国際事業推進部 髙橋渡邊' }, '2025.10.22', { context });
  const rows = [...svg.matchAll(/font-size="([\d.]+)" transform="translate\(200 ([\d.e+-]+)\) scale\(([\d.e+-]+) ([\d.e+-]+)\)"[^>]*>([^<]*)<\/text>/g)];
  assert.equal(rows.length, 5);
  for (const index of [0, 1, 3, 4]) {
    const [, size, baseline, sx, sy, text] = rows[index];
    context.font = `700 ${size}px "${STAMP_FONT}"`;
    const metrics = context.measureText(text);
    const height = (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) * Number(sy) / 4;
    const compression = Number(sx) / Number(sy);
    t.diagnostic(`${text}: height=${height.toFixed(3)}px, compression=${(compression * 100).toFixed(3)}%`);
    assert.ok(height >= 9, `ink height ${height}`);
    assert.ok(compression >= 0.75);
    assert.ok(metrics.width * Number(sx) <= 220 + 1e-9);
    const top = Number(baseline) - metrics.actualBoundingBoxAscent * Number(sy);
    const bottom = Number(baseline) + metrics.actualBoundingBoxDescent * Number(sy);
    const band = index < 2 ? [60, 140] : [260, 340];
    assert.ok(top >= band[0] - 1e-9 && bottom <= band[1] + 1e-9);
  }
});

test('fitting stages uniformly shrink, then compress, then uniformly shrink without passing 75%', () => {
  for (const [count, expectedCompression] of [[2, 1], [3, 220 / 240], [11, 0.75]]) {
    const svg = buildStampSvg({ ...config, top_str: '字'.repeat(count) }, '2025.10.22', { context: null });
    const [, sx, sy] = svg.match(/scale\(([\d.e+-]+) ([\d.e+-]+)\)/);
    assert.ok(Math.abs(Number(sx) / Number(sy) - expectedCompression) < 1e-9);
    assert.ok(Number(sy) <= 80 / 96);
  }
});
function deferred() {
  let resolve;
  const promise = new Promise(ok => { resolve = ok; });
  return { promise, resolve };
}
function surface(size) {
  const order = [];
  const fonts = deferred(), draw = deferred();
  // A non-zero offset also checks that the returned view covers only ImageData.
  const rgba = new Uint8ClampedArray(new ArrayBuffer(size * size * 4 + 8), 4, size * size * 4);
  rgba.set([199, 67, 50, 255], (Math.floor(size / 2) * size + 2) * 4);
  const canvas = { width: 0, height: 0,
    getContext: () => ({ getImageData: (x, y, w, h) => {
      assert.deepEqual([x, y, w, h], [0, 0, size, size]);
      order.push('rgba'); return { data: rgba, width: w, height: h };
    } }),
    toBlob: () => assert.fail('Clipboard rendering must not encode PNG'),
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
  return { order, fonts, draw, rgba, canvas, options };
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

test('wide W text and size 400 fit every band and the circular frame using measured ink bounds', () => {
  // Five wide glyphs exercise both fitting stages while remaining physically
  // compatible with the 9px floor. Longer lines have a separate floor test.
  const text = 'W'.repeat(5);
  for (const size of [80, 400]) {
    const calls = [];
    const context = {
      font: '', textAlign: '', textBaseline: '',
      measureText(value) {
        assert.equal(value, text);
        assert.equal(this.textAlign, 'center');
        assert.equal(this.textBaseline, 'alphabetic');
        calls.push(this.font);
        // Deliberately wider than the old ASCII 0.6em estimate, with overhang
        // and a tall ink box exceeding 1em.
        return { width: text.length * size * 1.1, actualBoundingBoxLeft: text.length * size * 0.6,
          actualBoundingBoxRight: text.length * size * 0.55,
          actualBoundingBoxAscent: size * 0.95, actualBoundingBoxDescent: size * 0.35 };
      },
    };
    const svg = buildStampSvg({ ...config, top_str: text, btm_str: text,
      top_font_size: size, mid_font_size: size, btm_font_size: size }, text, { context });
    assert.deepEqual(calls, [700, 400, 700].map(weight => `${weight} ${size}px "${STAMP_FONT}"`));
    const rows = [...svg.matchAll(/translate\(200 ([\d.e+-]+)\) scale\(([\d.e+-]+) ([\d.e+-]+)\)/g)];
    assert.equal(rows.length, 3);
    for (const [i, [, baseline, sx, sy]] of rows.entries()) {
      const [minY, maxY, width] = [[60, 140, 220], [165, 235, 340], [260, 340, 220]][i];
      const left = 200 - text.length * size * 0.6 * Number(sx);
      const right = 200 + text.length * size * 0.55 * Number(sx);
      const top = Number(baseline) - size * 0.95 * Number(sy);
      const bottom = Number(baseline) + size * 0.35 * Number(sy);
      assert.ok(top >= minY - 1e-9 && bottom <= maxY + 1e-9);
      assert.ok(left >= 200 - width / 2 - 1e-9 && right <= 200 + width / 2 + 1e-9);
      assert.ok(Number(sx) <= Number(sy) && Number(sy) <= 1);
      for (const x of [left, right]) for (const y of [top, bottom]) {
        assert.ok(Math.hypot(x - 200, y - 200) < 184, 'ink corners stay inside inner frame');
      }
    }
  }
});

test('automatic shrinking stops at 9px and 75% even when an unbroken name cannot fit', () => {
  for (const count of [11, 30]) {
    const svg = buildStampSvg({ ...config, top_str: 'W'.repeat(count) }, '2025.10.22', { context: null });
    const [, sx, sy] = svg.match(/scale\(([\d.e+-]+) ([\d.e+-]+)\)/);
    assert.ok(Math.abs(Number(sx) / Number(sy) - 0.75) < 1e-9);
    assert.ok(Math.abs(80 * 1.2 * Number(sy) / 4 - 9) < 1e-9);
    assert.ok(count * 80 * 1.2 * Number(sx) > 220);
  }
  const tiny = buildStampSvg({ ...config, top_str: '字', top_font_size: 1 }, '2025.10.22', { context: null });
  assert.match(tiny, /scale\(1 1\)/, 'explicitly small user font sizes are not enlarged');
});

test('DOM-free measurement fallback is deterministic, including empty rows', () => {
  const settings = { ...config, top_str: '', btm_str: 'WWW', top_font_size: 400, btm_font_size: 400 };
  const svg = buildStampSvg(settings, '', { context: null });
  assert.equal(svg, buildStampSvg(settings, '', { context: null }));
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

for (const size of [50, 100, 200]) test(`render ${size}px waits fonts then drawing then RGBA without PNG and preserves alpha`, async () => {
  const s = surface(size);
  let complete = false;
  const pending = renderStampImage(buildStampSvg(config, '令和7年10月22日'), size, s.options).then(result => { complete = true; return result; });
  assert.deepEqual(s.order, ['font-start']);
  s.fonts.resolve(); await new Promise(setImmediate);
  assert.deepEqual(s.order, ['font-start', 'font-ready', 'renderer']);
  assert.equal(s.canvas.width, size); assert.equal(s.canvas.height, size);
  assert.equal(complete, false);
  s.draw.resolve();
  const result = await pending;
  assert.deepEqual(s.order, ['font-start', 'font-ready', 'renderer', 'draw', 'rgba']);
  assert.equal('png' in result, false);
  assert.equal(result.width, size); assert.equal(result.height, size);
  assert.ok(result.rgba instanceof Uint8Array);
  assert.equal(result.rgba.length, size * size * 4);
  assert.equal(result.rgba.buffer, s.rgba.buffer);
  assert.equal(result.rgba.byteOffset, s.rgba.byteOffset);
  assert.equal(result.rgba[3], 0); assert.ok(result.rgba.includes(255));
});

test('invalid sizes and font/render/canvas failures propagate actionable messages', async () => {
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
});

test('clipboard contract is RGBA -> Image resource -> writeImage; no read or base64 conversion', () => {
  const app = read('../src/App.svelte');
  assert.match(app, /Image\.new\(rendered\.rgba, rendered\.width, rendered\.height\)/);
  assert.match(app, /await writeImage\(image\)/);
  assert.match(app, /finally\s*\{\s*await image.close\(\)/);
  for (const source of [app, read('../src/stampImage.js')]) assert.doesNotMatch(source, /btoa|atob|toDataURL|toBlob|readImage|readText/);
  const caps = JSON.parse(read('../src-tauri/capabilities/main-window.json'));
  assert.deepEqual(caps.windows, ['main']);
  assert.deepEqual(caps.permissions.filter(p => p.startsWith('clipboard-manager:')), ['clipboard-manager:allow-write-image']);
});
