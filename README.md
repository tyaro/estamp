# 電子印

個人的に練習用で作成

## 開発環境

- Node.js **24.22.1**（`.nvmrc`）、Yarn Classic **1.22.22**（`packageManager`）
- Rust **1.95.0**（`rust-toolchain.toml`）と各 OS の Tauri ビルド前提環境
- Tauri Rust **2.12.2** / build **2.7.1**、JS API / CLI **2.12.4**、clipboard-manager Rust / JS **2.3.0**

直接依存は完全一致で固定し、推移依存は `yarn.lock` / `src-tauri/Cargo.lock` で固定する。
JS API は `resolutions` でも統一し、プラグインとの `Image` クラスの重複を防ぐ。
Svelte / Vite の大型更新は別作業とする。

```sh
corepack yarn install --frozen-lockfile
corepack yarn run check
cargo check -j 2 --locked --manifest-path src-tauri/Cargo.toml
cargo test -j 2 --locked --manifest-path src-tauri/Cargo.toml
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked -j 2
node node_modules/@tauri-apps/cli/tauri.js dev -- --locked --offline -j 2
```

Yarn Classic の `yarn check` は組込みの依存整合性コマンドになるため、型検証は必ず **`yarn run check`** とする。
依存取得済みの環境では Cargo に `--offline` を追加できる（Tauri build は `-- --locked --offline -j 2`）。
Yarn Classic が Tauri / Cargo 間の `--` を消す場合があるため、release build はインストール済み CLI を Node で直接呼ぶ。Tauri の `beforeBuildCommand` が Vite 本番 build を実行する。ビルド・テストは1つずつ実行する。
Windows の実機確認、Mac の起動手順、検証範囲は [開発・検証手順](docs/development.md) を参照。Mac の既存検証は stable Rust **1.99.1** で実施し、固定版 **1.95.0** での検証は未実施。
GitHub Actions の [Windows CI](.github/workflows/windows.yml) は push / pull_request ごとに Windows、Rust **1.95.0**、Node **24**、Yarn **1.22.22** で依存復元・型チェック・Rust check / test・Tauri release build（bundle なし）を順に実行する。CI の実行結果と GUI / clipboard の実機確認は別途記録する。

アプリの identifier は **`jp.tyaro.estamp`** に確定した。Store の MSIX Identity / Publisher 割当値は別途 PR-07 で扱う。
Vite は `TAURI_ENV_PLATFORM` / `TAURI_ENV_DEBUG` を参照し、フロントへ公開する Tauri 環境変数を `TAURI_ENV_` に限定する。
設定の `$schema` は固定 CLI 2.12.4 同梱のローカルファイルを参照するため、エディタ検証には依存復元が必要。

画像コピーは公式 clipboard-manager を使用する。main ウィンドウに画像生成・画像書込み・リソース解放だけを許可し、clipboard 読取りや default 権限は追加しない。
既存の `save` / `load` と CWD 相対の `Setting.json` は維持する。保存・読込の共通処理は一時ディレクトリで round-trip テストする。保存先と書込みエラー処理の正常化は PR-02、書体同梱は PR-03、画像品質の完成判定は PR-05、CSP の厳格化は PR-06 で行う。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
