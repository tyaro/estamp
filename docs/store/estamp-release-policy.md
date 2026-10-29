# estamp 初回公開方針・識別情報（PR-00）

決定日: 2026-10-29（JST）。ユーザー指定の確定仕様に基づく。発行元表示名・著作権者表記は暫定、Store 割当値は未取得として区別する。

## 実装基準と範囲

対象は `/Users/tyaromax/Documents/Codex/estamp`、ブランチは `feat/pr-00-release-identity`。基準コミットは **`8bc6ea9e659424d6cc9b69c5e7d348bd3831013d`**（PR-01 マージ済みの master）。[計画書](estamp-plan.md) の現状調査は `8599f0e` 当時の履歴であり、今回の基準とは異なる。

この基準では Tauri v2、`jp.tyaro.estamp`、設定の `save` / `load`、上段・下段の編集、日付生成、公式 clipboard-manager によるコピー経路が存在する。設定は CWD 相対の `Setting.json` で、追跡済みの実物は `src-tauri/Setting.json`。schema は `top_str` / `btm_str`（文字列）、`top_font_size` / `mid_font_size` / `btm_font_size` / `output_size`（Rust では `u32`）である。日付形式や schema version はまだ保存していない。設定移行の検討材料として PR-02 へ渡し、自動移行の完了や別の配布版との互換性は表明しない。別リポジトリ・worktree の調査は行わない。

PR-00 は公開方針、LICENSE、Cargo / package / Tauri の製品メタデータ、決定事項と外部作業の記録に限定する。PR-01 の再実装、保存先変更、書体の取得・同梱、日付・和暦の実装、コピー経路の変更、UI の変更、MSIX 生成・署名・提出は含めない。

## 初回公開条件

| 項目 | 決定 |
| --- | --- |
| 製品 | estamp。画像の日付印を作るアプリ。本人確認・電子署名・改ざん防止の機能や法的効力をうたわない |
| 価格と本体ライセンス | 無料、MIT。広告・アプリ内課金・試用期限なし |
| 公開対象 | Windows 11 / x64 / 日本語。最低 OS ビルドは PR-07・08 の実機確認で確定し、manifest と掲載文を一致させる |
| 対象外の対応表明 | Windows 10、ARM64、英語、S モードは今回保証しない |
| 初回必須機能 | 上段・下段の編集と保存、単一印影、正常な今日の日付、西暦／和暦、日付指定と今日に戻す、文字サイズ・出力サイズの調整、透過画像コピー、オフライン動作、日本語の操作・エラー表示 |
| 日付仕様の基準 | [デザイン仕様 §3](../design/estamp-design-rules.md#3-和暦の入力仕様確定) を優先。和暦直接入力を含む決定事項は PR-04 で実装する |
| 初回の機能対象外 | 複数プロファイル、色・枠線変更、独立した PNG ファイル保存。画像コピーは必須 |
| ポータブル版 | 初回に新規作成・再作成しない。既存配布物の所在・入手経路は未確認で、必要ならユーザーが情報を提供する。追加対応は別 PR |
| 後続の共通部品 | Store ライセンスの Rust 共通部品は無料公開後の PR-R1・R2。無料機能の制限・課金を加えず、初回公開の完成待ち条件にしない |

上記は初回公開までの受け入れ条件であり、現在のコミットですべて実装・検証済みという意味ではない。

## 製品メタデータと権利表記

| 項目 | 値・状態 |
| --- | --- |
| 製品名 | `estamp`（既存のウィンドウタイトル `電子印` は維持） |
| Tauri identifier | **`jp.tyaro.estamp`（確定）**。PR-01 で設定済み |
| 発行元表示名 | **Banto Works（暫定）**。Tauri の `bundle.publisher` に設定 |
| 本体ライセンス | **MIT**。ルートの `LICENSE` を原本とし、package / Cargo / Tauri の license を一致させる |
| 著作権表記 | **`Copyright (c) 2026 Banto Works`（暫定）**。ユーザー指定に基づいて採用し、公開前に権利関係・年を本人が最終確認する |
| 開発版番号 | **`0.0.1`**。既存 Tauri 設定に package / Cargo / Cargo.lock の本体を合わせる。初回 Store 提出版番号の確定・MSIX 4桁への反映工程は PR-07 |

`Cargo.toml` の既存著者 `K.T` は保持する。著者、著作権者、発行元表示名、Store の Publisher はそれぞれ別の情報であり、自動的に同じ値とは扱わない。

MIT 本文はリポジトリ直下に置く。Tauri は `bundle.licenseFile` で `../LICENSE` を指定し、同じファイルを `bundle.resources` で配布資源 `LICENSE` として含める。PR-07 の MSIX staging にもこの原本を収集し、PR-08 で最終配布物に本文と著作権表示があることを検証する。アプリ内でのライセンス表示は PR-06。依存ライブラリや書体の著作権・ライセンスは本体の MIT に置き換えず、書体は PR-03 で OFL 原文と対応する著作権表示を別途収集・同梱する。

## Store 識別情報：暫定・転記待ち

Partner Center のアカウント確認・アプリ名予約・Product identity 取得はユーザー作業であり、本作業では実施していない。以下は**未確定の文書用プレースホルダ**で、manifest やビルド設定に使用できる値ではない。

| 転記先の項目 | 暫定プレースホルダ | 正式値の取得元 |
| --- | --- | --- |
| MSIX `Identity Name` | `<PARTNER_CENTER_PACKAGE_IDENTITY_NAME>` | 対象製品の Product identity にある Package/Identity/Name |
| MSIX `Identity Publisher` | `<PARTNER_CENTER_PACKAGE_IDENTITY_PUBLISHER>` | 同じ画面の Package/Identity/Publisher（`CN=...` を含む文字列全体） |
| Store の発行元表示名 | `<PARTNER_CENTER_PUBLISHER_DISPLAY_NAME>` | 同じ画面の Package/Properties/PublisherDisplayName。希望表示名 Banto Works との一致を本人が確認 |
| Store ID | `<PARTNER_CENTER_STORE_ID>` | 同じ製品に割り当てられた Store ID |
| Package Family Name（PFN） | `<PARTNER_CENTER_PACKAGE_FAMILY_NAME>` | 同じ製品の Package family name |

転記手順:

1. 本人が Partner Center の対象アカウント・発行元を確認し、estamp のアプリ名を予約する。希望名の利用可否・予約完了を記録する。
2. 予約した製品の Product identity から上表の各値をそのまま転記する。取得日、対象製品、確認者を添える。アカウントの秘密情報や証明書秘密鍵は記録しない。
3. この文書のプレースホルダを正式値へ置き換え、状態を「取得済み」に更新する。発行元表示名に差があれば、Banto Works の暫定表記と整合するよう本人が判断し文書・メタデータへ反映する。
4. PR-07 で正式 manifest の `Identity Name` / `Publisher` 等へ転記し、同じ製品の値であることを照合する。正式 MSIX の受け入れ前に未取得値をすべて解消する。

**`CN=Banto Works` などを推測で作らない。** Tauri identifier、発行元表示名、MSIX Identity、Store ID、PFN を流用・相互変換しない。Tauri の `bundle.publisher` は MSIX `Identity Publisher` の設定ではない。MSIX の生成・署名や Partner Center の操作は PR-00 の実装には含めない。

## 書体と起動ウィンドウの意図

- UI は **BIZ UDPゴシック（BIZ UDPGothic）**、印影は **しっぽり明朝 B1（Shippori Mincho B1）**。印影書体を UI の見出しやボタンに使わない。[デザイン仕様の書体ルール](../design/estamp-design-rules.md#1-banto-works-共通ルール) に従う。
- PR-00 では選定結果の記録だけを行う。両書体のファイル取得、ウエイト確認、`@font-face`、既存 Google Fonts import の除去、OFL・著作権表示の同梱は PR-03。出力画像への反映確認は PR-05。
- **起動時に印影だけを表示する小さなウィンドウは意図した仕様**。設定は基本的に初回だけ行い、通常利用では印影を使う。設定欄を常時見せるための拡大は行わない。
- 既存設定の初期 `width: 250` / `height: 120`、`maxWidth: 250` / `maxHeight: 310`、`resizable: true` を維持する。PR-06 の画面仕上げでも、この利用意図を前提に確認する。

## 部門への引継ぎ

| 担当 | 渡す内容と期限 |
| --- | --- |
| 本人・セキュリティ／リリース | Banto Works の表示名と権利表記の最終確認、アカウント確認・名前予約・上表の転記。正式 identity は PR-07 の正式 MSIX 受け入れ前まで |
| 企画 | この初回範囲・無料方針を掲載文とプライバシー骨子へ反映。公開 URL・サポート連絡先・最終原稿は PR-09 まで |
| デザイン | 両書体の必要ウエイトとライセンス資料を PR-03 前、アイコン原本・小さな通常画面を前提にした画面仕様を PR-06 前まで |
| 品質 | Windows 11 x64 端末を確保し、PR-07 試作時に OS ビルド・WebView2 等を記録。PR-08 で最終品質確認 |
| 開発 | PR-02 に既存設定 schema、PR-03 に両書体の選定、PR-04 にデザインの日付仕様、PR-07 に MIT 原本・正式 identity を渡す |

本人にしかできない作業の一覧と今回の検証結果は [PR-00 実装結果](../../outputs/pr00-final1.md) に記録する。
