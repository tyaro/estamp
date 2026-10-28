# PR-01 第4回: ローカル依存調査（2026-10-29）

根拠はこの Mac の `~/.cargo/registry/src` の公式 crate manifest / ソース / 同梱 Cargo.lock と `~/.cargo/registry/index/*/.cache`。ネットワーク参照なし。別リポジトリ・worktree は参照していない。以下の HEAD 列は調査開始時の `4841977` を指す。

## 本体の要求範囲（sparse index の req をそのまま記録）

### tauri 2.8.5

- yanked: `false`
- `normal` / `muda ^0.17` / `cfg(any(target_os = "linux", target_os = "dragonfly", target_os = "freebsd", target_os = "openbsd", target_os = "netbsd", target_os = "windows", target_os = "macos"))`
- `build` / `tauri-build ^2.4.1`
- `normal` / `tauri-macros ^2.4.0`
- `normal` / `tauri-runtime ^2.8.0`
- `normal` / `tauri-runtime-wry ^2.8.1`
- `normal` / `tauri-utils ^2.7.0`
- `build` / `tauri-utils ^2.7.0`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.8.5/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri`

### tauri 2.12.2

- yanked: `false`
- `normal` / `muda ^0.20` / `cfg(any(target_os = "linux", target_os = "dragonfly", target_os = "freebsd", target_os = "openbsd", target_os = "netbsd", target_os = "windows", target_os = "macos"))`
- `build` / `tauri-build ^2.7.1`
- `normal` / `tauri-macros ~2.7.1`
- `normal` / `tauri-runtime ~2.12.1`
- `normal` / `tauri-runtime-wry ~2.12.1`
- `normal` / `tauri-utils ~2.10.1`
- `build` / `tauri-utils ~2.10.1`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.12.2/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri`

### tauri-runtime-wry 2.8.1

- yanked: `false`
- `normal` / `tao ^0.34.1`
- `normal` / `tauri-runtime ^2.8.0`
- `normal` / `tauri-utils ^2.7.0`
- `normal` / `wry ^0.53.2`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-runtime-wry-2.8.1/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-runtime-wry`

### tauri-runtime-wry 2.12.1

- yanked: `false`
- `normal` / `tao ^0.37.0`
- `normal` / `tauri-runtime ~2.12.1`
- `normal` / `tauri-utils ~2.10.1`
- `normal` / `wry ^0.57.0`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-runtime-wry-2.12.1/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-runtime-wry`

### tauri-runtime 2.12.2

- yanked: `false`
- `normal` / `tauri-utils ~2.10.2`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-runtime-2.12.2/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-runtime`

### tauri-macros 2.7.4

- yanked: `false`
- `normal` / `tauri-codegen ~2.7.4`
- `normal` / `tauri-utils ~2.10.2`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-macros-2.7.4/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-macros`

### tauri-codegen 2.7.4

- yanked: `false`
- `normal` / `tauri-utils ~2.10.2`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-codegen-2.7.4/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-codegen`

### tauri-build 2.7.1

- yanked: `false`
- `normal` / `tauri-codegen ~2.7.1`
- `normal` / `tauri-utils ~2.10.1`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-build-2.7.1/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-build`

### tauri-plugin 2.7.2

- yanked: `false`
- `normal` / `tauri-utils ~2.10.2`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-plugin-2.7.2/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-plugin`

### tauri-plugin-clipboard-manager 2.3.0

- yanked: `false`
- `normal` / `tauri ^2.6`
- `normal` / `tauri ^2.6` / `cfg(target_os = "ios")`
- `build` / `tauri-plugin ^2.3`
- manifest: `/Users/tyaromax/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-plugin-clipboard-manager-2.3.0/Cargo.toml`
- index: `/Users/tyaromax/.cargo/registry/index/index.crates.io-1949cf8c6b5b557f/.cache/ta/ur/tauri-plugin-clipboard-manager`

## 比較と選定

| crate | HEAD | 受領 lock | 2.8.5 同梱 lock | 2.12.2 同梱 lock | 今回の解決 |
| --- | --- | --- | --- | --- | --- |
| tauri | 2.8.5 | 2.8.5 | 2.8.5 | 2.12.2 | 2.12.2 |
| tauri-build | 2.4.1 | 2.4.1 | 2.4.1 | 2.7.1 | 2.7.1 |
| tauri-macros | 2.7.4 | 2.7.4 | 2.4.0 | 2.7.1 | 2.7.4 |
| tauri-codegen | 2.7.4 | 2.7.4 | 2.4.0 | 2.7.1 | 2.7.4 |
| tauri-runtime | 2.12.2 | 2.8.0 | 2.8.0 | 2.12.1 | 2.12.2 |
| tauri-runtime-wry | 2.9.3 | 2.8.1 | 2.8.1 | 2.12.1 | 2.12.1 |
| tauri-utils | 2.10.2 | 2.10.2 | 2.7.0 | 2.10.1 | 2.10.2 |
| tauri-plugin | 2.7.2 | 2.7.2 | — | — | 2.7.2 |
| tauri-plugin-clipboard-manager | 2.3.0 | 2.3.0 | — | — | 2.3.0 |
| wry | 0.53.5 | 0.53.5 | 0.53.3 | 0.57.0 | 0.57.0 |
| tao | 0.34.8 | 0.34.8 | 0.34.3 | 0.37.0 | 0.37.1 |
| muda | 0.17.2 | 0.17.2 | 0.17.1 | 0.20.0 | 0.20.0 |

2.8.5 維持案: runtime 2.8.0 / runtime-wry 2.8.1 自体は本体の manifest と同梱 lock に合う。9件の E0599 の原因は別の tauri-macros 2.7.4（src/menu.rs:133）が生成する `crate::Error::UnexpectedMenuKind` であり、tauri 2.8.5 の src/error.rs に存在しない。同梱の macros / codegen 2.4.0 / utils 2.7.0 は未キャッシュ。tauri-plugin 2.7.2 も utils ~2.10.2 を要求するため、一貫して戻すには plugin 2.4.0 等も考慮が必要。同梱 lock の runtime の2版だけを戻した前回案では不足していた。

採用案: tauri =2.12.2 / tauri-build =2.7.1 に変更。新本体は UnexpectedMenuKind を持ち、runtime / runtime-wry ~2.12.1、macros ~2.7.1、utils ~2.10.1 を要求する。既存 lock の newer patch（runtime 2.12.2、macros / codegen 2.7.4、utils 2.10.2）はこの範囲を満たすため維持する。runtime-wry 2.12.1 と runtime 2.12.2 の src/lib.rs は同一（diff 確認）。wry 0.57.0 / tao 0.37.1 / muda 0.20.0 も manifest の要求範囲内。最終的な互換性は cargo check / build で検証する。

clipboard-manager 2.3.0 は tauri ^2.6 を要求し、新本体も適合。JS API は 2.12.4 に更新し、`resolutions` と `yarn.lock` でプラグイン側の `^2.6.0` も同じ版へ統一する。第4回では CLI 2.8.4 / clipboard-manager 2.3.0 を維持した。第5回では CLI を 2.12.4、clipboard-win を 5.4.3 に更新した（最新結果は [第5回結果](pr01-final5.md)）。Yarn による取得は再開前にユーザーがサンドボックス外で実施済み。Tauri 2.12.2 の image/plugin.rs に RGBA/width/height -> ResourceId 経路が残り、JS Image.new と clipboard-manager の JsImage 受渡しが対応している。第4回の CLI build と画像 IPC の結果は pr01-final4.md を参照。

## 今回の lock 全差分（受領 lock 比、全プラットフォーム）

| crate | 受領 | 今回 |
| --- | --- | --- |
| cargo_toml | 0.22.3 | 1.0.1 |
| convert_case | 0.4.0 | — |
| cssparser | 0.29.6, 0.37.0 | 0.37.0 |
| cssparser-macros | 0.6.1, 0.7.1 | 0.7.1 |
| dbus | — | 0.9.12 |
| derive_more | 0.99.20, 2.1.1 | 2.1.1 |
| dirs | 6.0.0 | 7.0.0 |
| futf | 0.1.5 | — |
| fxhash | 0.2.1 | — |
| getrandom | 0.1.16, 0.2.17, 0.3.4, 0.4.3 | 0.3.4, 0.4.3 |
| html5ever | 0.29.1, 0.39.0 | 0.39.0 |
| json-patch | 3.0.1, 4.2.0 | 4.2.0 |
| jsonptr | 0.6.3, 0.7.1 | 0.7.1 |
| keyboard-types | 0.7.0 | 0.8.3 |
| kuchikiki | 0.8.8-speedreader | — |
| libdbus-sys | — | 0.2.7 |
| mac | 0.1.1 | — |
| markup5ever | 0.14.1, 0.39.0 | 0.39.0 |
| match_token | 0.1.0 | — |
| matches | 0.1.10 | — |
| muda | 0.17.2 | 0.20.0 |
| nodrop | 0.1.14 | — |
| objc2-core-location | — | 0.3.2 |
| objc2-core-video | 0.3.2 | — |
| objc2-javascript-core | 0.3.2 | — |
| objc2-security | 0.3.2 | — |
| objc2-user-notifications | — | 0.3.2 |
| phf | 0.8.0, 0.10.1, 0.11.3, 0.13.1 | 0.13.1 |
| phf_codegen | 0.8.0, 0.11.3, 0.13.1 | 0.13.1 |
| phf_generator | 0.8.0, 0.10.0, 0.11.3, 0.13.1 | 0.13.1 |
| phf_macros | 0.10.0, 0.13.1 | 0.13.1 |
| phf_shared | 0.8.0, 0.10.0, 0.11.3, 0.13.1 | 0.13.1 |
| png | 0.17.16, 0.18.1 | 0.18.1 |
| ppv-lite86 | 0.2.21 | — |
| proc-macro-hack | 0.5.20+deprecated | — |
| rand | 0.7.3, 0.8.8 | — |
| rand_chacha | 0.2.2, 0.3.1 | — |
| rand_core | 0.5.1, 0.6.4 | — |
| rand_hc | 0.2.0 | — |
| rand_pcg | 0.2.1 | — |
| reqwest | 0.12.28 | 0.13.5 |
| ryu | 1.0.23 | — |
| selectors | 0.24.0, 0.38.0 | 0.38.0 |
| serde_urlencoded | 0.7.1 | — |
| servo_arc | 0.2.0, 0.4.3 | 0.4.3 |
| siphasher | 0.3.11, 1.0.4 | 1.0.4 |
| string_cache | 0.8.9, 0.9.0 | 0.9.0 |
| string_cache_codegen | 0.5.4, 0.6.1 | 0.6.1 |
| tao | 0.34.8 | 0.37.1 |
| tauri | 2.8.5 | 2.12.2 |
| tauri-build | 2.4.1 | 2.7.1 |
| tauri-runtime | 2.8.0 | 2.12.2 |
| tauri-runtime-wry | 2.8.1 | 2.12.1 |
| tendril | 0.4.3, 0.5.1 | 0.5.1 |
| toml | 0.8.2, 0.9.12+spec-1.1.0, 1.1.8+spec-1.1.0 | 0.8.2, 1.1.8+spec-1.1.0 |
| toml_datetime | 0.6.3, 0.7.5+spec-1.1.0, 1.1.2+spec-1.1.0 | 0.6.3, 1.1.2+spec-1.1.0 |
| tray-icon | 0.21.3 | 0.25.1 |
| unic-char-property | 0.9.0 | — |
| unic-char-range | 0.9.0 | — |
| unic-common | 0.9.0 | — |
| unic-ucd-ident | 0.9.0 | — |
| unic-ucd-version | 0.9.0 | — |
| urlpattern | 0.3.0, 0.6.0 | 0.6.0 |
| utf-8 | 0.7.6 | — |
| wasi | 0.9.0+wasi-snapshot-preview1, 0.11.1+wasi-snapshot-preview1 | 0.11.1+wasi-snapshot-preview1 |
| wasm-streams | 0.4.2 | 0.5.0 |
| webkit2gtk | 2.0.1 | 2.0.2 |
| webkit2gtk-sys | 2.0.1 | 2.0.2 |
| webview2-com | 0.38.2 | 0.39.1 |
| webview2-com-sys | 0.38.2 | 0.39.1 |
| window-vibrancy | 0.6.0 | 0.8.1 |
| windows | 0.61.3 | 0.62.2 |
| windows-collections | 0.2.0 | 0.3.2 |
| windows-core | 0.61.2 | 0.61.2, 0.62.2 |
| windows-future | 0.2.1 | 0.3.2 |
| windows-numerics | 0.2.0 | 0.3.1 |
| windows-result | 0.3.4 | 0.3.4, 0.4.1 |
| windows-strings | 0.4.2 | 0.4.2, 0.5.1 |
| windows-sys | 0.45.0, 0.59.0, 0.60.2, 0.61.2 | 0.45.0, 0.61.2 |
| windows-targets | 0.42.2, 0.52.6, 0.53.5 | 0.42.2 |
| windows-threading | 0.1.0 | 0.2.1 |
| windows_aarch64_gnullvm | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| windows_aarch64_msvc | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| windows_i686_gnu | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| windows_i686_gnullvm | 0.52.6, 0.53.1 | — |
| windows_i686_msvc | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| windows_x86_64_gnu | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| windows_x86_64_gnullvm | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| windows_x86_64_msvc | 0.42.2, 0.52.6, 0.53.1 | 0.42.2 |
| winnow | 0.5.40, 0.7.15, 1.0.4 | 0.5.40, 1.0.4 |
| wry | 0.53.5 | 0.57.0 |

## キャッシュ有無

| crate | archive | source |
| --- | --- | --- |
| tauri 2.12.2 | True | True |
| tauri-build 2.7.1 | True | True |
| tauri-macros 2.7.4 | True | True |
| tauri-codegen 2.7.4 | True | True |
| tauri-runtime 2.12.2 | True | True |
| tauri-runtime-wry 2.12.1 | True | True |
| tauri-utils 2.10.2 | True | True |
| tauri-plugin 2.7.2 | True | True |
| tauri-plugin-clipboard-manager 2.3.0 | True | True |
| wry 0.57.0 | True | True |
| tao 0.37.1 | True | True |
| muda 0.20.0 | True | True |
| tauri-macros 2.4.0 | False | False |
| tauri-codegen 2.4.0 | False | False |
| tauri-utils 2.7.0 | False | False |
| tauri-plugin 2.4.0 | False | False |

今回 lock の全 registry package について、archive / 展開済み source のいずれかが存在することも確認済み。これは Windows 等のコンパイル成功を示すものではない。検証の終了状態は pr01-final4.md を参照。
