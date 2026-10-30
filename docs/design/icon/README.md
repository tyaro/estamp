# 案A アプリアイコン

## 元データとサイズの使い分け

- [icon-full.svg](icon-full.svg): 文字入り（中央に R8）。48px以上。
- [icon-simple.svg](icon-simple.svg): 簡略版（円枠と二本の水平線）。32px以下。
- 両方とも透明背景、朱色 #C74332。文字はパスなのでフォントは不要。

| 配布ファイル / エントリー | 実ピクセル寸法 | 元 SVG |
| --- | --- | --- |
| 32x32.png / Square30x30Logo.png | 32 / 30 | simple |
| Square44x44Logo.png | 44 | simple（例外、下記） |
| StoreLogo.png | 50 | full |
| Square71x71Logo.png / Square89x89Logo.png / Square107x107Logo.png | 71 / 89 / 107 | full |
| 128x128.png / Square142x142Logo.png / Square150x150Logo.png | 128 / 142 / 150 | full |
| 128x128@2x.png / Square284x284Logo.png / Square310x310Logo.png / icon.png | 256 / 284 / 310 / 512 | full |
| icon.ico | 16 / 24 / 32 | simple |
| icon.ico | 48 / 64 / 256 | full |
| icon.icns: is32+s8mk / il32+l8mk / ic11 | 16 / 32 / 32 | simple |
| icon.icns: ic12 / ic07 / ic08 / ic13 / ic09 / ic14 / ic10 | 64 / 128 / 256 / 256 / 512 / 512 / 1024 | full |

Square44x44Logo は Windows の小さなアプリ一覧などで32px以下に縮小表示される
用途を考慮し、文字の潰れを避けるため簡略版を採用する。
50px の StoreLogo と71px以上のタイル用画像は文字入り。
ICNS は Retina の論理サイズではなく、格納画像の実ピクセル寸法で使い分ける。
既存のファイル名と tauri.conf.json の bundle.icon の5項目は維持する。

## オフラインでの再生成

リポジトリ直下で実行する。インストール済みの @tauri-apps/cli 2.12.4 は
SVG を直接入力できるため、中間 PNG への変換は不要。新しい依存やネットワークは使わない。
Node.js 標準 API だけで ICO と ICNS を組み合わせる。
CLI のモバイル向け画像などは outputs/ に留め、既存のデスクトップ用ファイルだけを更新する。
確認用 PNG と使い捨てスクリプトを含む outputs/ は gitignore 済み。

```sh
mkdir -p outputs/pr06b-icons
node node_modules/@tauri-apps/cli/tauri.js icon docs/design/icon/icon-full.svg --output outputs/pr06b-icons/full
node node_modules/@tauri-apps/cli/tauri.js icon docs/design/icon/icon-simple.svg --output outputs/pr06b-icons/simple
node node_modules/@tauri-apps/cli/tauri.js icon docs/design/icon/icon-simple.svg --output outputs/pr06b-icons/simple-sizes -p 16 -p 24 -p 32
node node_modules/@tauri-apps/cli/tauri.js icon docs/design/icon/icon-full.svg --output outputs/pr06b-icons/full-sizes -p 48 -p 64 -p 256
```

次の内容を一時ファイル outputs/pr06b-icons/assemble.mjs として保存する。
ICO は6個の透過 PNG を埋め込み、ICNS は CLI のチャンク構成を維持して小サイズを差し替える。

```js
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const work = 'outputs/pr06b-icons';
const dest = 'src-tauri/icons';
const simplePngs = new Set(['32x32.png', 'Square30x30Logo.png', 'Square44x44Logo.png']);
const pngs = [
  '32x32.png', '128x128.png', '128x128@2x.png', 'icon.png',
  'Square30x30Logo.png', 'Square44x44Logo.png', 'Square71x71Logo.png',
  'Square89x89Logo.png', 'Square107x107Logo.png', 'Square142x142Logo.png',
  'Square150x150Logo.png', 'Square284x284Logo.png', 'Square310x310Logo.png', 'StoreLogo.png',
];
for (const name of pngs) {
  copyFileSync(`${work}/${simplePngs.has(name) ? 'simple' : 'full'}/${name}`, `${dest}/${name}`);
}

// ICO: PNG payloads, with 0 representing 256 in the one-byte size fields.
const sizes = [16, 24, 32, 48, 64, 256];
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
const payloads = sizes.map((size, i) => {
  const source = size <= 32 ? 'simple' : 'full';
  const png = readFileSync(`${work}/${source}-sizes/${size}x${size}.png`);
  const p = 6 + 16 * i;
  header[p] = header[p + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(png.length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += png.length;
  return png;
});
writeFileSync(`${dest}/icon.ico`, Buffer.concat([header, ...payloads]));

// Keep Tauri's ICNS types/order; replace 16px/32px RGB, masks and Retina PNG.
function chunks(variant) {
  const data = readFileSync(`${work}/${variant}/icon.icns`);
  const result = [];
  for (let p = 8; p < data.length;) {
    const length = data.readUInt32BE(p + 4);
    result.push(data.subarray(p, p + length));
    p += length;
  }
  return result;
}
const smallTypes = new Set(['is32', 's8mk', 'il32', 'l8mk', 'ic11']);
const simpleChunks = new Map(chunks('simple').map(chunk => [chunk.toString('ascii', 0, 4), chunk]));
const combined = chunks('full').map(chunk => {
  const type = chunk.toString('ascii', 0, 4);
  return smallTypes.has(type) ? simpleChunks.get(type) : chunk;
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns');
icnsHeader.writeUInt32BE(8 + combined.reduce((sum, chunk) => sum + chunk.length, 0), 4);
writeFileSync(`${dest}/icon.icns`, Buffer.concat([icnsHeader, ...combined]));
```

```sh
node outputs/pr06b-icons/assemble.mjs
node --test tests/icons.test.js
YARN_OFFLINE=true COREPACK_ENABLE_NETWORK=0 yarn run check
(cd src-tauri && cargo test --locked --offline -j 2)
YARN_OFFLINE=true COREPACK_ENABLE_NETWORK=0 yarn build
```

ビルド・検査は上記の順に1つずつ完了させる。
package.json を変更しないため、新規アイコン検査は既存 check と別に実行する。

## 検査の固定値

tests/icons.test.js は、全14 PNG、ICO の全6エントリー、ICNS の全画像を検査する。
PNG の IHDR と展開した RGBA、ICO ヘッダー（0 は256px）、ICNS の PNG / RLE と
アルファマスクを読み、寸法・透過・不透明な印影・アンチエイリアス・中央の文字の有無を確認する。
既存のファイル一覧と bundle.icon の一覧も固定している。

tests/fixtures/icon-pixels.json は元 SVG の SHA-256 と、各画像の展開後 RGBA の
SHA-256 および元の版を記録する。固定値は組み立て後の配布物からではなく、上記 CLI が
各元 SVG から生成した outputs/pr06b-icons/{full,simple,full-sizes,simple-sizes}/ の
対応画像・ICNS チャンクから採取した。PNG の圧縮方式だけが変わっても画素が同じなら通る。
元 SVG や描画結果を意図して変更する場合だけ、その出力を目視確認し、対応する固定値を更新する。
検査失敗を解消する目的で配布物から固定値を取り直さない。
