# PR-05 Windows 11 実機確認

2026-10-30 JST 作成。Mac段階ではWindows実機・PowerShell実行は未検証。本書の空欄は次の担当者が実測で埋め、結果を `outputs/pr05-windows/` 等に保存する。PR-06のUI/CSP仕上げ、PR-07のMSIX・配布容量・更新試験とは分ける。

## 準備と安全な実行

Windows 11 x64、通常ユーザー、WebView2 Evergreen。OSビルド、CPU/RAM、DPI、WebView2、Node/Yarn/Rustの版、コミット、EXE SHA-256、Officeの有無と版を記録する。依存導入済みの環境で [開発手順](../development.md) に従い、ビルドは1つずつ、lock不変・オフラインで行う。

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
powershell.exe -NoProfile -STA -File scripts/verify/Measure-Pr05.ps1 `
  -Exe src-tauri/target/release/estamp.exe -OutputDirectory outputs/pr05-windows/startup-process-cold
```

起動ごとに15秒間、estampとそのWebView2子のWorkingSet64／PrivateMemorySize64を約100ms＋CIM列挙時間ごとに採取する。各PIDの生値、各サンプルの合計、最初・ピーク・終了時のprivate bytesと増加量、ナビゲーション開始とRust main開始からの3イベントをCSV出力する。Mincho 400/700だけで約30MB、UI 400/700もロード待ちする。`MissingMetrics=True` は未計測であり合格にしない。

フックは `window.__estampPerformance`、`performance` marks、consoleにも値を出す。`first-window-paint` は二重requestAnimationFrame後の描画機会の近似、`first-stamp-render` は書体完了・DOM flush後の二重requestAnimationFrame。JS値はナビゲーション開始基準。CSV第3列のnative値はRust main開始→IPC受信時点で、起動からの近似として使う（IPC遅延を含み、mainに入る前のOSローダ時間を含まない）。`WindowHandleMs` はStart-Process前から初めてMainWindowHandleを観測するまでの時間であり、画面の実ペイントを保証しない。画面録画（60fps等）でプロセス起動→最初のウィンドウ描画→印影表示を照合し、実測値も別欄に残す。必要なら外部WPR等を併用し、近似値を実ペイント時間と扱わない。

既定3回は**プロセスのコールドスタート**で、OSのファイルキャッシュは残る。本来のコールドスタート3回はPC再起動後に `-Runs 1` で別の出力先（cold-1/2/3）へ実施する。共有PCのキャッシュを削除しない。再起動できなければ未実施と明記する。

暫定の要確認閾値: 初回ウィンドウ描画 **1秒超**、書体ready **3秒超**、プロセス群の合計private memory増加 **300MB超**。実ペイント・fonts-readyの開始基準を添える。CSVのメモリ増加は最初の観測時点→ピークで、観測開始以前の割当は含まれない。絶対ピーク・終了時・Working Setも記録し、負荷／ページキャッシュ条件を添えて評価する。閾値は出荷判定の確定値ではない。

| 回 | 再起動/負荷 | 実ウィンドウ描画ms | Handle観測ms | fonts-ready ms（native main） | 印影ms（native main） | 合計WS 最初/最大/終了MB | 合計private 最初/最大/終了MB | 増加MB | 判定 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 未測定 | | | | | | | | |
| 2 | 未測定 | | | | | | | | |
| 3 | 未測定 | | | | | | | | |

## 2. OS書体に依存しない字形

```powershell
powershell.exe -NoProfile -STA -File scripts/verify/Get-Pr05Fonts.ps1 `
  -OutputDirectory outputs/pr05-windows/fonts -Dist dist
```

HKLM/HKCUのFontsレジストリ一覧とInstalledFontCollectionを保存する。**estamp Shippori Mincho B1**、**estamp BIZ UDPGothic** の別名がOS/ユーザーに未登録であること、Shippori Mincho B1原名も未インストールであることを確認する。Windowsに原名のBIZ UDPGothicが既存でもよい（Windows標準の場合がある）。別名への `local()` 指定はなく、同梱TTFだけが別名の供給元となる。既存書体をアンインストールしない。条件が揃わなければ別の検証ユーザー/PCを使う。

部署名／髙橋／渡邊／令和7年10月22日／長い名前（例「国際事業推進部 髙橋渡邊」）を入力し、各文字サイズを変えて保存・再起動でも復元することを確認する。上段下段700、日付400の字形・異体字・欠字・収まりを見る。長い文字列は横方向に縮小する。小さすぎる文字サイズでは可読性の限界も記録する。

各ケースで印影クリック後、次のスクリプトでPNGとプレビューcropを取得する。crop座標は物理画面px、印影だけを正確に囲む（必要に応じWindowsスクリーンショットを手動cropする）。DPI100%、プレビュー100pxと出力100pxが比較しやすい。白背景のプレビューに合わせPNGを白へ合成して重ねる／拡大比較し、特に髙・邊・和暦の字形を確認する。SVGとCanvasのアンチエイリアス差はあり得るため、差分ゼロだけを合格条件にしない。crop原本、PNG原本、比較画像、差異と判定を保存する。

```powershell
powershell.exe -NoProfile -STA -File scripts/verify/Get-Pr05Clipboard.ps1 `
  -OutputDirectory outputs/pr05-windows/glyph-100 -ExpectedSize 100 `
  -Left 100 -Top 100 -Width 100 -Height 100
```

## 3. 画像・連続操作・貼り付け

出力50/100/200pxをそれぞれ指定してコピーし、別の出力先で上のClipboardスクリプトを実行する。`formats-native.txt` と `formats-converted.txt` を区別し、PNG/DIB/DIBV5/Bitmap等の実際の形式、縦横が指定pxと一致、透明画素と有色画素が両方あることを記録する。四隅は透明、枠と日本語は有色、背景が白で埋まらないことも画像編集アプリで見る。

ネイティブPNGがあればstream原本を保存する。なければWindows Bitmapから保存したPNGと明記する。この場合、PNG生成成功とOSクリップボードでのalpha保持を分けて判定し、DIBV5/貼付先でのalphaが失われたら不合格/要調査とする。PowerShell GetImageによる変換でalphaが失われる可能性も結果に添える。スクリプト側だけの再PNG化をアプリのネイティブPNG証明としない。

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
