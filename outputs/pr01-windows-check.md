# PR-01: Windows 確認手順（未実施）

Mac の Rust check / release build が通ったコミットを使用する。v2 の設定・API・プラグイン移行と JS 検証は済んだが、Rust の推移依存不整合で停止中。[追加取得手順](pr01-need-install2.md) を解消するまで、この手順のビルド対象としては未完成。

## 環境

- Windows 11 x64、通常ユーザーで確認する。
- Visual Studio 2022 Build Tools の「C++ によるデスクトップ開発」、MSVC x64、Windows SDK を導入する。
- WebView2 Evergreen Runtime を用意し、版を記録する。ランタイム未導入環境の配布検証は PR-07。
- Node `24.22.1`、Yarn Classic `1.22.22`、Rust `1.95.0` の MSVC x64 toolchain を用意する。`.nvmrc` / `packageManager` / `rust-toolchain.toml` と一致させる。
- 以下の例ではリポジトリを `C:\work\estamp` に配置する。PowerShell で実行する。途中のコマンドが非ゼロで終了したら、後続を実行せずログを確認する。

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
cargo fetch --locked --manifest-path src-tauri/Cargo.toml
corepack yarn run check
corepack yarn build
cargo check --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
corepack yarn tauri build --no-bundle --target x86_64-pc-windows-msvc -- --locked
git diff --exit-code -- yarn.lock src-tauri/Cargo.lock
```

ロックを変更せず復元できること、型チェック・フロント build・Rust check・Tauri release build がすべて終了コード 0 で完了することを記録する。MSIX 生成は PR-07。
Yarn Classic の `yarn check` は組込みコマンドのため、型検証には `yarn run check` を使用する。

## 実行確認

作業ディレクトリ: `C:\work\estamp`。

```powershell
Set-Location C:\work\estamp
corepack yarn tauri dev
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
