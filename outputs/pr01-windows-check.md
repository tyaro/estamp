# PR-01: Windows 確認手順（未実施）

Mac の最新検証結果は [第5回結果](pr01-final5.md)、依存選定の履歴は [第4回結果](pr01-final4.md) と [ローカル依存調査](pr01-dependency-audit4.md) を参照。旧 [追加取得手順](pr01-need-install2.md) の runtime 2版だけを戻す案は使用しない。今回の lock は Tauri 2.12.2 / tauri-build 2.7.1 / JS API・CLI 2.12.4 / clipboard-win 5.4.3。identifier は `jp.tyaro.estamp` に確定。Windows での以下の検証は未実施。

[Windows CI](../.github/workflows/windows.yml) を追加した。push / pull_request で Rust 1.95.0、Node 24 / Yarn 1.22.22 による check / test / release build を実行するが、GUI・画像貼付・インストーラーの確認は実機で行う。

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
- 編集 UI と既存の保存／読込 IPC が権限エラーなく動く。設定保存先は PR-02 で修正予定のため、CWD 依存の問題は別途記録する。
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

対象コミット、Windows の版／ビルド、CPU、MSVC／SDK／WebView2／Rust／Node／Yarn の版、コマンドの終了コードとログ、起動スクリーンショット、release EXE の SHA-256、未解決の問題を残す。この Mac では Windows Rust check / release build / 起動確認は未実施。
