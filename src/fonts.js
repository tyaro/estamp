/** Wait for the bundled faces before SVG preview or Canvas rendering.
 * @param {FontFaceSet} fonts
 */
export async function loadStampFonts(fonts = document.fonts) {
  const faces = await Promise.all([400, 700].map(weight =>
    fonts.load(`${weight} 16px "Shippori Mincho B1"`, '所属名前令和0123456789')));
  if (faces.some(loaded => loaded.length === 0)) {
    throw new Error('同梱の印影書体が見つかりません');
  }
}
