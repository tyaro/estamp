import { readFileSync } from 'node:fs';

// Read the bundled TrueType font's advances and ink boxes without installing a
// font or adding a renderer dependency. This checks geometry, not rasterization.
export function bundledStampMetrics() {
  const bytes = readFileSync(new URL('../../public/fonts/shipporiminchob1/ShipporiMinchoB1-Bold.ttf', import.meta.url));
  const tables = {};
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    tables[bytes.toString('ascii', at, at + 4)] = bytes.readUInt32BE(at + 8);
  }
  const units = bytes.readUInt16BE(tables.head + 18);
  const longLoca = bytes.readInt16BE(tables.head + 50) === 1;
  const advances = bytes.readUInt16BE(tables.hhea + 34);
  let cmap;
  for (let i = 0; i < bytes.readUInt16BE(tables.cmap + 2); i++) {
    const at = tables.cmap + 4 + i * 8;
    const offset = tables.cmap + bytes.readUInt32BE(at + 4);
    if (bytes.readUInt16BE(offset) === 12) { cmap = offset; break; }
  }
  if (cmap === undefined) throw new Error('Bundled font must have cmap format 12');
  const glyphFor = code => {
    for (let i = 0; i < bytes.readUInt32BE(cmap + 12); i++) {
      const at = cmap + 16 + i * 12;
      const start = bytes.readUInt32BE(at), end = bytes.readUInt32BE(at + 4);
      if (code >= start && code <= end) return bytes.readUInt32BE(at + 8) + code - start;
    }
    throw new Error(`Missing glyph U+${code.toString(16)}`);
  };
  const glyphOffset = glyph => tables.glyf + (longLoca
    ? bytes.readUInt32BE(tables.loca + glyph * 4)
    : bytes.readUInt16BE(tables.loca + glyph * 2) * 2);
  return {
    font: '', textAlign: '', textBaseline: '',
    measureText(text) {
      const size = Number(this.font.match(/ ([\d.]+)px/)[1]);
      let width = 0, left = Infinity, right = -Infinity, top = 0, bottom = 0;
      for (const char of text) {
        const glyph = glyphFor(char.codePointAt(0));
        const at = glyphOffset(glyph);
        if (at !== glyphOffset(glyph + 1)) {
          left = Math.min(left, width + bytes.readInt16BE(at + 2));
          bottom = Math.min(bottom, bytes.readInt16BE(at + 4));
          right = Math.max(right, width + bytes.readInt16BE(at + 6));
          top = Math.max(top, bytes.readInt16BE(at + 8));
        }
        width += bytes.readUInt16BE(tables.hmtx + Math.min(glyph, advances - 1) * 4);
      }
      const scale = size / units;
      return { width: width * scale,
        actualBoundingBoxLeft: (width / 2 - left) * scale,
        actualBoundingBoxRight: (right - width / 2) * scale,
        actualBoundingBoxAscent: top * scale, actualBoundingBoxDescent: -bottom * scale };
    },
  };
}
