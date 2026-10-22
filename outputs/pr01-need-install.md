# PR-01: 依存取得待ち

2026-10-22。ブランチ `feat/pr-01-tauri-v2`、開始時 HEAD `e81b0d8`。

依存定義の編集までで停止した。依存インストールと lock 更新は実施していない（`yarn --version` は Corepack の Yarn 取得要求が DNS エラーで失敗）。この段階は実行可能な v2 移行の完成状態ではない。以下の取得後に再開を依頼すること。

## 変更した依存定義

| 対象 | 完全一致の指定版 |
| --- | --- |
| Rust tauri | 2.8.5 |
| Rust tauri-build | 2.4.1 |
| JS @tauri-apps/api | 2.8.0 |
| JS @tauri-apps/cli | 2.8.4 |
| Rust / JS clipboard-manager | 2.3.0 / 2.3.0 |
| Yarn Classic | 1.22.22 |

v2 安定版の候補を完全一致で指定した。オフラインのため、取得・相互互換性・現在のセキュリティ情報は未確認。各パッケージの版番号は独立している。Svelte 3 / Vite 4 等の既存指定は維持。旧 clipboard と未使用 svg の直接依存、`api-all` を manifest から除去した。lock にはまだ旧依存が残る。

## 観測した環境

- macOS arm64、Node `v24.22.1`。
- `node_modules` / `src-tauri/target` は存在しない。
- `yarn --version` は Corepack が未取得の Yarn を問い合わせようとして失敗し、版を取得できなかった。
- `rustc` / `cargo` / `rustup` はすべて `bad CPU type in executable`。`~/.cargo/bin/rustup` は x86_64 バイナリで、arm64 環境では実行できない。
- Rust の版は未取得。下記でネイティブ toolchain を準備した後、実際の版を記録する。

## ネットワークのある Mac で実行するコマンド

以下の作業ディレクトリはすべて `/Users/tyaromax/Documents/Codex/estamp`。
このサンドボックスの外で実行する。既存の Rust 設定・toolchain の削除は不要。

1. arm64 版 rustup を取得して実行する。既存の rustup が既に修復済みなら、ダウンロードとインストーラー実行は省略する。

   ```sh
   cd /Users/tyaromax/Documents/Codex/estamp
   curl --proto '=https' --tlsv1.2 -fL https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init -o /tmp/estamp-pr01-rustup-init
   chmod +x /tmp/estamp-pr01-rustup-init
   /tmp/estamp-pr01-rustup-init -y --no-modify-path --default-toolchain none
   "$HOME/.cargo/bin/rustup" toolchain install stable --profile minimal --component rustfmt
   "$HOME/.cargo/bin/rustc" +stable --version --verbose
   "$HOME/.cargo/bin/cargo" +stable --version
   ```

2. Node `v24.22.1` と Corepack を使い、指定済み Yarn Classic で JS 依存を取得し、`yarn.lock` を更新する。ここでは `--frozen-lockfile` を付けない。

   ```sh
   cd /Users/tyaromax/Documents/Codex/estamp
   node --version
   corepack yarn --version
   corepack yarn install
   ```

3. Rust の lock を再生成し、再開後のオフライン検証に必要なソースを取得する。ここでは `--locked` を付けずに生成し、生成後の取得には付ける。

   ```sh
   cd /Users/tyaromax/Documents/Codex/estamp
   "$HOME/.cargo/bin/cargo" +stable generate-lockfile --manifest-path src-tauri/Cargo.toml
   "$HOME/.cargo/bin/cargo" +stable fetch --locked --manifest-path src-tauri/Cargo.toml
   /usr/bin/git diff --stat -- yarn.lock src-tauri/Cargo.lock
   ```

依存の取得エラーがあれば出力を残し、未検証のまま任意の版へ変更せず再開時に共有する。Rust と Yarn の実行版も共有する。`generate-lockfile` は推移依存も再解決するため、再開時に差分を確認する。

## 再開後の実装・確認

- v2 schema と設定階層への移行（既存 identifier `tyaromax` を維持）。
- `@tauri-apps/api/core` への import 移行、Rust の公式 clipboard-manager 登録、フロントの画像書込み経路の切替。
- main ウィンドウに必要な書込み権限だけを追加。読取り権限や広範な default 権限を追加しない。画像 API に必要な core 権限も採用版で確認する。
- 未使用 Greet / SVG 雛形の削除（`index.html` の favicon 参照も含めて確認）。既存の save / load を維持し、保存先の正常化は PR-02。
- `yarn check`、`yarn build`、Mac の Rust check / Tauri release build を実施。現時点ではソースと設定が v1 のため、取得直後のビルド成功は期待しない。
- lock 内の旧 v1 clipboard / Tauri 依存の解消確認、実際の Rust・Node・Yarn 版の記録と固定方針の確定。
- Windows の確認は `outputs/pr01-windows-check.md` に従う。画像コピーの完成判定は PR-05。
