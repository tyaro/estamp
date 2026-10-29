# PR-02 設定ストアの仕様

PR #6 / `feat/pr-02-settings-storage` の単体仕様（2026-10-30 レビュー対応）。印影種類は保存フィールドのみ。日付の動作・入力・表示は PR-04 で接続する。小さな起動ウィンドウの寸法は維持する。

## 保存と IPC

保存先は Rust の `app.path().app_config_dir()/Setting.json`。identifier は `jp.tyaro.estamp`、Windows の論理パスは `%APPDATA%\jp.tyaro.estamp\Setting.json`。MSIX の実体パス・更新保持はパッケージ実機で別途確認する。

| コマンド | 引数 | 応答 |
| --- | --- | --- |
| `load` | なし | `{ settings, revision, warning }` |
| `save` | `{ config, revision }` | 新しい revision（文字列） |
| `legacy_available` | なし | 実行ファイル隣の `Setting.json` が通常ファイルなら `true`、未存在・ディレクトリなら `false`。調査失敗はエラー |
| `import_legacy` | `{ revision }` | `{ settings, revision, warning }` |

revision は JSON の原文を表す不透明なトークン。未保存時は `null`。BOM を含む場合も原文のまま比較し、解析時だけ UTF-8 BOM を除去する。フロントから保存先・取り込み元の任意パスを受け取らない。

`Setting.lock` の OS 排他ロックで読込・退避・保存・取込を直列化する。競合は20ms間隔で約300msまで再試行し、長時間の競合は再読込・再試行を案内する。OS のスケジューリングやファイル操作自体の遅延はこの目安に含まれない。ロックファイルは削除せず、ハンドルの解放で解除する。

保存と取込の両方で、ロック取得後に現在の JSON と schema を確認し、revision が一致する場合だけ書き込む。初回保存同士、保存と取込、取込同士の競合でも古い内容で上書きしない。不明な schema・破損した保存先への取込も拒否する。

書込みは同じフォルダーの一時ファイルを `create_new` で作り、全量書込み・`sync_all()`・クローズ後に rename で置き換える。Windows のエラーコード5（アクセス拒否）、32（共有違反）、33（ロック違反）のみ、20ms間隔で約300msまで rename を再試行する。破損退避の rename も同じ処理を使う。上限後の失敗は表示し、一時ファイルを削除する。既存ファイルを先に削除することはない。ディレクトリ fsync、強制終了後の tmp 自動回収、外部エディターの非協調的な更新までは扱わない。

## schema と前方互換性

schema version は1。欠損項目には次の既定値を補い、指定された値の型が不正なら破損として扱う。

| フィールド | 既定値 |
| --- | --- |
| `schema_version` | `1` |
| `top_str` / `top_font_size` | `所属` / `80` |
| `mid_font_size` | `60` |
| `btm_str` / `btm_font_size` | `名前` / `80` |
| `output_size` | `100` |
| `date_mode` / `date_format` | `auto` / `gregorian` |
| `manual_date` | `null`（設定時は日付のみの `YYYY-MM-DD`） |
| `stamp_type` | `dated_stamp` |

**方式 (2): 未知の印影種類を許容して元の値を保持する。** `StampType::Unknown(String)` は文字列をそのまま再シリアライズする。未知値の表示は既存の三段日付印になるが、読込・保存時に `dated_stamp` へ書き換えない。未知の追加フィールドは `serde(flatten)` の JSON 値として保持する。フロントも `stamp_type: string` と未知フィールドを受け入れ、設定全体のスナップショットを保存する。

採用理由は、印影種類・追加フィールドの増加ごとに version 更新を運用規則だけで強制するより、旧版で既存項目を編集しても将来の値を失わないため。ファイル読込 → IPC 往復 → 既存項目の編集 → 保存 → 再読込で、未知の印影種類とネストした追加フィールドが保持され、破損退避されないことをテストする。新しい印影種類の描画・選択 UI は追加しない。

型・意味の互換性を壊す変更、既存の列挙型 `date_mode` / `date_format` の値追加では schema version を上げ、移行方法を別途定義する。不明な schema version は退避・上書きせず停止する。壊れた JSON／不正な型／不正 UTF-8 は原文を `Setting.<識別子>.corrupt.json` に退避し、警告と既定値を返す。退避できない場合は停止する。

## 旧設定の取り込み

起動時・再読込時・取込終了時に `legacy_available` を呼ぶ。旧ファイルが実在するときだけ取込ボタンを出す。自動取込せず、保存後も利用できる。ボタンを押すと、保存済みの設定と編集中の値を置き換えることを画面内で確認し、「置き換えて取り込む」で実行する。「キャンセル」は書き込まない。元ファイルは変更・削除しない。存在確認後にファイルが消える・読めなくなる場合も、取込はエラーを表示し、保存先を保持する。ファイルの追加・削除を反映するには「再読込」を使う。

取り込み元は、レビューの表示案に合わせて **現在起動している実行ファイルと同じフォルダーの `Setting.json`** に固定する。存在確認と取込で同じ `legacy_path()` を使う。旧版は CWD 相対に保存していたため、ショートカットの作業フォルダーや開発用 `src-tauri/Setting.json` がそのまま対象になるとは限らない。別の場所にある場合は旧アプリを終了し、元ファイルを残したまま、対象ファイルを現在の実行ファイル隣へコピーして「再読込」する。開発時の例は `src-tauri/target/debug/Setting.json`（target を指定した場合は該当の出力先）。コピー先に既存ファイルがあれば、その内容を先に確認する。実行ファイル隣へ配置できないインストール環境や任意パス選択 UI は後続課題とする。

## 検証と段階Bへの申し送り

Rust テストは一時ディレクトリとテスト内の旧6項目 JSON を使い、追跡済み `src-tauri/Setting.json` と CWD を変更・参照しない。旧値保持、保存後の取込、古い revision・不明 schema の上書き拒否、BOM の読込と取込、未知値の保持、短時間のロック待機と別プロセスのタイムアウト、一時ファイルの片付けを確認する。

段階Aでは #4/#5 の統合・衝突解消は行わない。段階Bでは次を接続する。

- `main.rs` の設定型は `settings.rs` を正として1定義に統合し、CWD 保存を復活させない。
- PR-04 の日付復元に `LoadedSettings.settings` を渡し、revision / warning / ready と取込後の日付復元を維持する。
- PR-04 の保存処理へ `{ config, revision }` を渡し、成功時は revision を更新する。応答後に編集中のストアを古いスナップショットで置き換えない。未知フィールドを含む設定全体を送る。
- busy / ready と日付エラーの条件を併合し、時計監視の後始末・日付コピー時の競合防止を維持する。スクロール領域を1つにまとめ、ウィンドウ寸法を変えない。
- 計画書の PR-00 決定事項・PR-04 日付仕様と本仕様を併存させる。開発・検証文書への相対リンクを維持する。

2026-10-30 の Mac ARM64（Rust / Cargo 1.99.1、Node 24.22.1、Yarn 1.22.22）で、`corepack yarn run check`（0 errors / 0 warnings）、`cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml`、`cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml`（22 passed）、`corepack yarn build` が成功した。各コマンドは直列に実行し、依存追加・ネットワーク取得は行っていない。

Windows CI・実機での rename / OS ロック、GUI での取込確認・キャンセル、再起動・コピー、MSIX 更新保持は未確認。Mac のテスト成功だけで Windows の受入完了とはしない。
