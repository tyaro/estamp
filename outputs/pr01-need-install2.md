# PR-01: Rust 推移依存の追加取得が必要

2026-10-22。ブランチ `feat/pr-01-tauri-v2`、再開時 HEAD `db79b0b`。
依存取得済みの状態から再開し、v2 移行を実装したが、Mac の `cargo check --locked --offline` が依存クレート内で失敗した。追加取得が必要なため、指示に従って停止した。ネットワーク経由の追加インストールは実施していない。現在の Rust lock は受領した組合せのままであり、ビルド成功を示すものではない。

## 原因と版の根拠

- 現在の lock: `tauri 2.8.5`、`tauri-runtime-wry 2.9.3`、`tauri-runtime 2.12.2`。
- `tauri-runtime-wry` 内で E0046 / E0053 / E0277、計8エラー。`WindowBuilder` / `WebviewDispatch` / `Runtime` 等の trait と実装が一致しない。
- 例: `transparent` / `no_redirection_bitmap` / `eval_script_with_callback` / `set_fullscreen_on_monitor` の実装不足、`primary_monitor` の戻り値が `Option` と `Result<Option<_>, _>` で不一致。
- ローカルの公式 crate `~/.cargo/registry/src/*/tauri-2.8.5/Cargo.lock` に同梱された組合せは **`tauri-runtime-wry 2.8.1` / `tauri-runtime 2.8.0`**。同梱 manifest / キャッシュ済み registry index でも対応する依存条件を確認した。両版はローカルキャッシュにない。
- 次のコマンドでは直接依存を変更せず、この2つの推移依存を同梱 lock の版に揃える。修正後のコンパイル結果は未確認。ほかの推移依存も再解決され得るため、差分と結果を確認する。再び `cargo generate-lockfile` を実行すると今回の不整合へ戻る可能性がある。

## ネットワークのある Mac で必要な正確なコマンド

作業ディレクトリは `/Users/tyaromax/Documents/Codex/estamp`。このサンドボックスの外で実行する。各コマンドが失敗したら後続を実行せず、ログを共有する。
`~/.cargo/bin` の x86 rustup は使わず、指定された arm64 toolchain を直接使用する。

```sh
export PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/tyaromax/.nvm/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH
cd /Users/tyaromax/Documents/Codex/estamp
rustc --version --verbose
cargo --version
cargo update --manifest-path src-tauri/Cargo.toml -p tauri-runtime-wry --precise 2.8.1
cargo update --manifest-path src-tauri/Cargo.toml -p tauri-runtime --precise 2.8.0
cargo fetch --locked --manifest-path src-tauri/Cargo.toml
/usr/bin/git diff -- src-tauri/Cargo.lock
```

理由: 互換性のある runtime のソースを取得し、修正した lock の全依存を次回のオフライン検証用にキャッシュする。JS 依存の再取得は不要。

取得後、同じ PATH / 作業ディレクトリで以下を実行できる。後続のビルドが必要とする全クレートがキャッシュ済みか確認する。

```sh
cargo check --locked --offline --manifest-path src-tauri/Cargo.toml
corepack yarn tauri build --no-bundle -- --locked --offline
```

取得・検証ログは `outputs/pr01-install2.log` などに保存して再開時に共有する。push / merge は不要。

## 今回実装した内容

- v2 設定階層・ローカル schema へ移行。identifier は **`tyaromax`**、既存のサイズ・タイトル・CSP は維持。main ラベルを明示。
- invoke を `@tauri-apps/api/core` に変更し、Rust で公式 clipboard-manager を登録。
- Canvas RGBA → `Image.new` → `writeImage` → `Image.close`。書込み完了後に成功通知、失敗時はエラー通知。画像リソースは書込み失敗時も finally で解放。
- main 限定・ローカル専用の3権限: `core:image:allow-new` / `clipboard-manager:allow-write-image` / `core:resources:allow-close`。読取り・パスからの画像取得・default 権限は追加しない。RGBA 経路なので `image-png` feature は不要。
- Yarn の再解決でプラグイン配下に JS API 2.12.4 が入り、2.8.0 の `Image` と型／`instanceof` が一致しなくなる問題を発見。`resolutions` で **2.8.0 に統一**し、ローカルキャッシュから `--offline` で lock / node_modules を更新。
- 未使用 Greet、SVG、favicon 参照、未使用雛形 CSS を削除。HTML の言語・タイトルを整理。
- `.nvmrc` は Node **24.22.1**、`rust-toolchain.toml` は Rust **1.95.0** / rustfmt、Yarn は `packageManager` の **1.22.22**。Rust 実行版は rustc `1.95.0 (59807616e 2026-04-14)` / cargo `1.95.0 (f2d3ce0bd 2026-03-21)` / `aarch64-apple-darwin`。
- save / load と `Setting.json` の仕様は維持。保存先変更は PR-02。

## 検証結果

| 検証 | 結果・証跡（ログはローカル、Git の対象外） |
| --- | --- |
| Yarn キャッシュからの再解決 | 成功、`outputs/pr01-yarn-offline.log` |
| Yarn `install --offline --frozen-lockfile` | 終了コード0、`outputs/pr01-yarn-frozen.log` |
| `corepack yarn run check` | 終了コード0、Svelte 0 errors / 0 warnings、`outputs/pr01-svelte-check.log` |
| `corepack yarn build` | 終了コード0、`outputs/pr01-frontend-build.log` |
| JS 画像 API 通信の模擬検証 | 成功。共有 `Image` クラスと resource ID の転送・解放を確認、`outputs/pr01-clipboard-api-smoke.log` |
| Tauri 生成 ACL | 成功。main / local 限定の3権限と identifier を確認、`outputs/pr01-capability-audit.log` |
| lock の旧依存除去 | 成功。Tauri v1 / 旧 clipboard / 旧 SVG なし、`outputs/pr01-lock-audit.log` |
| `cargo fmt --check` / `git diff --check` | 終了コード0 |
| Mac `cargo check --locked --offline` | **終了コード101**、runtime の不整合、`outputs/pr01-cargo-check.log` |
| Mac Tauri release build / 実起動 | **未実施**。上記不整合の解消後に実施 |
| Windows check / release build / 実起動 | **未実施**。[確認手順](pr01-windows-check.md) を更新済み |

Yarn Classic の `yarn check` は組込みの依存整合性コマンドと衝突し、レジストリ参照を試みて DNS エラーになった。型検証は `yarn run check` で成功しており、これを README / Windows 手順にも記載した。Browserslist の古い DB と Node の DEP0169 等の警告は残る。今回、それらの更新のためのネットワーク取得は行っていない。
模擬 IPC・生成 ACL の検証は、実 WebView の権限確認や OS クリップボードへの貼付確認を代替しない。

## 再開後に残る作業

1. 上記 runtime の lock 調整・取得後、Mac Rust check / Tauri release build を実施し、さらに不整合がないか確認する。
2. Mac でウィンドウ・印影・既存 save / load・画像書込みの実動作を確認する。
3. Windows の手順で Rust check / release build / 起動 / IPC を確認する。PR-01 の受け入れ完了はこの確認後。
4. 最終 lock 差分・検証結果を記録し、意味のある単位で `/usr/bin/git` により追加コミットする。

画像品質は PR-05、保存先は PR-02、フォント同梱は PR-03、CSP 厳格化は PR-06。今回の停止条件とは区別する。

## ローカルコミット

- `e51d0d7` — 依存 lock の記録、JS API 統一、Node / Rust の版固定。
- `f6270af` — v2 設定・公式プラグイン・最小権限・画像 IPC・雛形削除。
- 続くドキュメントコミット — README / Windows 手順 / この追加取得手順。

いずれも `/usr/bin/git` を使用。push / merge は行っていない。再開前から存在した未追跡のプロンプト・ログ・`pr01-final.md` 等は変更・コミットしていない。
