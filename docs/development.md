# 開発・検証手順

実装の基準は本リポジトリ。Tauri identifier は `jp.tyaro.estamp`。MSIX Identity / Publisher は PR-07 で別途確定する。
個人の作業メモ・検証ログはバージョン管理せず、継続して必要な仕様・手順・検証範囲は docs に記録する。

## ローカルの検証

依存導入済みのリポジトリルートで以下を1つずつ実行する。Cargo は `-j 2` とし、ネットワークなしの場合は Corepack の取得も止める。

```sh
export COREPACK_ENABLE_NETWORK=0
corepack yarn run check
cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
corepack yarn build
```

`check` は Svelte / TypeScript の診断に続き、日付、保存、App のハンドラーの回帰テストを実行する。追加のテスト依存は使わない。
App テストは実ファイルの TypeScript スクリプトを実行し、DOM 更新・Canvas・Tauri IPC をテスト用の境界に置き換える。実際の Svelte DOM 描画、WebView2、OS クリップボードの確認は実機で行う。

PR-01 時点では Mac の stable Rust 1.99.1 で型検証・Rust check / test・bundle なしの Tauri release build が成功した。固定版 Rust 1.95.0、Windows CI と GUI / 画像貼付けの結果は未取得。既存の Yarn キャッシュ警告と Browserslist データの古さの通知は残る。
[Windows CI](../.github/workflows/windows.yml) は Rust 1.95.0 / Node 24 / Yarn 1.22.22 で check・Rust test・release build を順に実行する。GUI・画像貼付け・インストーラーの確認は含まない。

## Mac で設定ファイルを保護して起動

既存の保存先は CWD の `Setting.json`。追跡済み設定を上書きしないよう、リポジトリ内の専用一時ディレクトリを CWD にして release 実行ファイルを起動する。先に Tauri release build を済ませる。

```sh
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked --offline -j 2
estamp_root="$PWD"
mkdir -p "$estamp_root/outputs"
estamp_run_dir=$(mktemp -d "$estamp_root/outputs/gui-run.XXXXXX")
(cd "$estamp_run_dir" && "$estamp_root/src-tauri/target/release/estamp")
```

アプリ終了後に専用ディレクトリ内の設定だけを確認する。Rust toolchain の選択は `rustc --version` で確認し、共有環境の toolchain は変更しない。

## PR-04 の日付・保存・コピー

日付は時刻なしの `YYYY-MM-DD` で保持し、今日の取得だけローカル年月日の getter を使う。明治6年（1873-01-01）以降の M/T/S/H/R・漢字元号・元年、西暦の年月日を受け付ける。NFKC 正規化後に前後の空白を trim するため、全角空白も利用できる。元号の期間外は補正せず、正しい表記を案内する。受付仕様は [デザイン仕様 §3](design/estamp-design-rules.md) を参照。

自動モードはタイマー・focus・visibilitychange・保存／コピーの直前に今日を確認する。正常な手入力は手動モードとなり、「今日に戻す」で自動へ戻る。不正入力中は入力と最後の正常な印影を保持し、保存・コピーを止める。
設定に `date_mode`（既定 `auto`）、`date_format`（既定 `gregorian`）、`manual_date`（既定 `null`）だけを追加した。旧設定は serde の既定値で読み、手動日付は共通の検証器で復元する。

保存 IPC には開始時のスナップショットを渡し、応答後は編集中のストアへ書き戻さない。画像生成中も編集を受け付ける。コピー直前に再び今日と DOM を更新し、開始時の SVG・出力サイズとの不一致や入力エラーがあれば画像を破棄し、中止して再操作を案内する。コピーの二重実行も抑止する。

回帰テストでは改元境界・閏日・入力形式・空白・東京／ロサンゼルスの日付、保存中の編集保持、App の保存後の書き戻し防止、render / Image.new 待機中の日付・表示形式・入力エラー・日跨ぎ・出力サイズの変更を扱う。Rust の旧形式設定はテスト内の JSON で用意し、往復テストは一時ディレクトリを使う。

2026-10-29 の PR-04 品質レビュー対応では、Mac / Node 24.22.1 / Yarn 1.22.22 / Rust 1.99.1 で上記4コマンドが成功した。Svelte 診断はエラー・警告0件、日付10件・保存3件・App13件・Rust2件が成功。旧コピー判定と保存後の書き戻しをテスト内だけで再現し、回帰テストが失敗を検出することも確認した。依存追加・lock 更新・ネットワーク取得は行っていない。

実機では `Ｒ７．１０．２２` → 和暦切替 → 保存／再起動、`H31.5.1` → 訂正表示とコピー無効 → `R元.5.1` → 今日に戻す、生成中の日付変更後の再コピーを確認する。長い和暦の収まり・WebView2・画像貼付けは未検証。ウィンドウサイズ・保存先・依存と lock は PR-04 では変更しない。
保存先・書込み失敗・初回の設定なしの読込通知は PR-02、書体同梱は PR-03、画像品質と貼付先別判定は PR-05、CSP は PR-06 に残る。

## Windows の確認環境

- Windows 11 x64、通常ユーザーで確認する。
- Visual Studio 2022 Build Tools の「C++ によるデスクトップ開発」、MSVC x64、Windows SDK を導入する。
- WebView2 Evergreen Runtime を用意し、版を記録する。ランタイム未導入環境の配布検証は PR-07。
- Node `24.22.1`、Yarn Classic `1.22.22`、Rust `1.95.0` の MSVC x64 toolchain を用意する。`.nvmrc` / `packageManager` / `rust-toolchain.toml` と一致させる。
- 以下の例ではリポジトリを `C:\work\estamp` に配置する。PowerShell で実行する。途中のコマンドが非ゼロで終了したら、後続を実行せずログを確認する。Cargo は `-j 2`、ビルド・テストは1つずつ実行する。

## Windows の依存復元・ビルド

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

## Windows の実行確認

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
