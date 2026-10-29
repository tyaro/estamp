# PR-02 実装結果：設定の保存先・schema

作業日：2026-10-29（JST）

対象は `/Users/tyaromax/Documents/Codex/estamp`、ブランチは `feat/pr-02-settings-storage`、開始 HEAD は `8bc6ea9`（PR-01 マージ済み）。コミット・push・マージは実施していない。既存の未追跡 outputs は編集していない。

## 範囲の根拠

- `docs/store/estamp-plan.md` の「### PR-02」と、論点表の「設定と旧版互換」「今日の日付と再起動」を対象とした。設定保存先、version、既定値、初期反映、復旧、新 schema 保護、保存競合、明示的な旧設定取込を実装した。
- `docs/design/estamp-design-rules.md` を参照。新しいエラー表示は日本語・記号付き・`role="alert"` とし、異常色 `#B42318`、退避の注意色 `#8A5700`、本文14pxを用いた。新しい操作ボタンは高さ32px以上・角丸8pxとした。和暦の入力・表示・検証は PR-04 に残した。
- 追加要望の「印影の種類」は保存フィールドだけを実装。Rust の `stamp_type` に `#[serde(default)]` を付け、`StampType::DatedStamp`（JSON: `dated_stamp`）を既定値とした。フロントの型・既定値も対応した。種類の選択 UI や別の印影描画は追加していない。
- PR-00（#4）の製品情報・ライセンス変更、PR-03 のフォント同梱、PR-04（#5）の日付動作・UI、PR-05 以降の画像生成・コピー改修は含めていない。PR-04 のローカルブランチ差分は、設定契約と衝突見込みの確認のために読み取っただけで、取り込んでいない。
- `tauri.conf.json` と起動ウィンドウの寸法は変更していない。全体 CSS が `overflow-hidden` のため、設定・取込・復旧操作へ到達する最小のスクロール領域を App 内に設けた。通常の起動時には従来どおり小さな印影を表示する構成を維持する。

## 変更内容

### 保存・読込

- Rust の `app.path().app_config_dir()` でユーザー単位の設定フォルダーを解決し、`Setting.json` に保存する。Windows の論理パスは `%APPDATA%\jp.tyaro.estamp\Setting.json`。MSIX での実体パスは実機検証事項とする。
- 初回読込でフォルダーを作成し、ファイルがなければ既定値を返す。保存または明示的な取込で JSON を作成する。CWD には依存しない。
- 設定処理とテストを `src-tauri/src/settings.rs` に分離し、`main.rs` は保存先解決と Tauri コマンドの接続を担当する。
- 同じフォルダーの一時ファイルを `create_new` で作成し、`write_all` → `sync_all` → クローズ → `std::fs::rename` で置換する。書込み・同期・置換失敗を返し、通常の失敗時は一時ファイルを片付ける。保存済みファイルを先に削除しない。
- 読込時の JSON 破損、型・必須項目の不正、不正 UTF-8 は `Setting.<PID・時刻・連番>.corrupt.json` に原文を退避する。画面には退避先と既定値使用を表示する。退避できなければ停止する。
- 不明な schema version はフィールドのデシリアライズ前に拒否し、原文を退避・上書きしない。保存直前にも保存済みファイルの schema／破損を再確認する。

### schema と IPC

| フィールド | 保存契約・既定値 |
| --- | --- |
| `schema_version` | 現在は整数 `1`。欠落した旧設定も `1` として読む |
| `top_str` / `top_font_size` | 「所属」/ 80 |
| `mid_font_size` | 60 |
| `btm_str` / `btm_font_size` | 「名前」/ 80 |
| `output_size` | 100 |
| `date_mode` | `auto` / `manual`、欠落時 `auto` |
| `date_format` | `gregorian` / `wareki`、欠落時 `gregorian` |
| `manual_date` | 日付のみの `YYYY-MM-DD` / `null`、欠落時 `null` |
| `stamp_type` | 現時点では `dated_stamp` のみ、欠落時も同値 |

旧6項目は必須のままとし、追加項目の欠落だけを補完する。現行 `src-tauri/Setting.json` の90・60・110・50pxなどの値は保持する。日付3項目は PR-04 と名前・列挙値・null を揃えた保存契約だけで、日付の検証・追従・表示への反映は実装していない。

- `load`：引数なし。`{ settings, revision, warning }` を返す。
- `save`：`{ config, revision }` を受け取り、新しい `revision` を文字列で返す。従来の `"success"` 戻り値ではなくなる。
- `import_legacy`：引数なし。実行ファイル隣の `Setting.json` だけを明示的に取り込み、`load` と同じ応答を返す。
- `revision` は読込時の JSON 原文を用いる不透明な比較用トークン。未保存時は `null`。フロントから保存先・取込元の任意パスは渡せない。

### 競合・旧設定・画面

- `Setting.lock` に対する OS の排他ファイルロックで、読込・退避・保存前確認・置換・取込を直列化する。ロックファイル自体は残し、ハンドルの解放で解除する。ロック中の別操作は待ち続けず、日本語で再試行を案内する。
- 別ウィンドウの保存で JSON が更新されていたら、古い `revision` の保存を拒否し、再読込を案内する。未保存状態からの競合も検出する。再読込ボタンには編集中の値を置き換えることを明記した。
- 初期読込中・失敗時は編集と保存を無効にする。処理中の保存連打を防ぎ、読込失敗・保存失敗を永続的な画面内メッセージで表示する。初期読込失敗時は印影コピーも無効にする。
- 取込は初回保存前のみ。自動走査せず、利用者の「旧設定を取り込む」操作で実行する。保存済みの新設定があれば Rust 側でも拒否する。取込元は削除・変更しない。
- `src-tauri/Setting.json` 自体は変更していない。開発時にこのファイルを自動取込する機能も追加していない。旧配置が別の場合の汎用ファイル選択は対象外。
- 計画書に後続見積もりを追記した：v1.1 は共通基盤1〜1.5人日、氏名＋日付0.5人日、日付なし0.5〜1人日。v1.2 は角印2〜3人日。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `src-tauri/src/main.rs` | app_config_dir 解決、load/save/import_legacy コマンド |
| `src-tauri/src/settings.rs`（新規） | schema、既定値、保存・復旧・競合・取込、Rust 単体テスト |
| `src/store.ts` | schema と印影種類・日付項目、読込応答のフロント型、既定値 |
| `src/App.svelte` | 初期読込、保存、失敗表示、競合からの再読込、初回取込、スクロール領域 |
| `docs/store/estamp-plan.md` | PR-02 の確定仕様、期限論点、v1.1/v1.2 の後続作業 |
| `outputs/pr02-final1.md`（本書、新規） | 結果・衝突見込み・手順・PR 案 |

依存関係、Cargo/JS の lock、package メタデータ、capabilities、CI、ウィンドウ設定に変更はない。検証ログは `outputs/pr02-*.log` で、Git の既存 ignore によりコミット対象外。

## 検証と結果

全コマンドで指定 PATH と `COREPACK_ENABLE_NETWORK=0` を設定した。ビルド・検証コマンドは直列実行し、cargo は常に `-j 2 --locked --offline`。依存取得は不要で、ネットワークへのアクセスやダウンロードは実行していない。

実行環境：Mac ARM64、Rust/cargo 1.99.1（指定 PATH の stable）、Node v24.22.1、Yarn 1.22.22。リポジトリの `rust-toolchain.toml` と Windows CI は1.95.0のまま変更していない。

| コマンド | 結果 | ログ |
| --- | --- | --- |
| `corepack yarn run check` | 成功、Svelte の error/warning ともに0。スクロール領域追加後に再実行済み | `outputs/pr02-yarn-check.log` |
| `cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml` | 成功 | `outputs/pr02-cargo-check.log` |
| `cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml` | 成功、15 passed / 0 failed（子プロセス用ヘルパー1件を含む） | `outputs/pr02-cargo-test.log` |
| `corepack yarn build` | 成功、Vite 本番ビルド | `outputs/pr02-yarn-build.log` |
| `rustfmt --check --edition 2021 src-tauri/src/main.rs src-tauri/src/settings.rs` | 成功 | `outputs/pr02-rustfmt.log` |
| `/usr/bin/git diff --check` | 成功 | `outputs/pr02-diff-check.log` |

Yarn のキャッシュ書込み先・global folder の警告と、既存 Browserslist データ更新案内は出た。依存更新は行っていない。

Rust テストで確認した内容：

1. 初回のフォルダー作成・既定値、隣に旧設定があっても自動取込しないこと。
2. **現行 `src-tauri/Setting.json` を原文のままファイルから読み、欠落した `stamp_type` が `DatedStamp` になること**。追加項目の既定値、旧6項目の値保持、読込で原文を変更しないこと、追記保存後の読込も確認。
3. 日本語・改行・引用符・バックスラッシュ・全設定項目の往復、既存ファイルを3回置換、不要な tmp が残らないこと。
4. 破損 JSON・不正な型/必須項目・不正 UTF-8 の原文退避と既定値復帰、退避後の保存。
5. 新しい schema の読込・保存拒否と原文保持。
6. 読込後に破損したファイルを保存で上書きしないこと。
7. 二重起動相当の初回保存競合と、古い revision での上書き拒否。
8. 別プロセスからロック中の読込・保存を拒否すること（テストバイナリの子プロセスを使用）。
9. ユーザー別の保存先に相当する異なるディレクトリ間の値・ロックの分離。
10. 明示的な旧設定取込、取込元保持、新設定優先、再取込拒否。
11. 取込元が未存在・破損・新 schema の場合に保存先を作らず、元データを保持すること。
12. 置換失敗時の保存先保持と一時ファイル削除、フォルダー作成失敗・読込失敗のエラー。
13. 未対応の schema を持つ保存要求の拒否。

## PR-04 との衝突見込みと解決方針

| 場所 | 見込み・解決方針 |
| --- | --- |
| `src-tauri/src/main.rs` | PR-04 はここへ DateMode/DateFormat、3フィールド、旧形式テスト、往復テストを追加している。PR-02 は設定全体を `settings.rs` に移したので競合が見込まれる。PR-02 のコマンド・保存基盤を維持し、日付の型・既定値・テストは `settings.rs` のものへ統合する。CWD 保存を復活させない |
| `src/store.ts` | 同じ位置への日付3フィールド・既定値追加で競合し得る。型名・値は合わせてあるので各1定義へ統合し、`schema_version`・`stamp_type`・`LoadedSettings` を残す |
| `src/App.svelte` の load/onMount | PR-04 の `invoke("load")` は直接 Setting が返る想定。`LoadedSettings.settings` を適用し、revision/warning/ready の処理を維持した上で、PR-04 の `restoreDate(result.settings)`、時計監視と後始末を接続する |
| `src/App.svelte` の save と PR-04 の `src/save.js` | PR-04 は日付状態のスナップショットを `saveSettings` 経由で保存する。PR-02 の `{ config, revision }` を渡し、返った revision を更新する必要がある。PR-04 の日付エラーによる停止と PR-02 の busy/ready による停止を両方維持。保存応答で編集中の値を古いスナップショットへ戻さない |
| App の fieldset・disabled・スクロール領域 | 両方が触るため競合し得る。スクロールは1つの `app-viewport` に統合し、保存処理中/初期読込と日付エラーの各条件を併合する。ウィンドウ寸法を変えない |
| `docs/store/estamp-plan.md` | 同じ論点表周辺を触る可能性がある。PR-02 の保存契約・印影種類見積もりと、PR-04 の確定日付仕様・受入結果を併存させる。日付入力の仕様は設計文書を優先する |

PR-04 の `src/date.js`、日付・保存の JS テスト、package/CI の変更はこのブランチへ持ち込んでいない。統合時は PR-04 の保存テストも新しい revision の接続に合わせて確認する。PR-00 のメタデータ・権利ファイルは本 PR の変更対象外。

## 残課題・検証の限界

- **Windows での既存ファイル置換・OS ロックの実行結果は未取得**。置換テストと子プロセスのロックテストを既存 Windows CI の cargo test で実行できるようにしたが、今回は commit/push をしていないため CI を起動していない。Windows の成功を受入確認に残す。
- 実際の Tauri ウィンドウ操作による編集→保存→終了→再起動、取込・復旧メッセージの表示確認は未実施。Rust のストア再作成による読込復元、型検査、フロントビルドと IPC の接続コードを確認した。Windows の別 OS ユーザーでの起動、MSIX の AppData 仮想化・更新保持も実機確認が必要。
- 競合防止は同じファイルロック契約を使うアプリ同士が対象。外部エディターの非協調的な同時書込み、手動のロックファイル削除までは保証しない。強制終了・電源断で残った tmp の自動回収や、ディレクトリエントリーまでの電源断耐性は追加していない。
- 日付モードの動作・日付値の意味検証・和暦表示は PR-04、文字や出力サイズの UI 検証・コピー品質は PR-05 以降。PR-03 のフォント取得も未実施。既存の実行時 Google Fonts import は残る。
- 将来の印影種類・互換性のない schema 拡張時には version と移行方針を見直す。
- 制約に関する作業上の逸脱：初回の AGENTS.md 探索で、誤って親の Codex ディレクトリ配下まで検索し、他リポジトリ内の AGENTS.md のファイル名を列挙した。他リポジトリの内容の読取り・変更・コマンド実行はしていない。以後は estamp 内と親階層の指示ファイルの確認に限定した。

## コミット手順（未実行）

本変更は schema・コマンド・フロント接続が一体で動くため実装を1コミット、その根拠と記録を1コミットとする。`git add .` や `git add outputs` は使わず、既存の他 PR の未追跡ファイルと全 `*.log` を含めない。

```sh
/usr/bin/git add -- src-tauri/src/main.rs src-tauri/src/settings.rs src/store.ts src/App.svelte
/usr/bin/git commit -m "PR-02: ユーザー別設定ストアと互換 schema を実装"

/usr/bin/git add -- docs/store/estamp-plan.md outputs/pr02-final1.md
/usr/bin/git commit -m "PR-02: 設定保存の仕様と検証結果を記録"
```

## 日本語の PR タイトル案

PR-02：設定をユーザー別フォルダーへ保存し、schema と旧設定互換を整備

## 日本語の PR 本文案

従来の CWD に対する Setting.json 直接書込みを、Tauri の app_config_dir を使うユーザー別設定ストアへ変更します。schema version と既定値、印影種類の保存フィールドを追加し、現在の6項目だけの旧設定も値を保ったまま読み込めます。印影種類の UI・追加描画、日付機能、ウィンドウ寸法は変更しません。

保存は同じフォルダーの一時ファイルを同期・クローズしてから置換します。破損設定は原文を退避して案内し、不明な新 schema は上書きしません。OS ロックと読込内容の比較で二重起動時の保存競合を検出し、画面内で失敗・再読込を案内します。旧設定は初回の明示操作で実行ファイル隣から取り込み、新設定と取込元を保護します。

日付3項目の保存契約は PR-04 と名前・値を合わせています。PR-04 の統合では Rust 設定型の移動と、load 応答・save の revision を接続する必要があります。計画書には v1.1/v1.2 の印影種類の後続作業も記録しました。

検証：Mac ARM64 で `corepack yarn run check`、`cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml`、`cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml`（15 passed）、`corepack yarn build` がすべて成功。既存ファイルの反復置換、旧形式の既定印影種類、破損退避、新 schema 保護、競合と別プロセスのロックを確認しています。Windows CI/実機および実際のアプリ再起動による確認は未実施です。詳細・衝突解決方針は `outputs/pr02-final1.md` に記載しています。
