import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

// The local Tauri CLI emits non-interlaced, 8-bit RGBA PNGs.
export function decodePng(data) {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let width, height;
  const compressed = [];
  let ended = false;
  for (let p = 8; p < data.length;) {
    const length = data.readUInt32BE(p);
    assert.ok(p + 12 + length <= data.length, 'PNG chunk bounds');
    const type = data.toString('ascii', p + 4, p + 8);
    const body = data.subarray(p + 8, p + 8 + length);
    if (type === 'IHDR') {
      assert.equal(p, 8);
      assert.equal(length, 13);
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.deepEqual([...body.subarray(8)], [8, 6, 0, 0, 0], '8-bit RGBA, no interlacing');
    } else if (type === 'IDAT') compressed.push(body);
    else if (type === 'IEND') {
      assert.equal(length, 0);
      assert.equal(p + 12, data.length);
      ended = true;
    }
    p += length + 12;
  }
  assert.ok(ended && width > 0 && height > 0);
  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  assert.equal(scanlines.length, (stride + 1) * height);
  const rgba = Buffer.alloc(stride * height);
  function paeth(a, b, c) {
    const p = a + b - c;
    const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return distances[0] <= distances[1] && distances[0] <= distances[2] ? a
      : distances[1] <= distances[2] ? b : c;
  }
  for (let y = 0; y < height; y++) {
    const filter = scanlines[y * (stride + 1)];
    assert.ok(filter <= 4, 'valid PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const a = x >= 4 ? rgba[i - 4] : 0;
      const b = y > 0 ? rgba[i - stride] : 0;
      const c = y > 0 && x >= 4 ? rgba[i - stride - 4] : 0;
      rgba[i] = scanlines[y * (stride + 1) + 1 + x]
        + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    }
  }
  return { width, height, rgba };
}

export function readIcnsChunks(data) {
  assert.equal(data.toString('ascii', 0, 4), 'icns');
  assert.equal(data.readUInt32BE(4), data.length);
  const chunks = new Map();
  for (let p = 8; p < data.length;) {
    const type = data.toString('ascii', p, p + 4);
    const length = data.readUInt32BE(p + 4);
    assert.ok(length >= 8 && p + length <= data.length, 'ICNS chunk bounds');
    assert.ok(!chunks.has(type), 'unique ICNS type');
    chunks.set(type, data.subarray(p + 8, p + length));
    p += length;
  }
  return chunks;
}

export function decodeLegacyIcns(rgb, alpha, size) {
  assert.equal(alpha.length, size * size);
  const rgba = Buffer.alloc(size * size * 4);
  let offset = 0;
  for (let channel = 0; channel < 3; channel++) {
    let pixel = 0;
    while (pixel < size * size) {
      assert.ok(offset < rgb.length);
      const control = rgb[offset++];
      const repeated = control >= 128;
      const count = repeated ? control - 125 : control + 1;
      assert.ok(pixel + count <= size * size);
      assert.ok(offset + (repeated ? 1 : count) <= rgb.length);
      for (let i = 0; i < count; i++) {
        rgba[(pixel++ * 4) + channel] = rgb[repeated ? offset : offset++];
      }
      if (repeated) offset++;
    }
  }
  assert.equal(offset, rgb.length);
  for (let i = 0; i < alpha.length; i++) rgba[i * 4 + 3] = alpha[i];
  return { width: size, height: size, rgba };
}
