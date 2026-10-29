import { Canvg } from 'canvg';
import { loadStampFonts } from './fonts.js';

export const STAMP_FONT = 'estamp Shippori Mincho B1';
const escapeXml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

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
 * @param {import('./store').Setting} settings
 * @param {string} date
 */
export function buildStampSvg(settings, date) {
  const row = (text, size, weight, y) => {
    const width = Array.from(text).reduce((sum, char) => sum + (/[^\x00-\x7F]/.test(char) ? 1 : 0.6), 0) * size;
    const scale = Math.min(1, 340 / (width || 1));
    return `<text font-family="'${STAMP_FONT}'" font-weight="${weight}" font-size="${size}" transform="translate(200 ${y}) scale(${scale} 1)" x="0" y="0" fill="#C74332" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
  };
  return `<svg id="stamp" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 400 400"><circle stroke="#C74332" cx="200" cy="200" r="192" fill="none" stroke-width="16"/><path d="M20 155H380 M20 245H380" fill="none" stroke="#C74332" stroke-width="5"/>${row(settings.top_str, settings.top_font_size, 700, 100)}${row(date, settings.mid_font_size, 400, 200)}${row(settings.btm_str, settings.btm_font_size, 700, 300)}</svg>`;
}

/** Await fonts, all renderer resources and drawing, then PNG encoding. Canvas stays
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
  const png = await new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('PNGを作成できません'));
  }, 'image/png'));
  const { data, width, height } = ctx.getImageData(0, 0, size, size);
  return { png, rgba: new Uint8Array(data), width, height };
}
