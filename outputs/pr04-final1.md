# PR-04 実装結果

対象: estamp、ブランチ `feat/pr-04-wareki-date`、基点 / 現 HEAD `8bc6ea9`（PR-01 マージ済み）。コミット・push・マージは実行していない。既存の未追跡 outputs ファイルは変更していない。他リポジトリ・worktree は操作していない。

## 範囲の根拠

- `docs/store/estamp-plan.md` の論点表と PR-04 の目的・受け入れ条件を基準とした。
- 和暦の範囲・解析・エラーは、依頼の確定仕様および `docs/design/estamp-design-rules.md` の第3節を優先した。計画書の「手入力の仕様」と PR-04「範囲の線引き」の2箇所を、和暦の直接入力を含む内容へ修正した。
- UI は依頼に従い既存の中段入力欄を利用した。元号・年月日の独立したプルダウンは増設せず、西暦／和暦の表示切替、確認表示、エラー、「今日に戻す」を追加した。
- PR-00 の別ブランチの変更は取り込んでいない。PR-02 の保存先変更・version付きストア・移行・破損復旧、PR-03 のフォント同梱、PR-05 の画像生成経路の完成、PR-06 の全面的な UI 仕上げは含まない。
- `src-tauri/tauri.conf.json` は無変更。起動時 250×120、最大 250×310 の既存設定を維持した。内容領域にスクロールを設け、サイズ設定を変えずに入力・保存へ到達できるようにした。

## 実装内容

### 日付・和暦

- `src/date.js` に日付の解析、正規化、検証、表示、自動／手動の状態遷移を分離した。追加依存はない。
- 内部値・保存値は時刻なしの `YYYY-MM-DD`。指定日の検証は数値計算で行い、`new Date(入力文字列)` や UTC 変換を使用しない。
- 今日だけは注入可能な時計の `getFullYear()` / `getMonth() + 1` / `getDate()` を利用する。
- 明治6年（1873-01-01）〜令和に対応。明治・大正・昭和・平成・令和の開始日テーブルで境界を判定する。
- `R7.10.22`、`令和7年10月22日`、`2025/10/22`、`2025-10-22`、既存の西暦ドット表記、`R元.5.1` を受け付ける。M/T/S/H/R は大小文字を区別せず、月日は1桁にも対応する。
- NFKC → 略号大文字化 → 元を1年として解釈。全角数字・全角記号・全角英字に対応する。元号なしは西暦4桁に限定する（数値表現の上限は西暦9999年）。
- 形式 → 実在日 → 元号期間の順で検証。1873-01-01 より前の実在日は「旧暦は未対応です」、0年は「令和0年は存在しません」等を表示する。
- 期間外の日付は補正せず、例として「平成32年10月22日は平成の期間外です。正しい表記は令和2年10月22日です。」と通知する。
- 西暦印影は `yyyy.mm.dd`、和暦印影は元年を使う完全な年月日表記。確認欄は `令和7年10月22日（2025/10/22）` の形式。
- 長い和暦は文字数と文字幅の概算から横方向を縮める。既存の Canvg には `textLength` / `lengthAdjust` の処理が見当たらないため、SVG と Canvas の両方で利用できる `translate` / `scale` を使用した。印影・コピーとも同じ SVG の日付文字列と変換を使う。

### 入力・日付更新・保存

- 入力を消さず、入力欄直下に `×` 付きの1行エラーを表示する。長文は横スクロール可能。`aria-invalid` / `aria-describedby` / `role="alert"` を付与した。
- エラー中は最後の正常な印影を維持し、保存・コピーを無効化する。自動日付更新も入力エラーを消したり、最後の正常値を置き換えたりしない。
- 自動モードは1秒ごとの確認、ウィンドウの focus、visibilitychange、保存／コピー直前にローカル日付を確認する。コピーでは Svelte の DOM 更新を待つ。
- 正常な入力は手動モードに切り替わり、日付変更・復帰で変化しない。「今日に戻す」はエラーを解除して自動モードへ戻す。
- 既存の「保存」で手動日付・モード・表示形式を保存する。保存後の再起動では手動値を復元し、自動モードではその日のローカル日付を使う。
- 保存設定の読込が終わるまで編集とコピーを無効化し、非同期読込がユーザーの編集を上書きする競合を避けた。読込・保存コマンドの失敗は日本語の通知で表示する。

### 最小限の schema 追加と理由

既存のフラットな Settings に以下の3項目だけを追加した。手動日付の再起動保持と表示形式の保存に必要なためで、ストア全体の再設計はしていない。

| フィールド | 値 / 旧設定での既定値 |
| --- | --- |
| `date_mode` | `auto`（既定） / `manual` |
| `date_format` | `gregorian`（既定） / `wareki` |
| `manual_date` | 日付のみの `YYYY-MM-DD` / `null`（既定） |

Rust 側は mode / format を enum、日付を `Option<String>` とし、`#[serde(default)]` で追加項目のない旧設定を読み込める。手動日付はフロントの共通検証器で復元時にも検証し、不正なら出力を止める。保存先は既存の CWD `Setting.json` のまま。既存設定ファイルそのもの、schema version、保存先・置換処理は変更していない。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `src/date.js`（新規） | 日付の解析・表示・モード管理 |
| `tests/date.test.js`（新規） | Node 標準テスト9件 |
| `src/App.svelte` | 既存入力への組込み、更新・表示・エラー・保存・コピー制御 |
| `src/store.ts` | 日付設定の型と既定値 |
| `src-tauri/src/main.rs` | 日付設定の serde 対応、旧設定互換と往復テスト |
| `package.json` | `test:date` 追加、`check` から実行 |
| `.github/workflows/windows.yml` | check ステップ名に日付テストを明示 |
| `docs/store/estamp-plan.md` | 和暦直接入力を含む仕様へ整合 |
| `outputs/pr04-final1.md` | 本報告・コミット手順・PR案 |

lock ファイル・依存一覧・Tauri のウィンドウ設定・保存先・フォント資産は無変更。

## 検証とログ

実行環境: Node v24.22.1 / Yarn 1.22.22 / rustc 1.99.1（指定の stable-aarch64-apple-darwin）。CI は既存の Rust 1.95.0 固定を維持。すべて以下を設定して実行し、ビルド・テストは直列、cargo は `-j 2` とした。

```sh
export PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/tyaromax/.nvm/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH
export COREPACK_ENABLE_NETWORK=0
```

| コマンド | 結果 | ログ（outputs 配下） |
| --- | --- | --- |
| `corepack yarn run check` | 成功、Svelte 診断0エラー・0警告、日付9テスト成功 | `pr04-check.log` |
| `cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml` | 成功 | `pr04-cargo-check.log` |
| `cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml` | 成功、2件 | `pr04-cargo-test.log` |
| `corepack yarn run test:date` | 成功、9件 | `pr04-frontend-test.log` |
| `corepack yarn build` | 成功 | `pr04-build.log` |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 成功 | `pr04-rustfmt.log` |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | 成功 | `pr04-tsc.log` |
| `node node_modules/svelte-check/bin/svelte-check --no-tsconfig --workspace src` | 成功 | `pr04-svelte-direct.log` |
| `/usr/bin/git diff --check` | 成功 | `pr04-diff-check.log` |

Svelte の「in 0 files」は問題のあったファイル数を表す（svelte-check の reporter 実装を確認）。対象ファイル数0という意味ではない。

日付テストは、下限1873-01-01、全元号の改元前日／当日、逆方向の期間外、平成32年の訂正、元年、全角英数字・記号、空欄・形式不正、存在しない月日、平年／閏年（1900年・2000年を含む）、旧暦未対応、確認／印影表記を検証する。さらに時計注入による年末年始・復帰・手動保持・不正入力保持・復元、および別プロセスの `TZ=Asia/Tokyo` / `America/Los_Angeles` によるUTC前後の日付を検証する。

Rust の2件は、既存 Setting.json の追加項目なし読込と、手動日付・和暦形式を含む設定の保存／読込往復。

Windows CI は `yarn run check` → 新 `test:date` を必ず実行する。既存の cargo check / cargo test / Tauri release build は維持した。CI リモート実行は未実施。

Yarn の書込可能キャッシュへの切替・global folder の警告と、既存 Browserslist データの古さの通知は残る。ダウンロードは不要で、パッケージ取得・lock更新は行っていない。

## コミット手順（ユーザーが実行）

`.git` 書込禁止のため実行していない。既存の outputs を巻き込まないよう、明示したファイルだけを追加する。

```sh
# 1. 純粋な日付処理・テスト・CI の単位
/usr/bin/git add -- src/date.js tests/date.test.js package.json .github/workflows/windows.yml
/usr/bin/git commit -m "PR-04: 和暦と西暦の日付解析・境界テストを追加"

# 2. UI と最小設定追加の単位
/usr/bin/git add -- src/App.svelte src/store.ts src-tauri/src/main.rs
/usr/bin/git commit -m "PR-04: 日付手入力と自動・手動モードを印影へ統合"

# 3. 仕様整合と検証記録の単位
/usr/bin/git add -- docs/store/estamp-plan.md outputs/pr04-final1.md
# *.log は既存 .gitignore の対象なので、今回のログだけ明示的に追加
/usr/bin/git add -f -- outputs/pr04-check.log outputs/pr04-cargo-check.log outputs/pr04-cargo-test.log outputs/pr04-frontend-test.log outputs/pr04-build.log outputs/pr04-rustfmt.log outputs/pr04-tsc.log outputs/pr04-svelte-direct.log outputs/pr04-diff-check.log
/usr/bin/git commit -m "PR-04: 確定した和暦入力仕様と検証結果を記録"
```

push・マージの手順は含めていない。

## 残課題・未検証

- コンピューター操作環境で利用可能なブラウザーがなかったため、画面の目視・実機操作、キーボード／読み上げ、Windows WebView2、長い和暦の実フォントでの収まり、コピーした画像の実際の貼付けは未検証。自動テストとソース上の接続、フロント build までを確認した。
- UI確認時は、起動時の小さい印影画面を維持したまま拡大またはスクロールし、`Ｒ７．１０．２２` → 和暦切替 → 保存／再起動、`H31.5.1` → 正しい訂正表示とコピー無効 → `R元.5.1` → 今日に戻す、の操作を確認する。
- 保存先・version付きschema・書込失敗／破損復旧は PR-02、フォント同梱は PR-03、PNG／コピー全体の完成と実アプリへの貼付けは PR-05 の検証が必要。これらを本PRの完了扱いにしていない。
- 新元号は開始日テーブルの更新と境界テスト追加が必要。自動追従は保証しない。

## 日本語 PR タイトル案

PR-04: 日付を正常化し、和暦の直接入力と今日への復帰に対応

## 日本語 PR 本文案

中段の任意文字列を検証済みの日付へ置き換え、西暦・和暦の入力と表示切替に対応します。日付は時刻なしの `YYYY-MM-DD` で保持し、ローカルの今日への自動追従、手動日付の保存・復元、「今日に戻す」を追加しました。

明治6年（1873-01-01）以降を対象に、M/T/S/H/R・漢字元号・元年と NFKC 正規化を扱います。元号期間外は自動補正せず正しい表記を案内し、不正入力中は最後の正常値を維持して保存とコピーを止めます。計画書の2箇所を確定した和暦直接入力仕様に合わせました。

設定は日付モード・表示形式・手動日付の3項目だけを追加し、旧設定は既定値で読めます。ウィンドウサイズ、保存先、フォント・画像生成経路、依存とlockは維持しています。PR-00 の別ブランチ変更は含みません。

検証: `corepack yarn run check`（日付9件を含む）、オフライン `cargo check/test -j 2 --locked`（Rust 2件）、`corepack yarn run test:date`、`corepack yarn build` は成功。改元境界、全角、元年、閏日、不正入力、モード・復元、東京／ロサンゼルスのUTC前後を検証しました。新テストは Windows CI の `yarn run check` からも実行されます。

実機UI・WebView2・コピー画像の貼付けとリモート CI は未検証です。詳しい範囲・ログ・残課題は `outputs/pr04-final1.md` を参照してください。
