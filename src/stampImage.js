import { Canvg } from 'canvg';
import { loadStampFonts } from './fonts.js';

export const STAMP_FONT = 'estamp Shippori Mincho B1';
const escapeXml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

/** @type {CanvasRenderingContext2D | null | undefined} */
let measurementContext;
function getMeasurementContext() {
  if (typeof document === 'undefined') return null;
  return measurementContext ??= document.createElement('canvas').getContext('2d');
}

/** @param {import('./store').Setting} settings */
export function validateImageSettings(settings) {
  for (const key of ['top_font_size', 'mid_font_size', 'btm_font_size']) {
    if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 400) {
      throw new Error('文字サイズは1〜400の整数で入力してください');
    }
  }
  if (!Number.isInteger(settings.output_size) || settings.output_size < 1 || settings.output_size > 4096) {
    throw new Error('出力サイズは1〜4096pxの整数で入力してください');
  }
}

/** One source for the inline preview and the Canvas renderer. No external SVG image
 * is created: Canvg draws text with this document's loaded FontFaceSet. This avoids
 * losing CSS fonts in an Image decoder and re-embedding ~30MB on every click.
 *
 * Call after loadStampFonts. Each row is uniformly reduced to its vertical band,
 * then compressed horizontally. The corner of each band stays inside the circle's
 * inner radius (184); the dividers at 155/245 also have clearance. Requested sizes
 * remain unchanged in settings. The conservative fallback is for DOM-free tests.
 * @param {import('./store').Setting} settings
 * @param {string} date
 * @param {{ context?: Pick<CanvasRenderingContext2D, 'font' | 'textAlign' | 'textBaseline' | 'measureText'> | null }} options
 */
export function buildStampSvg(settings, date, { context = getMeasurementContext() } = {}) {
  const row = (text, size, weight, y, bandWidth, bandHeight) => {
    if (context) {
      context.font = `${weight} ${size}px "${STAMP_FONT}"`;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
    }
    const metrics = context?.measureText(text);
    // Include ink overhangs as well as the advance width, relative to the center.
    const width = Math.max(metrics?.width ?? Array.from(text).length * size * 1.2,
      2 * (metrics?.actualBoundingBoxLeft ?? 0), 2 * (metrics?.actualBoundingBoxRight ?? 0));
    const ascent = metrics?.actualBoundingBoxAscent ?? size * 0.9;
    const descent = metrics?.actualBoundingBoxDescent ?? size * 0.3;
    const fit = Math.min(1, bandHeight / Math.max(size, ascent + descent));
    const scaleX = Math.min(fit, bandWidth / (width || 1));
    const baseline = y + (ascent - descent) * fit / 2;
    return `<text font-family="'${STAMP_FONT}'" font-weight="${weight}" font-size="${size}" transform="translate(200 ${baseline}) scale(${scaleX} ${fit})" x="0" y="0" fill="#C74332" text-anchor="middle" dominant-baseline="alphabetic">${escapeXml(text)}</text>`;
  };
  return `<svg id="stamp" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 400 400"><circle stroke="#C74332" cx="200" cy="200" r="192" fill="none" stroke-width="16"/><path d="M20 155H380 M20 245H380" fill="none" stroke="#C74332" stroke-width="5"/>${row(settings.top_str, settings.top_font_size, 700, 100, 220, 80)}${row(date, settings.mid_font_size, 400, 200, 340, 70)}${row(settings.btm_str, settings.btm_font_size, 700, 300, 220, 80)}</svg>`;
}

/** Await fonts, all renderer resources and drawing, then read RGBA. Canvas stays
 * transparent and its backing size is independent of screen DPI / preview size.
 * @param {string} svg
 * @param {number} size
 */
export async function renderStampImage(svg, size, {
  waitFonts = loadStampFonts,
  createCanvas = () => document.createElement('canvas'),
  renderer = Canvg,
} = {}) {
  if (!Number.isInteger(size) || size < 1 || size > 4096) throw new Error('出力サイズは1〜4096pxの整数で入力してください');
  await waitFonts();
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作成できません');
  const drawing = renderer.fromString(ctx, svg, { ignoreAnimation: true, ignoreMouse: true });
  drawing.resize(size, size, 'xMidYMid meet');
  await drawing.render();
  const { data, width, height } = ctx.getImageData(0, 0, size, size);
  // Tauri accepts Uint8Array. Share ImageData's buffer rather than copying up to
  // 64 MiB; this image is never mutated before the clipboard transfer completes.
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height };
}
