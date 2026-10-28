# PR-01 第5回: 一次レビュー修正と検証結果

検証日: 2026-10-29（JST）。PR #3、ブランチ `feat/pr-01-tauri-v2`、作業開始 HEAD `c8426e81235e638a9f2ad99e6438f6dd981c8a6a`。

指定された6件を修正し、Mac の型チェック・オフライン Rust check / test・Tauri release build はすべて終了0。Settings のテストは1件成功。CLI 2.12.4 の release build では `STATIC_VCRUNTIME` 非推奨警告は出なかった。Windows CI を追加したが、その実行結果および GUI / OS clipboard の実機確認は未取得であり、PR-01 全体の受け入れ完了は宣言しない。

作業範囲は `/Users/tyaromax/Documents/Codex/estamp` のみ。他リポジトリ・worktree、banto-industrial、3b-join にはアクセス・変更していない。コミット・push・マージは実施していない。ネットワーク経由の依存取得も実施していない。

## 各指摘への対応

番号は依頼本文の一覧を正とし、レビュー全文の番号とは区別する。

| 指摘 | 対応と確認 |
| --- | --- |
| P2-1: v1 環境変数名 | `vite.config.ts` のコメント・target・minify・sourcemap を `TAURI_ENV_PLATFORM` / `TAURI_ENV_DEBUG` に変更。Windows 比較も `===` に統一。導入済み CLI 2.12.4 の `config.schema.json` の hook 説明と CHANGELOG に新名を確認した。Windows debug / release と darwin release の設定値を Vite の実際の設定ローダーで確認した |
| P2-2: clipboard-win | ユーザーが取得・更新済みの `Cargo.lock` 差分（5.4.1 → 5.4.3 と checksum）を採用。追加の lock 再解決はしていない。Mac の check / test / release build は `--locked --offline` で成功。ただし Mac では Windows 専用 crate のコンパイル・動作まで検証できないため Windows CI / 実機確認を残す |
| P2-3: CLI | 更新済み `package.json` / `yarn.lock` の CLI 2.12.4 を採用。実際の CLI も `tauri-cli 2.12.4`。Rust 2.12.2 / JS API 2.12.4 と同じ minor。README・Windows 手順の版・build 手順を更新し、release は Node で CLI を直接実行。今回の Mac release ログの `STATIC_VCRUNTIME` 出現数は0 |
| P3-1: envPrefix | `["VITE_", "TAURI_ENV_"]` に限定。Vite は文字列 prefix を使うため `*` は付けない。ダミーの `TAURI_SIGNING_PRIVATE_KEY` が `loadEnv` の公開結果に含まれず、`TAURI_ENV_PLATFORM` は含まれることを確認 |
| P3-2: identifier | `src-tauri/tauri.conf.json` を確定値 `jp.tyaro.estamp` に変更。README・Windows 手順・Store 計画／評価の追記に反映。第4回結果／依存調査は当時の履歴を残し、最新結果への案内を追記。MSIX Identity / Publisher の Store 割当値はこの値と同一とは扱わず PR-07 に残す |
| P3-3: CI とテスト | `.github/workflows/windows.yml` を追加。push / pull_request、`windows-latest`、Rust 1.95.0（`rust-toolchain.toml` と一致）、Node 24、Corepack で Yarn 1.22.22。`yarn install --frozen-lockfile` → `yarn run check` → `cargo check -j 2 --locked` → `cargo test -j 2 --locked` → Tauri release build `--no-bundle -- --locked -j 2` を順次実行。Vite build は `beforeBuildCommand` に含まれる。`CARGO_BUILD_JOBS=2` も指定。YAML をローカルのパーサーで読み、トリガー・版・各コマンドを静的確認した。CI 自体は未実行 |

Settings は内部のパス指定ヘルパーに保存・読込処理を分離し、IPC コマンドから共通処理を呼ぶ。テストは OS 一時ディレクトリ下に PID と時刻で専用ディレクトリを作り、日本語・改行・引用符・バックスラッシュと全数値フィールドをファイルに保存してから読み戻し、元の構造体との一致を確認する。終了時は専用ディレクトリを削除する。CWD を変更せず、追跡済み `src-tauri/Setting.json` を上書きせず、新しい依存も追加していない。

## 追加指摘の採否

- 修正: `generate_handler![save, load,]` の末尾カンマを削除。
- 確認済み: `src/App.svelte` の SVG に `id="stamp"` が存在する（64行目）。変更不要。
- 見送り: `$schema` のオンライン URL 化。現在の `../node_modules/@tauri-apps/cli/config.schema.json` は固定 CLI 2.12.4 同梱スキーマを参照し、依存復元後はオフラインでも利用できる。ファイルの実在と release build 成功を確認した。依存復元前のエディタ検証が使えない点は README に記載した。
- 見送り: `Cargo.toml` の `rust-version = "1.90"` 追加。依存の最大 MSRV とアプリ自身の保証範囲は別であり、最低版での実ビルドをしていないため、保証する最低版は新設しない。固定 Rust 1.95.0 は変更せず、Windows CI の検証対象にした。
- 後続対応: CWD 相対の設定保存、書込み・flush エラーの握りつぶしは PR-02。本テストは正常系の round-trip であり、保存失敗時の動作改善は含めない。フォント同梱 PR-03、画像品質・透過／貼付先別判定 PR-05、CSP PR-06、WebView2 配布・MSI / NSIS / MSIX・Store identity は PR-07。今回の bundle なし build はこれらの完了を証明しない。

## 変更ファイル

- `vite.config.ts`: v2 環境変数と公開 prefix。
- `src-tauri/tauri.conf.json`: identifier。
- `package.json` / `yarn.lock`: ユーザーが更新済みの CLI 2.12.4 差分。
- `src-tauri/Cargo.lock`: ユーザーが更新済みの clipboard-win 5.4.3 差分。
- `src-tauri/src/main.rs`: パス指定の内部ヘルパー、Settings round-trip テスト、末尾カンマ削除。
- `.github/workflows/windows.yml`: Windows の依存復元・型チェック・check / test / release build。
- `README.md` / `outputs/pr01-windows-check.md`: 最新版・build 手順・CI・identifier・検証の案内。
- `outputs/pr01-final4.md` / `outputs/pr01-dependency-audit4.md`: 履歴と最新状態を区別する注記。
- `docs/store/estamp-plan.md` / `docs/store/estamp-store-eval.md`: identifier 確定の追記。
- `outputs/pr01-final5.md`: 本書。

既存の未追跡プロンプト・会話ログ・レビュー原文等は保持し、変更・コミット対象に含めない。検証ログは既存の `*.log` ignore に従いローカル保存のみとする。

## Mac の実行環境と検証

macOS 27.2（26B123）、arm64。Node 24.22.1、Yarn Classic 1.22.22、Rust / Cargo **1.99.1**、CLI 2.12.4。詳細は `pr01-environment5.log`。

指定 PATH が rustup shim を経由せず stable の実体を選ぶため、この Mac での検証は `rust-toolchain.toml` の **1.95.0** による検証ではない。ローカルの toolchain ディレクトリにも1.95.0 はなく、ダウンロード・インストールは行っていない。Windows CI を1.95.0に設定したが、その成功はまだ主張できない。

以下の PATH を毎回設定し、各検証を1つずつ実行した。Cargo の check / test / build はすべて `-j 2`。

```sh
export PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/tyaromax/.nvm/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH

corepack yarn run check
cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked --offline -j 2
```

| 検証 | 結果 | ローカルログ |
| --- | --- | --- |
| Svelte / TypeScript | 終了0、診断エラー0・警告0 | `pr01-svelte-check5.log` |
| Rust check | 終了0、`--locked --offline`、2.95秒 | `pr01-cargo-check5.log` |
| Rust test | 終了0、`settings_save_load_round_trip` 1件成功・失敗0件、コンパイル3.53秒 | `pr01-cargo-test5.log` |
| Vite 本番 build | 成功、49 modules、1.36秒（Tauri build 内） | `pr01-release-build5.log` |
| Tauri release build | 終了0、optimized、Cargo 26.41秒、bundle なし | `pr01-release-build5.log` |
| Vite 環境変数 | Windows debug / release、darwin release の target / minify / sourcemap と公開 prefix を確認、終了0 | `pr01-vite-env5.log` |
| CI / 設定の静的確認 | YAML パース、トリガー・版・コマンド・identifier・スキーマ実在・CLI 実版・clipboard-win lock を確認、終了0 | `pr01-config-check5.log` |
| 成果物・ログ確認 | arm64 実行ファイル、SHA-256、上記終了0、`STATIC_VCRUNTIME` 出現0を確認 | `pr01-artifact5.log` |
| 仕上げ確認 | `rustfmt --check`、`git diff --check`、追跡済み Setting.json 差分なし、ステージ済み変更なし | `pr01-final-check5.log` |

依存の追加ダウンロードは不要だったため `outputs/pr01-need-install5.md` は作成していない。

残る警告:

- release build で stable toolchain の `rust-objcopy` が `@rpath/libLLVM.dylib` を読み込めず、build script とアプリのデバッグ情報除去に警告。コンパイル・リンクは成功したが、除去の成功は保証しない。共有 Mac の toolchain は変更していない。
- Yarn の書込み不可な cache/global folder 警告と Browserslist データの古さの案内。型チェックの診断と build は成功。依存の追加取得はしていない。
- **`STATIC_VCRUNTIME` 非推奨警告は今回の Mac release build で消失した。** Windows の runtime linkage と警告の有無は Windows 側で確認する。

生成物: `src-tauri/target/release/estamp`（Mach-O 64-bit arm64、フロント資産内包）。GUI は起動していない。

SHA-256:

```text
1605bc9a5a2e13198fb21149f01a6fe6d1af50bc5206cfad11b7f310e6e47705
```

## サンドボックス外でのコミット手順

`.git` への書込み制約に従い `git add` / `git commit` は実行していない。開始時・終了時ともステージ済み変更は0件。以下はこのリポジトリの同じブランチで実行する手順であり、push / マージは含めない。

先にブランチが `feat/pr-01-tauri-v2` で、他のステージ済み変更がないことを確認する。各コマンドが失敗したら後続を止める。`.log` と無関係な未追跡ファイルは追加しない。

```sh
cd /Users/tyaromax/Documents/Codex/estamp
/usr/bin/git branch --show-current
/usr/bin/git diff --cached --quiet

/usr/bin/git add -- package.json yarn.lock src-tauri/Cargo.lock vite.config.ts src-tauri/tauri.conf.json
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "fix: align Tauri v2 CLI, build environment and app identifier"

/usr/bin/git add -- .github/workflows/windows.yml src-tauri/src/main.rs
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "ci: add Windows verification and settings round-trip test"

/usr/bin/git add -- README.md docs/store/estamp-plan.md docs/store/estamp-store-eval.md outputs/pr01-dependency-audit4.md outputs/pr01-final4.md outputs/pr01-windows-check.md outputs/pr01-final5.md
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "docs: record PR-01 review fixes and offline verification"
```

第4回結果に残る旧コミット手順は使用せず、今回の手順を使用する。

## 残課題・引継ぎ

1. Windows CI を実行し、Windows / Rust 1.95.0 の check・テスト・release build の結果と対象コミットを記録する。この作業では push していないため実行は未確認。
2. [Windows 確認手順](pr01-windows-check.md) で実機 GUI 起動、日本語と印影表示、編集・保存・再起動後の読込、画像コピーの権限エラーの有無、ペイント／Word 等への貼付、透過背景と画質を確認する。OS / MSVC / SDK / WebView2 版、スクリーンショット、EXE ハッシュを残す。
3. Mac GUI / OS clipboard も未確認。必要なら [第4回の専用一時 CWD での実起動手順](pr01-final4.md) を使用し、追跡済み設定を上書きしない。
4. Windows の MSI / NSIS、MSIX の生成・署名・インストール・更新・Store 提出は今回未実施。`--no-bundle` の成功や `bundle.targets: "all"` を MSIX 成功とは扱わない。
5. 設定保存先と失敗処理、フォント、画像品質、CSP は前述の後続 PR で対応する。identifier は PR-02 に先立ち `jp.tyaro.estamp` に確定済み。
