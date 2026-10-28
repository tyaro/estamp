# 電子印

個人的に練習用で作成

## 開発環境

- Node.js **24.22.1**（`.nvmrc`）、Yarn Classic **1.22.22**（`packageManager`）
- Rust **1.95.0**（`rust-toolchain.toml`）と各 OS の Tauri ビルド前提環境
- Tauri Rust **2.12.2** / build **2.7.1**、JS API **2.12.4** / CLI **2.8.4**、clipboard-manager Rust / JS **2.3.0**

直接依存は完全一致で固定し、推移依存は `yarn.lock` / `src-tauri/Cargo.lock` で固定する。
JS API は `resolutions` でも統一し、プラグインとの `Image` クラスの重複を防ぐ。
Svelte / Vite の大型更新は別作業とする。

```sh
corepack yarn install --frozen-lockfile
corepack yarn run check
corepack yarn build
cargo check -j 2 --locked --manifest-path src-tauri/Cargo.toml
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked -j 2
cargo test -j 2 --locked --manifest-path src-tauri/Cargo.toml
node node_modules/@tauri-apps/cli/tauri.js dev -- --locked --offline -j 2
```

Yarn Classic の `yarn check` は組込みの依存整合性コマンドになるため、型検証は必ず **`yarn run check`** とする。
依存取得済みの環境では Cargo に `--offline` を追加できる（Tauri build は `-- --locked --offline -j 2`）。
Yarn Classic が Tauri / Cargo 間の `--` を消す場合があるため、release build はインストール済み CLI を Node で直接呼ぶ。ビルド・テストは1つずつ実行する。
Windows の実機確認は [PR-01 確認手順](outputs/pr01-windows-check.md) を参照。
Mac の検証結果と起動手順は [PR-01 第4回結果](outputs/pr01-final4.md) を参照。今回の指定 PATH では stable Rust **1.99.1** が選ばれ、`rust-toolchain.toml` の **1.95.0** での再検証は未実施。

画像コピーは公式 clipboard-manager を使用する。main ウィンドウに画像生成・画像書込み・リソース解放だけを許可し、clipboard 読取りや default 権限は追加しない。
既存の `save` / `load` と CWD 相対の `Setting.json` は維持する。保存先の正常化は PR-02、書体同梱は PR-03、画像品質の完成判定は PR-05、CSP の厳格化は PR-06 で行う。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
