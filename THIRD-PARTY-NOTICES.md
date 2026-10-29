# Third-party notices — bundled fonts and theme

本体の MIT ライセンス（`LICENSE`）とは別に、以下の書体へ SIL Open Font License 1.1（SPDX: `OFL-1.1`）が適用されます。
原配布 TTF と OFL.txt を変更せず同梱しています。サブセット化・形式変換は行っていません。

## BIZ UDPGothic

Copyright 2022 The BIZ UDGothic Project Authors (https://github.com/googlefonts/morisawa-biz-ud-mincho)

License: **OFL-1.1**（全文: [`OFL.txt`](public/fonts/bizudpgothic/OFL.txt)）

UI 本文は Regular (400)、表見出し・ライセンス見出しは Bold (700)。

取得元: [google/fonts `ofl/bizudpgothic`](https://github.com/google/fonts/tree/6157dfaa640ca5738b4d1a7070fe389c3036d7fc/ofl/bizudpgothic)

固定コミット: `6157dfaa640ca5738b4d1a7070fe389c3036d7fc`。以下はこのディレクトリにある同名ファイルの原本です。

| 同梱ファイル | SHA-256 |
| --- | --- |
| `public/fonts/bizudpgothic/BIZUDPGothic-Bold.ttf` | `30eba52fc837e8b62c97d4b82e6706583149fb7294e3712dd71a655eaea80a90` |
| `public/fonts/bizudpgothic/BIZUDPGothic-Regular.ttf` | `258d7156c165f2ff774b6efee637c22c3b950de0d8a10e501137061bc8085d01` |
| `public/fonts/bizudpgothic/OFL.txt` | `e753d7155d53c747d037a445e584c8ecfca6dd79846db610417e282a736b28bc` |

## Shippori Mincho B1

Copyright 2021 The Shippori Mincho Project Authors (https://github.com/fontdasu/ShipporiMincho)

License: **OFL-1.1**（全文: [`OFL.txt`](public/fonts/shipporiminchob1/OFL.txt)）

印影の日付は Regular (400)、上段・下段は Bold (700)。Medium / SemiBold / ExtraBold は使わないため同梱しません。

取得元: [google/fonts `ofl/shipporiminchob1`](https://github.com/google/fonts/tree/6157dfaa640ca5738b4d1a7070fe389c3036d7fc/ofl/shipporiminchob1)

固定コミット: `6157dfaa640ca5738b4d1a7070fe389c3036d7fc`。以下はこのディレクトリにある同名ファイルの原本です。

| 同梱ファイル | SHA-256 |
| --- | --- |
| `public/fonts/shipporiminchob1/OFL.txt` | `41fba056279be5f45ff9a99e44b7b53897b42732f5806d8e666e0ab49ac6bd38` |
| `public/fonts/shipporiminchob1/ShipporiMinchoB1-Bold.ttf` | `d20f3981afb8bceda5fdf8f0fb29ba51eb21518644612ccd8a183e5bd433e25a` |
| `public/fonts/shipporiminchob1/ShipporiMinchoB1-Regular.ttf` | `89403e4b2a9ca0db9f832b893cfbfd90506c7c674cd640ba8a0ee128c34de7a4` |

BIZ UDPGothic の著作権行は OFL.txt 原文の `morisawa-biz-ud-mincho` をそのまま記載しています（METADATA.pb の `morisawa-biz-ud-gothic` とは異なります）。原文を修正せず、取得元コミット・パス・ハッシュで対応を示します。

## 配布と PR-07 の収集対象

アプリ内の設定下部「ライセンス」から本一覧、両書体の OFL 全文、本体 MIT 全文をオフライン表示できます。Vite の `dist/fonts/` には4本の TTF と各 OFL.txt が原名で出力され、画面の表示文にもライセンス全文が含まれます。

Tauri resources に本一覧を `THIRD-PARTY-NOTICES.md`、本体 MIT を `LICENSE`、両 OFL を `licenses/fonts/<family>/OFL.txt` として指定しています。PR-07 は正式 MSIX staging に実行ファイル・フロント資源（4本の TTF を含む）と、この3種類の文書（MIT・一覧・両 OFL）を収集してください。パッケージ内の原文・ハッシュ、オフラインのアプリ内表示、更新後の同梱を確認します。書体を本体 MIT へ再ライセンスしません。

## Skeleton theme CSS

Copyright (c) 2022 Skeleton Labs, LLC

License: **MIT**（本体MITとは権利者が異なる。全文: [`licenses/skeleton-LICENSE.txt`](licenses/skeleton-LICENSE.txt)）

`src/theme.css` は lock 済みの npm package `@skeletonlabs/skeleton` v1.0.0 の `themes/theme-skeleton.css` を元に、外部フォントimportを除去し、base / headingの書体変数を同梱BIZ UDPGothicに変更したものです。配色等は維持しています。ソース: https://github.com/skeletonlabs/skeleton 。PR-07では `licenses/skeleton-LICENSE.txt` も同じ相対パスでMSIXへ収集してください。全文はアプリ内「ライセンス」にも含めます。
