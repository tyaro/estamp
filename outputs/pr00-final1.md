# PR-00 実装結果

実施日: 2026-10-29（JST）。対象は `/Users/tyaromax/Documents/Codex/estamp` のみ。ブランチ `feat/pr-00-release-identity`、開始 HEAD **`8bc6ea9e659424d6cc9b69c5e7d348bd3831013d`**（PR-01 マージ済み）。

PR-00 の公開方針・MIT・製品メタデータを反映した。Store 割当値は未取得として記録し、本人の外部操作は「ユーザー作業」へ引き継ぐ。コミット・push・マージは行っていない。

## PR-00 の範囲と根拠

行番号は今回更新後の [計画書](../docs/store/estamp-plan.md) に対応する。括弧内は開始 HEAD の行番号。

| 根拠 | 今回の対応 |
| --- | --- |
| [71行目](../docs/store/estamp-plan.md#pr-00公開条件識別情報mit-の確定05-人日)〜79行目（旧68〜74行目）: PR-00 の目的・変更範囲・受け入れ条件 | 公開方針文書、LICENSE、Cargo / package / Tauri の製品メタデータ、対象コミット・無料方針・OS・初回機能・identifier・暫定情報の記録 |
| 44〜55行目（旧42〜52行目）: 論点表、PR-00 が期限の項目 | 基準、製品の位置付け、発行元と識別情報、公開環境、ポータブル版、ライセンス共通部品の時期を決定済み／暫定／未取得に分けて更新。書体と小さな起動画面の意図も記録 |
| 210行目（旧205行目）: 着手順1 | 基準・初回範囲・識別子・日付仕様の参照先を固定し、アカウント確認・名前予約・identity 取得等の外部作業を分離 |
| 220〜225行目（旧215〜220行目）: 部門間の受渡し | 公開方針に担当・成果物・後続 PR の期限を記録 |
| 91〜108行目（旧86〜103行目）: PR-02・03 の範囲 | 保存先変更・書体同梱は実装せず、確認できた旧設定 schema と両書体の選定だけを引き継ぐ |
| [デザイン仕様](../docs/design/estamp-design-rules.md) 3〜5行目、29〜32行目 | 書体の決定と、和暦直接入力はデザイン仕様優先・実装 PR-04 であることを文書に反映 |

PR-01 の再実装、APPDATA 保存先への変更、フォント取得・同梱、和暦処理、コピー処理の変更、About UI、CSP の変更、MSIX 生成・署名・提出は含めていない。計画書の後続 PR 部分では、確認済みの設定実物や書体選定を受け渡すための記述だけを整えた。

## 変更内容

| ファイル | 内容 |
| --- | --- |
| [LICENSE](../LICENSE) | MIT 全文、`Copyright (c) 2026 Banto Works`。暫定の権利表記であることは公開方針に明記し、本文は通常の MIT 形式とした |
| [package.json](../package.json) | `license: MIT` と製品説明を追加、版を既存 Tauri と同じ `0.0.1` に統一 |
| [Cargo.toml](../src-tauri/Cargo.toml) | 既存 `license = "MIT"` と著者 `K.T` を保持、製品説明・版を統一 |
| [Cargo.lock](../src-tauri/Cargo.lock) | 本体 estamp の版だけ `0.0.0` → `0.0.1`。依存解決・checksum・依存バージョンは変更なし |
| [tauri.conf.json](../src-tauri/tauri.conf.json) | 発行元表示名 Banto Works、著作権表記、MIT、原本 LICENSE の参照と配布資源への割当、製品説明を追加 |
| [公開方針](../docs/store/estamp-release-policy.md) | 基準コミット、無料・初回範囲、Windows 11 x64 日本語、暫定表記、MSIX 用プレースホルダ・転記手順、書体、小さな起動画面の意図、部門への引継ぎを記録 |
| [計画書](../docs/store/estamp-plan.md) | PR-00 の決定済み論点・実施記録・着手順を更新。古い HEAD の調査と今回の基準を区別し、既存設定の実物・schema、デザイン仕様の優先関係を反映 |
| [README](../README.md) | 公開方針・MIT への入口、暫定表示名・著作権表記、書体選定と小さな起動画面の意図を追記 |
| 本書 | 検証結果、コミット手順、ユーザー作業、PR 案 |

identifier は PR-01 で **`jp.tyaro.estamp`** に設定済みであることを確認し、そのまま維持した。Tauri の `app` / `build` 全体、ウィンドウタイトル・寸法・可変設定、フロント・Rust の処理、既存 `Setting.json`、capabilities、デザイン仕様、`yarn.lock` は開始 HEAD と同一。

UI 書体は BIZ UDPゴシック（BIZ UDPGothic）、印影書体はしっぽり明朝 B1（Shippori Mincho B1）。PR-00 は決定事項の記録のみ。印影だけの小さな起動画面（250×120、最大250×310）は意図した仕様で、設定は基本的に初回だけ行うことを明記した。

## 検証結果

毎回、指定 PATH を設定した。ビルド・テストは同時に1つ、Cargo は `-j 2`、`--locked --offline`。Corepack の追加取得を防ぐため Yarn 実行時は `COREPACK_ENABLE_NETWORK=0` も設定した。

```sh
export PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/tyaromax/.nvm/versions/node/v24.22.1/bin:/usr/bin:/bin:$PATH
export COREPACK_ENABLE_NETWORK=0

corepack yarn run check
cargo check -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
cargo test -j 2 --locked --offline --manifest-path src-tauri/Cargo.toml
```

| 確認 | 結果 | ログ |
| --- | --- | --- |
| 実行環境 | macOS 27.2 / arm64、Node 24.22.1、Yarn 1.22.22、Rust / Cargo 1.99.1 | [pr00-environment1.log](pr00-environment1.log) |
| メタデータ整合性 | 終了0。Cargo metadata のオフライン読取、版・MIT・説明・著者・LICENSE パス、追加設定キーとローカル CLI schema、アプリ処理・ウィンドウ設定の無変更、依存 lock の不変を確認 | [pr00-config-check1.log](pr00-config-check1.log) |
| Svelte / TypeScript | 終了0、診断エラー0・警告0、5.14秒 | [pr00-svelte-check1.log](pr00-svelte-check1.log) |
| Rust check | 終了0、9.53秒 | [pr00-cargo-check1.log](pr00-cargo-check1.log) |
| Rust test | 終了0、コンパイル5.22秒。既存 `settings_save_load_round_trip` 1件成功、失敗0件 | [pr00-cargo-test1.log](pr00-cargo-test1.log) |
| 最終確認 | 終了0。`git diff --check`、変更ファイルの範囲、ステージ済み変更なし、HEAD・ブランチ維持、文書リンク、`target/debug/LICENSE` とルート原本のバイト一致 | [pr00-final-check1.log](pr00-final-check1.log) |

指定 PATH は stable の実体を選ぶため、今回は Rust **1.99.1** で検証した。`rust-toolchain.toml` の **1.95.0** や Windows 環境での今回の検証ではない。共有 Mac の toolchain は変更していない。

Yarn は書込み不可の優先 cache/global folder、Browserslist データの古さを案内したが、型チェックは成功した。依存追加やデータ更新は行っていない。ダウンロードは不要だったため `pr00-need-install1.md` は作成していない。

debug 側への LICENSE コピーは確認済み。Windows の最終配布物・MSIX への実同梱、GUI・clipboard、Store 操作は今回未検証であり、それぞれ計画の後続 PR で受け入れる。今回の check / test を正式 MSIX の受け入れ完了とは扱わない。

## コミット手順（ユーザーがサンドボックス外で実行）

`.git` 書込み禁止のため、ここでは `git add` / `git commit` を実行していない。同じ estamp リポジトリ・ブランチで以下を実行する。ブランチが異なる、既にステージ済み変更がある、コマンドが失敗した場合は後続を止める。既存の未追跡プロンプト・会話ログ等は追加しない。検証 `.log` は既存 `.gitignore` の対象なのでローカル保存のみとする。

```sh
cd /Users/tyaromax/Documents/Codex/estamp
/usr/bin/git branch --show-current
/usr/bin/git diff --cached --quiet
/usr/bin/git diff --check

/usr/bin/git add -- LICENSE package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "chore: PR-00 の MIT と製品メタデータを整備"

/usr/bin/git add -- README.md docs/store/estamp-plan.md docs/store/estamp-release-policy.md outputs/pr00-final1.md
/usr/bin/git diff --cached --check
/usr/bin/git commit -m "docs: PR-00 の公開方針と Store 識別情報の引継ぎを記録"
```

push・マージはこの手順に含めない。

## ユーザー作業

以下は未実施。PR-00 の外部作業として本人・担当部門へ渡す。

1. **公開前の暫定表記の最終確認:** 発行元表示名 Banto Works、MIT、`Copyright (c) 2026 Banto Works` の権利関係・年を確認する。現時点では依頼どおりの暫定表記を適用済みで、今回の実装を待たせる承認工程は追加していない。
2. **Partner Center アカウント確認・名前予約:** 本人の対象アカウントと発行元を確認し、estamp の名前を予約する。予約可否・完了は今回未確認。
3. **Product identity の転記:** 対象製品の Package/Identity/Name、Package/Identity/Publisher（`CN=...` 全体）、PublisherDisplayName、Store ID、PFN を、[公開方針の表と手順](../docs/store/estamp-release-policy.md#store-識別情報暫定転記待ち) に従って転記する。取得日・対象製品・確認者を残す。`CN=Banto Works` や Tauri identifier から推測しない。**PR-07 の正式 MSIX 受け入れ前**にプレースホルダを解消する。
4. **既存配布物の情報（存在する場合）:** 旧ポータブル版などの所在・入手経路・設定実物を提供する。今回確認したのはこのリポジトリの設定だけで、他リポジトリ・worktree は調査していない。追加互換対応は別途判断する。
5. **部門への手配:** 企画へ無料方針・初回機能と掲載／プライバシー骨子、デザインへ PR-03 前の書体ウエイト／ライセンス資料と PR-06 前の画面・アイコン、品質へ Windows 11 x64 端末確保を渡す。依頼メッセージの送信や外部アカウント操作は行っていない。
6. **リポジトリへの記録:** 上記コミット手順を実行する。後続の Windows 検証・MSIX 工程・Store 提出はそれぞれの PR で行う。

## 日本語 PR タイトル案

`PR-00: 無料公開方針・識別情報・MIT ライセンスを整備`

## 日本語 PR 本文案

```markdown
PR-01 マージ後の 8bc6ea9 を基準として、estamp の初回無料公開に必要な方針・識別情報・権利表記を記録します。

- ルートに MIT LICENSE を追加し、暫定の著作権表記を Copyright (c) 2026 Banto Works としました。package / Cargo / Tauri のライセンス・製品説明と開発版 0.0.1 を揃え、Tauri に発行元と LICENSE 配布資源を設定しました。
- identifier は設定済みの jp.tyaro.estamp を確認しました。MSIX Identity Name / Publisher は未取得のプレースホルダとし、Partner Center からの転記手順と本人作業を記録しました。
- Windows 11 x64 日本語、無料・広告／課金／試用期限なし、初回機能の範囲を公開方針にまとめ、計画書の決定事項と部門への引継ぎを更新しました。
- UI は BIZ UDPゴシック、印影はしっぽり明朝 B1 に決定し、同梱・実装は PR-03 に残しました。小さな印影だけの起動画面は意図した仕様として記録し、寸法を維持しました。

検証: corepack yarn run check、cargo check / test -j 2 --locked --offline はすべて成功。既存テスト1件成功。メタデータ・原本 LICENSE の debug 資源へのコピー一致・差分チェックも確認しました。実行環境は Mac arm64 / Rust 1.99.1 です。

保存先変更、フォント同梱、和暦実装、UI 変更、MSIX 生成は含みません。Windows の最終配布物と Store 割当値の確認は後続工程です。詳細・ログ・ユーザー作業は outputs/pr00-final1.md を参照してください。
```
