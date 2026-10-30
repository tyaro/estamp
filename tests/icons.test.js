import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodePng, readIcnsChunks, decodeLegacyIcns } from './helpers/iconImages.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const hash = data => createHash('sha256').update(data).digest('hex');
const expected = JSON.parse(read('tests/fixtures/icon-pixels.json'));
const pngs = {
  '32x32.png': [32, 'simple'],
  '128x128.png': [128, 'full'],
  '128x128@2x.png': [256, 'full'],
  'icon.png': [512, 'full'],
  'Square30x30Logo.png': [30, 'simple'],
  'Square44x44Logo.png': [44, 'simple'],
  'Square71x71Logo.png': [71, 'full'],
  'Square89x89Logo.png': [89, 'full'],
  'Square107x107Logo.png': [107, 'full'],
  'Square142x142Logo.png': [142, 'full'],
  'Square150x150Logo.png': [150, 'full'],
  'Square284x284Logo.png': [284, 'full'],
  'Square310x310Logo.png': [310, 'full'],
  'StoreLogo.png': [50, 'full'],
};

function checkImage(image, size, source, key) {
  const { width, height, rgba } = image;
  assert.equal(width, size, key);
  assert.equal(height, size, key);
  const alpha = (x, y) => rgba[(y * width + x) * 4 + 3];
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    assert.equal(alpha(x, y), 0, `${key}: transparent corners`);
  }
  assert.ok(rgba.some((value, i) => i % 4 === 3 && value === 255), `${key}: opaque seal`);
  assert.ok(rgba.some((value, i) => i % 4 === 3 && value > 0 && value < 255), `${key}: antialiasing`);
  // This rectangle is inside the middle band, clear of both rules and the circle.
  // Only icon-full's R8 paths can paint it; a solid background would fail as well.
  let ink = 0;
  for (let y = Math.ceil(size * 112 / 256); y < Math.floor(size * 144 / 256); y++) {
    for (let x = Math.ceil(size * 88 / 256); x < Math.floor(size * 170 / 256); x++) {
      ink += alpha(x, y);
    }
  }
  if (source === 'simple') assert.equal(ink, 0, `${key}: no text`);
  else assert.ok(ink > 0, `${key}: R8 text`);
  assert.equal(expected.rasters[key].source, source, `${key}: SVG variant`);
  assert.equal(hash(rgba), expected.rasters[key].sha256, `${key}: pixels from approved SVG`);
}

test('案A source SVGs and the existing bundle icon list stay fixed', () => {
  for (const source of ['full', 'simple']) {
    assert.equal(hash(read(`docs/design/icon/icon-${source}.svg`)), expected.sources[source]);
  }
  assert.deepEqual(JSON.parse(read('src-tauri/tauri.conf.json')).bundle.icon, [
    'icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns', 'icons/icon.ico',
  ]);
  assert.deepEqual(readdirSync(new URL('src-tauri/icons/', root)).sort(),
    [...Object.keys(pngs), 'icon.ico', 'icon.icns'].sort());
});

for (const [name, [size, source]] of Object.entries(pngs)) {
  test(`${name}: ${size}px, icon-${source}, RGBA transparency`, () => {
    checkImage(decodePng(read(`src-tauri/icons/${name}`)), size, source, name);
  });
}

test('ICO has exactly 16/24/32 simple and 48/64/256 full PNG entries', () => {
  const data = read('src-tauri/icons/icon.ico');
  const sizes = [16, 24, 32, 48, 64, 256];
  assert.equal(data.readUInt16LE(0), 0);
  assert.equal(data.readUInt16LE(2), 1);
  assert.equal(data.readUInt16LE(4), sizes.length);
  let offset = 6 + sizes.length * 16;
  sizes.forEach((size, i) => {
    const p = 6 + i * 16;
    assert.equal(data[p] || 256, size);
    assert.equal(data[p + 1] || 256, size);
    assert.equal(data[p + 2], 0, 'no palette');
    assert.equal(data[p + 3], 0, 'reserved');
    assert.equal(data.readUInt16LE(p + 4), 1, 'planes');
    assert.equal(data.readUInt16LE(p + 6), 32, 'bits per pixel');
    assert.equal(data.readUInt32LE(p + 12), offset, 'contiguous payloads');
    const length = data.readUInt32LE(p + 8);
    assert.ok(length > 0 && offset + length <= data.length);
    checkImage(decodePng(data.subarray(offset, offset + length)), size,
      size <= 32 ? 'simple' : 'full', `ico:${size}`);
    offset += length;
  });
  assert.equal(offset, data.length, 'no unaccounted payload');
});

test('ICNS also uses simple at physical 16/32px, full at 64px and above', () => {
  const chunks = readIcnsChunks(read('src-tauri/icons/icon.icns'));
  const pngSizes = { ic11: 32, ic12: 64, ic07: 128, ic08: 256, ic13: 256,
    ic09: 512, ic14: 512, ic10: 1024 };
  assert.deepEqual([...chunks.keys()].sort(), [...Object.keys(pngSizes), 'is32', 's8mk', 'il32', 'l8mk'].sort());
  for (const [type, size] of Object.entries(pngSizes)) {
    checkImage(decodePng(chunks.get(type)), size, size <= 32 ? 'simple' : 'full', `icns:${type}`);
  }
  for (const [rgb, alpha, size] of [['is32', 's8mk', 16], ['il32', 'l8mk', 32]]) {
    checkImage(decodeLegacyIcns(chunks.get(rgb), chunks.get(alpha), size), size, 'simple', `icns:${rgb}`);
  }
});
