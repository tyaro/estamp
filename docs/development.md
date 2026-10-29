# 開発と検証

## 固定依存と検証範囲

Tauri Rust 2.12.2 / tauri-build 2.7.1、JS API・CLI 2.12.4、clipboard-manager Rust・JS 2.3.0、Windows の clipboard-win 5.4.3 を使用する。直接依存は完全一致、推移依存は lock に固定する。Rust の指定版は1.95.0、Node は24.22.1、Yarn Classic は1.22.22。identifier は `jp.tyaro.estamp`。MSIX Identity / Publisher は PR-07 で別途確定する。

2026-10-29 の Mac ARM64 環境は stable Rust / Cargo 1.99.1、Node 24.22.1、Yarn 1.22.22。PR-01 で型検査・オフライン Rust check / test・Tauri release build（bundle なし）が成功した。Rust 1.95.0、Windows、GUI / OS clipboard の成功を意味しない。PR-02 の検証と受入項目は [設定ストアの仕様](settings-storage.md) を参照。

[Windows CI](../.github/workflows/windows.yml) は Rust 1.95.0 / Node 24 / Yarn 1.22.22 で復元・型検査・Rust check / test・Tauri release build を順に実行する。CI の実行結果と GUI・画像貼付・インストーラーの確認は別途取得する。

## Mac の起動

リポジトリ直下で、固定依存を復元した環境から実行する。ビルド・テストは1つずつ、Cargo は `-j 2` とする。

```sh
node node_modules/@tauri-apps/cli/tauri.js dev -- --locked --offline -j 2
```

CLI を Node で直接呼び、Yarn による `--` の除去を避ける。オフラインで依存が不足した場合は停止し、別途必要な取得を行う。開発時の旧設定取込は実行バイナリ隣のみを対象とする。

## 環境

- Windows 11 x64、通常ユーザーで確認する。
- Visual Studio 2022 Build Tools の「C++ によるデスクトップ開発」、MSVC x64、Windows SDK を導入する。
- WebView2 Evergreen Runtime を用意し、版を記録する。ランタイム未導入環境の配布検証は PR-07。
- Node `24.22.1`、Yarn Classic `1.22.22`、Rust `1.95.0` の MSVC x64 toolchain を用意する。`.nvmrc` / `packageManager` / `rust-toolchain.toml` と一致させる。
- 以下の例ではリポジトリを `C:\work\estamp` に配置する。PowerShell で実行する。途中のコマンドが非ゼロで終了したら、後続を実行せずログを確認する。Cargo は `-j 2`、ビルド・テストは1つずつ実行する。

## lock による依存復元・ビルド

作業ディレクトリ: `C:\work\estamp`。

```powershell
Set-Location C:\work\estamp
git branch --show-current
git rev-parse HEAD
node --version
corepack yarn --version
rustc --version --verbose
cargo --version
rustup show active-toolchain
corepack yarn install --frozen-lockfile
# cargo fetch は -j 非対応。並列2制限を維持するため、初回 check で依存を取得する。
corepack yarn run check
cargo check -j 2 --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle --target x86_64-pc-windows-msvc -- --locked --offline -j 2
git diff --exit-code -- yarn.lock src-tauri/Cargo.lock
```

ロックを変更せず復元できること、型チェック・フロント build・Rust check・Tauri release build がすべて終了コード 0 で完了することを記録する。MSIX 生成は PR-07。
Yarn Classic の `yarn check` は組込みコマンドのため、型検証には `yarn run check` を使用する。
release build は Yarn による `--` の除去を避けるため、インストール済み CLI を Node で直接呼ぶ。`beforeBuildCommand` が Vite 本番 build を実行する。CLI 2.12.4 で `STATIC_VCRUNTIME` 非推奨警告の有無も記録する。Mac では指定 PATH の stable Rust 1.99.1 で検証したため、固定版 1.95.0 での結果も記録する。Settings の round-trip テストは一時ディレクトリを使い、追跡済み `Setting.json` と CWD を変更しない。

## 実行確認

作業ディレクトリ: `C:\work\estamp`。

```powershell
Set-Location C:\work\estamp
node node_modules/@tauri-apps/cli/tauri.js dev -- --locked --offline -j 2
```

- ウィンドウが起動し、印影・日本語の上段／下段が表示される。
- 編集 UI と既存の保存／読込 IPC が権限エラーなく動く。設定は app_config_dir に保存され、終了・再起動後も復元される。CWD を変えても保存先が変わらない。
- 印影クリック時に公式 clipboard-manager の画像書込みが呼ばれ、権限エラーが出ない。画像品質・フォント・貼付先別の完成判定は PR-05。
- capabilities が main ウィンドウに限定され、clipboard 読取り・全 API 許可がないことをソースとログで確認する。
- 採用した権限は `core:image:allow-new`、`clipboard-manager:allow-write-image`、`core:resources:allow-close` の3つ。Canvas RGBA → `Image.new` → `writeImage` → `Image.close` の経路を使用する。
- 開発サーバー終了後、release 実行ファイルでもウィンドウと印影が表示される。

release 実行の作業ディレクトリも `C:\work\estamp`。

```powershell
Set-Location C:\work\estamp
& .\src-tauri\target\x86_64-pc-windows-msvc\release\estamp.exe
Get-FileHash .\src-tauri\target\x86_64-pc-windows-msvc\release\estamp.exe -Algorithm SHA256
```

## 保存する証跡

対象コミット、Windows の版／ビルド、CPU、MSVC／SDK／WebView2／Rust／Node／Yarn の版、コマンドの終了コードとログ、起動スクリーンショット、release EXE の SHA-256、未解決の問題を残す。Windows Rust check / release build / 起動確認は未実施。
