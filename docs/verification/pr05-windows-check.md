# PR-05 Windows 11 実機確認

2026-10-30 JST 作成。Windows実機の結果は末尾「2026-10-30 実施結果」に記録する。以下の空欄は再測定用とし、結果を `outputs/pr05-windows/` 等に保存する。PR-06のUI/CSP仕上げ、PR-07のMSIX・配布容量・更新試験とは分ける。

## 準備と安全な実行

Windows 11 x64、通常ユーザー、WebView2 Evergreen。OSビルド、CPU/RAM、DPI、WebView2、Node/Yarn/Rustの版、コミット、EXE SHA-256、Officeの有無と版を記録する。依存導入済みの環境で [開発手順](../development.md) に従い、ビルドは1つずつ、lock不変・オフラインで行う。

実行例は PowerShell 7 の `pwsh -NoProfile -STA -File` を使う。`scripts/verify/*.ps1` は日本語を含むため **UTF-8 BOM付き**で保存し、編集時もBOMを保持する。`.gitattributes` の `-text` でGitのテキスト変換を無効にし、BOM付きのバイト列をそのまま保持する。Windows PowerShell 5.1ではBOMなしUTF-8の日本語を誤読するため、`powershell.exe -NoProfile -STA -File` を使う場合もBOM付きの原本を実行する。

検証専用Windowsユーザーを使う。`Measure-Pr05.ps1` は `%APPDATA%\jp.tyaro.estamp` が既存なら停止し、既存設定には触らない。未存在時だけ試験用設定（部署名／髙橋 渡邊／令和7年10月22日）を作り、所有トークンを確認して自分が作った既知ファイルだけを後片付けする。`-SettingsSource` で任意の試験設定コピーを使用可能。既存設定の自動移動・上書き・復元はしない。異常終了後に残った場合も所有トークンと内容を人が確認するまで削除しない。

プロセス名で一括終了しない。計測スクリプトは自分が起動したestampのProcessオブジェクト・開始時刻だけを使って終了し、他のestamp、Paint、Office、WebView2を停止しない。子プロセスは親子関係・生成時刻で計測対象を限定する。Paint/Officeは手動試験とし、この検証で開いた文書・ウィンドウだけを閉じる。スクリプトはネットワーク設定・レジストリを変更しない。

## 1. 起動・書体・メモリを3回測る

計測専用EXEを作る。通常配布用とは別成果物としてハッシュを保存する。フロントとRustの両方をビルド時に有効化する必要がある。

```powershell
$env:COREPACK_ENABLE_NETWORK='0'
$env:VITE_PR05_MEASURE='1'
$env:ESTAMP_PR05_MEASURE='1'
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked --offline -j 2
Remove-Item Env:VITE_PR05_MEASURE
Remove-Item Env:ESTAMP_PR05_MEASURE
# target指定時は実際のEXEパスに合わせる
pwsh -NoProfile -STA -File scripts/verify/Measure-Pr05.ps1 `
  -Exe src-tauri/target/release/estamp.exe -OutputDirectory outputs/pr05-windows/startup-process-cold
```

起動ごとに15秒間、estampとそのWebView2子のWorkingSet64／PrivateMemorySize64を約100ms＋CIM列挙時間ごとに採取する。各PIDの生値、各サンプルの合計、最初・ピーク・終了時のprivate bytesと増加量、ナビゲーション開始とRust main開始からの3イベントをCSV出力する。Mincho 400/700だけで約30MB、UI 400/700もロード待ちする。`MissingMetrics=True` は未計測であり合格にしない。

フックは `window.__estampPerformance`、`performance` marks、consoleにも値を出す。`first-window-paint` は二重requestAnimationFrame後の描画機会の近似、`first-stamp-render` は書体完了・DOM flush後の二重requestAnimationFrame。JS値はナビゲーション開始基準。CSV第3列のnative値はRust main開始→IPC受信時点で、起動からの近似として使う（IPC遅延を含み、mainに入る前のOSローダ時間を含まない）。`WindowHandleMs` はStart-Process前から初めてMainWindowHandleを観測するまでの時間であり、画面の実ペイントを保証しない。画面録画（60fps等）でプロセス起動→最初のウィンドウ描画→印影表示を照合し、実測値も別欄に残す。必要なら外部WPR等を併用し、近似値を実ペイント時間と扱わない。

`summary.csv` とコンソールの判定は `WindowHandleStatus`（Handle観測）、`JsPaintApproximationStatus`（JSイベントに基づくRust main基準の描画近似）、`ScreenRecordingPaintStatus`（画面録画）に分ける。前二者は独立に暫定1秒と比較し、欠測は「未観測／未計測」とする。スクリプトは録画を採取・判定しないため、録画列は常に **実ペイント未確認** と出す。録画による実測値・判定・証拠は別途記録する。

既定3回は**プロセスのコールドスタート**で、OSのファイルキャッシュは残る。本来のコールドスタート3回はPC再起動後に `-Runs 1` で別の出力先（cold-1/2/3）へ実施する。共有PCのキャッシュを削除しない。再起動できなければ未実施と明記する。

暫定の要確認閾値: 初回ウィンドウ描画 **1秒超**、書体ready **3秒超**、プロセス群の合計private memory増加 **300MiB超**（PowerShellの `1MB` = 1MiB）。実ペイント・fonts-readyの開始基準を添える。CSVのメモリ増加は最初の観測時点→ピークで、観測開始以前の割当は含まれない。絶対ピーク・終了時・Working Setも記録し、負荷／ページキャッシュ条件を添えて評価する。閾値は出荷判定の確定値ではない。

| 回 | 再起動/負荷 | 実ウィンドウ描画ms | Handle観測ms | fonts-ready ms（native main） | 印影ms（native main） | 合計WS 最初/最大/終了MiB | 合計private 最初/最大/終了MiB | 増加MiB | 判定 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 未測定 | | | | | | | | |
| 2 | 未測定 | | | | | | | | |
| 3 | 未測定 | | | | | | | | |

## 2. OS書体に依存しない字形

```powershell
pwsh -NoProfile -STA -File scripts/verify/Get-Pr05Fonts.ps1 `
  -OutputDirectory outputs/pr05-windows/fonts -Dist dist
```

HKLM/HKCUのFontsレジストリ一覧とInstalledFontCollectionを保存する。**estamp Shippori Mincho B1**、**estamp BIZ UDPGothic** の別名がOS/ユーザーに未登録であること、Shippori Mincho B1原名も未インストールであることを確認する。Windowsに原名のBIZ UDPGothicが既存でもよい（Windows標準の場合がある）。別名への `local()` 指定はなく、同梱TTFだけが別名の供給元となる。既存書体をアンインストールしない。条件が揃わなければ別の検証ユーザー/PCを使う。

部署名／髙橋／渡邊／令和7年10月22日／長い名前（例「国際事業推進部 髙橋渡邊」）を入力し、各文字サイズを変えて保存・再起動でも復元することを確認する。上段下段700、日付400の字形・異体字・欠字・収まりを見る。PR #10 round 1修正後はロード済み書体の実測幅で横縮小し、帯の高さへ縦横同率で自動縮小する（保存する設定サイズは保持）。`W`の30文字連続と三段すべて400の設定も試し、円枠・隣接行・区切り線へのはみ出しがプレビューと出力の両方にないことを確認する。小さすぎる文字サイズでは可読性の限界も記録する。

各ケースで印影クリック後、次のスクリプトでPNGとプレビューcropを取得する。cropの `Left/Top/Width/Height` はすべて物理画面px。**CSS px × 表示倍率 = 物理px**なので、100 CSS pxのプレビューはDPI100%で100物理px、150%で150物理px、200%で200物理pxとなる。左上座標は実際の画面キャプチャから確認し、印影だけを正確に囲む（必要に応じWindowsスクリーンショットを手動cropする）。ポインターは印影から退避し、プレビューが前面で隠れていないことを確認してから取得する。出力PNGの実寸はDPIによらず `ExpectedSize` のまま。

DPI100%、プレビュー100pxと出力100pxが比較しやすい。白背景のプレビューに合わせPNGを白へ合成して重ねる／拡大比較し、特に髙・邊・和暦の字形を確認する。SVGとCanvasのアンチエイリアス差はあり得るため、差分ゼロだけを合格条件にしない。crop原本、PNG原本、比較画像、差異と判定を保存する。

```powershell
# DPI100%の例。Left/Topは実画面に合わせる。
pwsh -NoProfile -STA -File scripts/verify/Get-Pr05Clipboard.ps1 `
  -OutputDirectory outputs/pr05-windows/glyph-100 -ExpectedSize 100 `
  -Left 100 -Top 100 -Width 100 -Height 100

# DPI150%の実機例: 100 CSS pxを150×150物理pxで取得、PNGは100×100px。
# ポインターを退避し、Left/Topは実画面で再確認する。
pwsh -NoProfile -STA -File scripts/verify/Get-Pr05Clipboard.ps1 `
  -OutputDirectory outputs/pr05-windows/glyph-100-dpi150 -ExpectedSize 100 `
  -Left 105 -Top 40 -Width 150 -Height 150
```

## 3. 画像・連続操作・貼り付け

PR #10 round 1修正後のアプリはPNGをエンコードせず、書体待機→Canvg描画→Canvas RGBA取得→`Image.new`→`writeImage`で渡す。RGBAはImageDataと同じバッファのビューを使う。PNG／DIB等はプラグイン／OS側の提供形式であり、以下のPNG採取はアプリ内エンコードの検証ではない。末尾の既存実機結果は修正前の記録で、修正後のWindows再確認は未実施。

出力50/100/200pxをそれぞれ指定してコピーし、別の出力先で上のClipboardスクリプトを実行する。`formats-native.txt` と `formats-converted.txt` を区別し、PNG/DIB/DIBV5/Bitmap等の実際の形式、縦横が指定pxと一致、透明画素と有色画素が両方あることを記録する。四隅は透明、枠と日本語は有色、背景が白で埋まらないことも画像編集アプリで見る。

ネイティブPNGがあればstream原本を保存する。なければWindows Bitmapから保存したPNGと明記する。この場合、検証スクリプトでのPNG保存成功とOSクリップボードでのalpha保持を分けて判定し、DIBV5/貼付先でのalphaが失われたら不合格/要調査とする。PowerShell GetImageによる変換でalphaが失われる可能性も結果に添える。スクリプト側だけの再PNG化をOSのネイティブPNG提供の証明としない。

連続クリック10回で多重コピー・空画像・エラーが出ないこと、コピー待機中に上段/下段/サイズ/日付を変えたときは中止の日本語メッセージが出て再クリックで最新画像になることを確認する。小さい画像では処理が速いので、必要なら4096pxで待機を発生させる。未入力/0/小数/範囲外サイズは画面エラー、保存・コピー無効、訂正後は復旧。書体読込失敗、設定保存先の書込不可、クリップボード占有時の失敗表示と再試行も可能な範囲で確認し、再現できなければ未確認と記録する。権限は書込み画像のみで読取りなし。

PaintにCtrl+Vし、指定サイズ・字形・空画像でないことを確認する。Paintの白キャンバス表示だけでalpha消失と判定しない。Officeインストール有無を記録し、あればこの検証用に新規起動したWord/Excelの空文書に貼付け、字形・大きさ・欠け・透過を確認する（OfficeがDPI換算した表示寸法とPNGのpxを混同しない）。既存文書は触らず、検証文書だけを保存せず閉じる。Officeなしは「未導入／未実施」とする。

| サイズ/文字列 | 形式 | 縦横px | alpha | Paint | Word（有無/版） | Excel（有無/版） | 連続/変更中止 | 証跡 |
|---|---|---|---|---|---|---|---|---|
| 50 | 未実施 | | | | | | | |
| 100 | 未実施 | | | | | | | |
| 200 | 未実施 | | | | | | | |
| 長い氏名/和暦 | 未実施 | | | | | | | |

## 4. オフラインと通常ビルド

検証PCで手動でWi-Fi/有線を無効にして起動・編集・保存・コピー・ライセンス画面を確認し、その後元の接続状態に戻す。共有PCで回線を切れない場合は明記し、最低限 `Get-Pr05Fonts.ps1` のdist検査結果（外部フォントURL候補なし）、4本のTTF/OFLハッシュと原本一致を記録する。検査はフォント参照に限定し、WebView2/OS更新等も含めた「PC全体に通信なし」を証明するものではない。DevToolsは必須でない。

最後に計測用環境変数を外した通常ビルドを同じ手順で作り、起動・画像コピーを再確認する。計測ファイル出力が無効で通常UIに計測値が出ないことを確認する。正式配布物のCSP、MSIX、DPI150/200%の総合判定はPR-06/07/08へ渡す。

## 2026-10-30 実施結果

03:41 JST、MSI PC、対象 `eb4df78`。Windows 11 Pro 26H2（26300.9711）、Core Ultra 7 155H／RAM 31.7 GiB、DPI150%、WebView2 156.0.4314.50、Word/Excel 16.0.20527.20088。Node 24.22.1／Yarn 1.22.22／Rust・Cargo stable 1.99.1を使用（固定Rust 1.95.0は未検証）。通常ユーザー・他作業あり、OS再起動・キャッシュ削除・回線遮断なし。計測／通常ビルドは `--locked --offline -j 2` で順次成功した。元レポートは `outputs/pr05-windows-result.md`、実機証拠は `C:\Users\TKent\Documents\Codex\outputs\pr05` に保存。

- **基本経路は合格（DPI150%）:** OS未登録の同梱別名 `estamp Shippori Mincho B1` / `estamp BIZ UDPGothic` で部署名・髙・邊・和暦の欠字／別字なし。BIZ原名はOSに存在するが、`local()` なしで同梱TTFを使用。4本TTF・2本OFLのハッシュは原本一致。文字列・文字サイズ・日付・出力サイズの保存と再起動復元も確認した。
- **画像・操作は合格:** 50/100/200pxすべて指定実寸のネイティブPNGで、透明／部分透明／不透明画素と四隅alpha=0を確認。100pxの同一PNGをPaint／Word／Excelへ貼り付け、字形・枠・透明な内部を確認し、空画像・文字化け・欠けなし（Office表示寸法とPNG実寸は区別）。200pxで10回連続クリック後もエラー・空画像なし、最終PNGのハッシュ一致。未入力／0／1.5／4097pxは日本語エラー・保存／コピー無効、100pxへの訂正で復旧した。
- **外部フォント・通常ビルドは確認済み:** distに外部フォントURL候補なし。通常ビルドのWebView2 NetLogではフォント要求4件すべて同梱TTF、外部フォント要求0。`edge.microsoft.com` への基盤通信はあり、PC全体の無通信は主張しない。通常ビルドで起動・コピー・ライセンス表示ができ、`ESTAMP_PR05_METRICS` 指定時も計測CSVなし、UIへの計測値表示なし。

全estamp終了後のプロセスコールドスタート3回（OSキャッシュは残存）、各15秒の測定。時間はms、private増加はMiB（最初の観測→ピーク、観測前の割当を含まない）。描画はJSイベントによる近似で、実ペイントではない。

| 回 | Handle観測 | 描画近似（Rust main基準） | fonts-ready（同） | 初回印影（同） | JS navigation基準 描画/書体/印影 | private増加 | 画面録画による実ペイント |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 1 | 946 | 2278 | 2660 | 2682 | 253 / 713 / 733 | 309.5 | 実ペイント未確認 |
| 2 | 647 | 1824 | 2180 | 2186 | 244 / 665 / 672 | 263.6 | 実ペイント未確認 |
| 3 | 583 | 1730 | 2172 | 2179 | 372 / 1098 / 1105 | 266.0 | 実ペイント未確認 |

`MissingMetrics=False` は全3回。JS navigation基準のfonts-readyは全回 **1.1秒未満**であり、Rust main→描画近似の遅延の大部分は書体待ちよりnavigation前（WebView2起動等）にあるとみられる。ただしRust main基準はIPC遅延を含み、main前のOSローダ時間は含まない。Handle観測は全回1秒以内だが実描画の証拠にはならない。

**暫定閾値超過で要調査:** 描画近似は全回1秒超、private増加は1回目309.5MiBで300MiBを9.5MiB超過。fonts-ready（Rust main基準）は全回3秒以内。画面から時刻を判定する試行は背面化して他アプリの画素を拾ったため不採用とし、実ペイント1秒の合否は未確認。次は画面録画による実ペイント測定と、負荷・観測条件を記録したメモリ再測定を行う。結果を確認してから、PR-03の方針どおり必要ならまず **BIZ UDPGothicのみのサブセット化**を検討する。

**未確認:** 実ペイント時刻、コピー処理中の入力変更による中止経路（4096pxの試行では変更が完了後に反映）、書体読込失敗／設定保存先書込不可／クリップボード占有時の失敗表示と再試行、DPI100%での比較、回線遮断下での起動・編集・保存・コピー。ネット接続下の代替検査をオフライン試験の合格とは扱わない。

**デザインレビュー:** 「国際事業推進部 髙橋渡邊」は枠内に収まるが、100pxでは横縮小で密集し判読しづらい。文字サイズ・余白の評価を引き継ぐ。

実機で必要だったBOM付きコピーでの実行を踏まえ、本PRでPowerShell3本をUTF-8 BOM付きに修正し、`pwsh` の実行例、判定3列への分離、DPI換算cropとポインター退避を追記した。修正後スクリプトのWindows再実行は未実施。
