# PR-01 第4回: 依存修正と検証結果

> 第4回時点の履歴。第5回で CLI を 2.12.4、clipboard-win を 5.4.3、identifier を `jp.tyaro.estamp` に変更した。最新の対応・検証・コミット手順は [第5回結果](pr01-final5.md) を参照し、以下の旧コミット手順は使用しない。

検証日: 2026-10-29（JST）。対象はこの estamp リポジトリのみ。調査開始 HEAD は `4841977eef3c2aa4bc7adc5b102f2245575b8fee`。他リポジトリ・worktree は参照・変更していない。push・マージは行っていない。

## 根本原因

旧 lock は Tauri 2.8.5 に対して runtime-wry 2.9.3 / runtime 2.12.2 / macros 2.7.4 / utils 2.10.2 を解決していた。旧本体が許可する `^` の広い範囲を満たしていても、内部 API はこの組合せで互換でなかった。

runtime-wry 2.8.1 / runtime 2.8.0 は Tauri 2.8.5 の manifest と同梱 Cargo.lock に合っている。直前の9件の E0599 は、この2版そのものが原因ではなく、残っていた **tauri-macros 2.7.4** が旧本体にない `crate::Error::UnexpectedMenuKind` を生成することが原因。ローカルの `tauri-macros-2.7.4/src/menu.rs:133` と `tauri-2.8.5/src/error.rs`、新本体 `tauri-2.12.2/src/error.rs:177` を確認した。

Tauri 2.8.5 を保つには同梱 lock の macros / codegen 2.4.0、utils 2.7.0 等まで含めた整合が必要だが、これらはキャッシュにない。さらに tauri-plugin 2.7.2 は utils `~2.10.2` を要求するため、プラグイン側の選定も必要になる。runtime の2版だけを戻す旧手順は採用しない。

## 選んだ組合せと根拠

根拠はネットワーク情報ではなく、この Mac の `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f` と sparse index の公式 manifest / ソース / 同梱 lock。要求範囲・旧版維持案との比較・全 crate の差分は [依存調査](pr01-dependency-audit4.md) に記録した。

| 項目 | 採用版 | 根拠 |
| --- | --- | --- |
| tauri | 2.12.2 | 直接依存を完全一致固定。新 macros が要求する Error variant を持つ |
| tauri-build | 2.7.1 | 本体の `^2.7.1` を満たし、直接依存を完全一致固定 |
| tauri-runtime | 2.12.2 | 本体 / runtime-wry の `~2.12.1` 内 |
| tauri-runtime-wry | 2.12.1 | 本体の `~2.12.1` 内 |
| tauri-macros / tauri-codegen | 2.7.4 / 2.7.4 | 本体 / build の `~2.7.1` 内 |
| tauri-utils | 2.10.2 | 本体 / build / runtime-wry の `~2.10.1`、runtime / macros の `~2.10.2` 内 |
| wry / tao / muda | 0.57.0 / 0.37.1 / 0.20.0 | runtime-wry の `^0.57.0` / `^0.37.0`、本体の `^0.20` 内 |
| tauri-plugin | 2.7.2 | clipboard-manager build 依存の `^2.3` 内 |
| clipboard-manager Rust / JS | 2.3.0 / 2.3.0 | Rust 側 tauri `^2.6`、JS 側 API `^2.6.0` を満たす |
| JS API / CLI | 2.12.4 / 2.8.4 | API は本体と同じ minor へ更新し `resolutions` で統一。既存 CLI で実 build 成功 |

推移依存は `src-tauri/Cargo.lock`、JS は `yarn.lock` で固定する。JS API 2.12.4 の取得と Yarn lock 更新は、今回の再開前にユーザーがサンドボックス外で実施済み。今回の作業中に追加ダウンロードは不要だったため `pr01-need-install4.md` は作成していない。

identifier は **`tyaromax`** を維持。main ウィンドウの権限は `core:image:allow-new` / `clipboard-manager:allow-write-image` / `core:resources:allow-close` の3つを維持した。

## 実行環境とコマンド

- macOS 27.2（26B123）、arm64 / aarch64-apple-darwin、Apple clang 21.0.0。
- Node 24.22.1、Yarn Classic 1.22.22。
- 実際に使用した Rust は **1.99.1**（58cf8f9c3、LLVM 23.1.1）。
- `rust-toolchain.toml` は従来の **1.95.0** のまま。指定 PATH は rustup shim を経由せず stable のバイナリを直接選ぶ。この Mac に 1.95.0 はなく、同版での検証は未実施。展開済み依存 manifest の最大 `rust-version` は 1.90 だったが、コンパイルによる保証の代わりにはならない。

すべての実行で以下の PATH を設定した。Cargo の check / build / test はすべて `-j 2`、ビルド・テストは同時に1つのみ。

```sh
export PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/tyaromax/.nvm/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH

corepack yarn run check
cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --locked --offline -j 2
cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
node outputs/pr01-image-ipc-smoke4.mjs
```

release build の `beforeBuildCommand` が `corepack yarn build` を実行するため、フロント build はその中で検証した。Yarn の `yarn check` は組込みの依存検証となるため、Svelte 型検証には `yarn run check` を使用した。

## 検証結果

| 検証 | 結果 | ローカルログ |
| --- | --- | --- |
| Svelte / TypeScript | 成功（終了0）、診断エラー0・警告0 | `pr01-svelte-check4.log` |
| cargo check | 成功（終了0）、`--locked --offline` | `pr01-cargo-check4.log` |
| Vite 本番 build | 成功、49 modules、1.63秒 | `pr01-release-build4.log` 内 |
| Tauri release build | 成功（終了0）、optimized、2分59秒 | `pr01-release-build4.log` |
| cargo test | 成功（終了0）、既存テスト0件・失敗0件、1分09秒。Rust の機能テストは未整備 | `pr01-cargo-test4.log` |
| JS Image / clipboard IPC smoke | 成功（終了0）、RGBA → ResourceId → write_image → close、共通 Image class の認識を確認 | `pr01-image-ipc-smoke4.log` |
| GUI / OS clipboard / Windows | 未実施。手順を準備 | 下記 / Windows 手順 |

生成物: `src-tauri/target/release/estamp`（Mach-O 64-bit arm64、フロント資産を内包）。app / DMG / MSIX パッケージ生成、署名・公証は今回行っていない。

SHA-256:

```text
fa8d75db88e342a7aa02ce5217e16dcbb733c594f015fc4f0097ec00a7f889eb
```

検証ログ（`.log`）はローカルに保存し、Git の既存 ignore に従ってコミット対象に含めない。共有可能な結果は本書、依存根拠は調査記録、再実行可能な JS smoke は [スクリプト](pr01-image-ipc-smoke4.mjs) に残す。

### build 時に分かった制限

1. 最初の `corepack yarn tauri build --no-bundle -- --locked --offline -j 2` は、Yarn 1 が引数区切りを消して `tauri build --locked --offline -j 2` となり、CLI の引数解析で終了2。コンパイル前の失敗であり、Node でインストール済み CLI を直接実行すると成功した。旧失敗ログは `pr01-release-build4-yarn-forwarding.log`。README / Windows 手順も修正した。
2. stable toolchain の `rust-objcopy` が `@rpath/libLLVM.dylib` を解決できず、build script / アプリのデバッグ情報除去に警告が出た。コンパイルとリンクは成功したが、デバッグ情報の除去成功は保証しない。ライブラリ自体は toolchain の `lib/libLLVM.dylib` にあり、`DYLD_LIBRARY_PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/lib"` を付けた `rust-objcopy --version` は成功した。toolchain 自体は変更していない。
3. CLI 2.8.4 が設定する `STATIC_VCRUNTIME` に対し、tauri-build 2.7.1 が非推奨警告を出した。今回の Mac build は成功。Windows の runtime linkage は実機 build で確認する。
4. Yarn の cache/global folder 警告と古い Browserslist データの案内が出た。型検証・フロント build は成功。追加パッケージ取得は行っていない。

## 実起動確認の準備と残課題

release は dev サーバーなしで起動できる。既存の `load` / `save` は CWD の `Setting.json` を扱うため、追跡ファイルを上書きしないよう専用の一時ディレクトリで試す。次のコマンドは手動確認用で、この作業では未実行。

```sh
export PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/tyaromax/.nvm/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH
cd /Users/tyaromax/Documents/Codex/estamp
pr01_smoke_dir=$(mktemp -d "${TMPDIR:-/tmp}/estamp-pr01-smoke.XXXXXX")
cp src-tauri/Setting.json "$pr01_smoke_dir/Setting.json"
echo "$pr01_smoke_dir"
cd "$pr01_smoke_dir"
/Users/tyaromax/Documents/Codex/estamp/src-tauri/target/release/estamp
```

確認項目:

- 「電子印」ウィンドウ、印影、上段・下段の日本語が表示される。
- 編集・保存・終了後の再起動で専用ディレクトリの設定が復元される。
- 印影クリックで画像書込みが成功し、権限エラーが出ない。貼付先で画像を確認する。
- ウィンドウを拡大して編集欄・保存ボタンも確認し、スクリーンショット、OS、成果物ハッシュ、結果を記録する。

JS smoke は API / プラグイン間の ResourceId 転送だけを検証し、WebView・ACL の実行・OS clipboard・印影の品質は証明しない。Google Fonts の実行時 import は PR-03、保存先は PR-02、画像品質の完成判定は PR-05 の課題として残る。

Windows 11 x64 の Rust check / release build / test / 起動は [Windows 確認手順](pr01-windows-check.md) に従って別途実施する。Rust 1.95.0 での再検証も残る。**PR-01 全体の受け入れは Windows の条件を含むため、まだ完了とはしない。**

## コミット

**今回のコミットは作成できなかった。** `/usr/bin/git add` と `/usr/bin/git commit` を実行したが、どちらも終了128で、サンドボックスが `.git/index.lock` の作成を拒否した。

```text
fatal: Unable to create '/Users/tyaromax/Documents/Codex/estamp/.git/index.lock': Operation not permitted
```

これは依存取得の不足ではなく `.git` への書込み制約。変更は作業ツリーに残っている。既存の会話ログ・プロンプト等の未追跡ファイルは保持し、コミット対象には含めない。サンドボックス外で次の2単位をコミットできるよう準備した。

```sh
cd /Users/tyaromax/Documents/Codex/estamp
/usr/bin/git add -- package.json yarn.lock src-tauri/Cargo.toml src-tauri/Cargo.lock
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "fix: align Tauri v2 core runtime and JS API dependencies"

/usr/bin/git add -- README.md outputs/pr01-dependency-audit4.md outputs/pr01-image-ipc-smoke4.mjs outputs/pr01-windows-check.md outputs/pr01-final4.md
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "docs: record PR-01 offline verification and launch handoff"
```

先に既存のステージ済み変更がないことを確認し、各コマンドが失敗したら後続へ進まない。今回の作業開始時とコミット失敗後のステージ済み変更は0件。最終 `git diff --check` は成功。

## PR 本文案

タイトル: `fix: Tauri v2 の依存組合せを整合しオフライン release build を復旧`

> Tauri 2.8.5 と新しい macros / runtime / utils が混在し、内部 API の不整合で Rust check が失敗していた。ローカル registry の manifest・index・ソースを根拠に、Tauri 2.12.2 / tauri-build 2.7.1 と互換範囲内の推移依存へ揃え、JS API 2.12.4 を単一版に固定した。identifier `tyaromax` と main ウィンドウの3権限を維持した。
>
> Mac arm64、指定 PATH の Rust 1.99.1 で型検証（診断0件）、オフライン cargo check、Vite 本番 build、Tauri release build、cargo test（既存テスト0件）が成功した。実際の JS パッケージで Image 生成・ResourceId の画像書込み・解放を模擬 IPC 検証した。Yarn Classic の引数転送を避ける build 手順と、専用 CWD を使う実起動手順を記録した。
>
> 残課題は GUI / OS clipboard、Windows の check・release build・起動、固定 Rust 1.95.0 での再検証。Mac の release build には toolchain のデバッグ情報除去と STATIC_VCRUNTIME 非推奨の警告が残る。PR-01 の Windows 受け入れは未完了。
