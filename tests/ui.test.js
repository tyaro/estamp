import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse, compile } from 'svelte/compiler';
import ts from 'typescript';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const app = read('src/App.svelte');
const native = read('src-tauri/src/main.rs');
const windowNative = read('src-tauri/src/settings_window.rs');
const build = read('src-tauri/build.rs');
const markup = app.replace(/<script lang="ts">[\s\S]*?<\/script>/, '<script></script>');
const ast = parse(markup);
const elements = [];
function walk(node) {
  if (node?.type === 'Element') elements.push(node);
  for (const child of node?.children ?? []) walk(child);
  if (node?.else) walk(node.else);
}
walk(ast.html);
const attr = (node, name) => node.attributes.find(a => a.name === name);
const literal = (node, name) => attr(node, name)?.value?.[0]?.data;
const byId = id => elements.find(node => literal(node, 'id') === id);
const directives = text => Object.fromEntries(text.split(';').map(s => s.trim().split(/\s+/)).filter(a => a[0]).map(([key, ...values]) => [key, values]));

test('production CSP is explicit, local-only, and needs neither inline styles nor image URL bypasses', () => {
  const csp = config.app.security.csp;
  assert.equal(typeof csp, 'string');
  assert.doesNotMatch(csp, /\*|unsafe-inline|unsafe-eval|data:|blob:|https:/);
  assert.deepEqual(directives(csp), {
    'default-src': ["'none'"], 'script-src': ["'self'"], 'style-src': ["'self'"],
    'font-src': ["'self'"], 'img-src': ["'self'"], 'connect-src': ['ipc:', 'http://ipc.localhost'],
    'object-src': ["'none'"], 'base-uri': ["'none'"], 'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"], 'form-action': ["'none'"],
  });
  // Production Svelte CSS is extracted by the Vite plugin. There are no inline
  // style attributes, transitions or toast components needing unsafe-inline.
  for (const source of [app, read('src/Licenses.svelte'), read('index.html')]) {
    assert.doesNotMatch(source, /\bstyle=|\bstyle:|\b(?:transition|in|out):|<Toaster\b/);
  }
  const javascript = app.replace(/<script lang="ts">([\s\S]*?)<\/script>/, (_, script) => `<script>${ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText}</script>`);
  const compiled = compile(javascript, { css: false });
  assert.doesNotMatch(compiled.js.code, /append_styles|add_css\(/);
});

test('dev CSP adds only Vite loopback and dev style injection', () => {
  const dev = directives(config.app.security.devCsp);
  const production = directives(config.app.security.csp);
  assert.deepEqual(dev['connect-src'], ['ipc:', 'http://ipc.localhost', 'http://localhost:1420', 'ws://localhost:1420']);
  assert.deepEqual(dev['style-src'], ["'self'", "'unsafe-inline'"]);
  for (const key of Object.keys(production).filter(key => !['connect-src', 'style-src'].includes(key))) {
    assert.deepEqual(dev[key], production[key]);
  }
});

test('only local main has the exact settings and image-write capabilities', () => {
  assert.deepEqual(config.app.security.capabilities, ['main-window']);
  assert.deepEqual(readdirSync(new URL('../src-tauri/capabilities/', import.meta.url)), ['main-window.json']);
  const caps = JSON.parse(read('src-tauri/capabilities/main-window.json'));
  assert.deepEqual(caps.windows, ['main']);
  assert.equal(caps.local, true);
  assert.equal(caps.remote, undefined);
  assert.equal(caps.webviews, undefined);
  assert.deepEqual(caps.permissions, [
    'allow-load', 'allow-save', 'allow-legacy-available', 'allow-import-legacy',
    'allow-show-settings-menu', 'allow-set-settings-expanded', 'core:event:allow-listen', 'core:event:allow-unlisten',
    'core:image:allow-new', 'clipboard-manager:allow-write-image', 'core:resources:allow-close',
  ]);
});

test('every custom command has an AppManifest entry and an injected main-window guard', () => {
  const commands = [...(native + windowNative).matchAll(/#\[tauri::command\]\s*(?:pub )?fn (\w+)\([\s\S]*?\) -> Result<[^\n]+\{\s*(?:super::)?require_main\(window.label\(\)\)\?;/g)].map(match => match[1]);
  assert.deepEqual(commands.sort(), ['import_legacy', 'legacy_available', 'load', 'pr05_measure', 'save', 'set_settings_expanded', 'show_settings_menu']);
  assert.equal(((native + windowNative).match(/#\[tauri::command\]/g) ?? []).length, commands.length);
  assert.match(build, /AppManifest::new\(\)\.commands\(/);
  for (const command of commands) assert.ok(build.includes(`"${command}"`));
  assert.match(native, /\.on_navigation\(\|_, url\| local_navigation\(url, cfg!\(dev\)\)\)/);
  const settings = read('src-tauri/src/settings.rs');
  assert.match(settings, /pub fn save\([^\n]+\{\s*config.validate_for_save\(\)\?;/);
  assert.match(settings, /current.as_deref\(\) != revision.map\(str::as_bytes\)/);
  assert.doesNotMatch(native, /path:\s*(?:String|PathBuf)/);
});

test('measurement command, clock, handler and extra capability are gated from normal native builds', () => {
  assert.match(read('vite.config.ts'), /'import.meta.env.VITE_PR05_MEASURE': JSON.stringify\(process.env.VITE_PR05_MEASURE === '1' \? '1' : '0'\)/);
  assert.match(build, /rerun-if-env-changed=ESTAMP_PR05_MEASURE/);
  assert.match(build, /if std::env::var\("ESTAMP_PR05_MEASURE"\).as_deref\(\) == Ok\("1"\)/);
  assert.match(native, /#\[cfg\(pr05_measure\)\]\s*struct Pr05Clock/);
  assert.match(native, /#\[cfg\(pr05_measure\)\]\s*#\[tauri::command\]\s*fn pr05_measure/);
  const normal = native.match(/#\[cfg\(not\(pr05_measure\)\)\]([\s\S]*?)#\[cfg\(pr05_measure\)\]/)[1];
  assert.doesNotMatch(normal, /pr05_measure|Pr05Clock|add_capability/);
  assert.match(native, /#\[cfg\(pr05_measure\)\]\s*let builder = builder[\s\S]*?add_capability/);
  const source = read('src/performance.js').replace(/^import .*;\r?\n/m, '')
    .replaceAll('import.meta.env.DEV', 'false').replaceAll("import.meta.env.VITE_PR05_MEASURE", 'undefined')
    .replace('export function', 'function');
  vm.runInNewContext(`${source}\nmarkPerformance('fonts-ready')`, {
    window: new Proxy({}, { get() { assert.fail('normal build must not access measurement globals'); } }),
  });
});

test('P3 date error wraps immediately below its labelled input in the real narrow settings layout', () => {
  const input = byId('date-input');
  assert.equal(attr(input, 'aria-invalid').value[0].expression.type, 'UnaryExpression');
  const descriptions = literal(input, 'aria-describedby').split(' ');
  assert.ok(descriptions.includes('date-error'));
  for (const id of descriptions) assert.ok(byId(id), id);
  assert.equal(elements[elements.indexOf(input) + 1], byId('date-error'));
  assert.equal(literal(byId('date-error'), 'role'), 'alert');
  assert.match(app, /dateState.error \? `× \$\{dateState.error\}` : ''/);
  const errorCss = app.match(/\.date-error\s*\{([^}]+)\}/)[1];
  for (const rule of ['width: 100%', 'min-width: 0', 'white-space: normal', 'overflow-wrap: anywhere']) assert.ok(errorCss.includes(rule));
  assert.doesNotMatch(errorCss, /nowrap|scroll|text-overflow|height:|max-height:|clip/);
  assert.doesNotMatch(app, /<table\b|min-width:\s*(?:\d+rem|2[4-9]\dpx)/);
  assert.match(app, /\.menu \{[^}]*display: grid;[^}]*min-width: 0;/);
  assert.match(app, /\.settings-panel, \.about \{ padding: 16px; min-width: 0;/);
});

test('inputs have visible Japanese labels, native tab order and visible focus', () => {
  const inputs = elements.filter(node => ['input', 'select'].includes(node.name));
  assert.deepEqual(inputs.map(node => literal(node, 'id')), [
    'top-text', 'top-size', 'date-input', 'date-size', 'date-format', 'bottom-text', 'bottom-size', 'output-size',
  ]);
  for (const input of inputs) assert.ok(elements.some(node => node.name === 'label' && literal(node, 'for') === literal(input, 'id')));
  const focusTargets = elements.filter(node => attr(node, 'tabindex'));
  assert.deepEqual(focusTargets.map(node => [literal(node, 'id'), literal(node, 'tabindex')]), [['copy-error', '-1'], ['settings-heading', '-1'], ['about-heading', '-1']]);
  assert.match(read('src/app.postcss'), /:focus-visible \{ outline: 2px solid var\(--focus\); outline-offset: 2px;/);
  assert.match(app, /on:compositionstart=\{\(\) => composing = true\} on:compositionend=\{finishComposition\}/);
});

test('About reads the product version and reuses local full-text PR-03 licenses', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.equal(version, config.version);
  assert.match(read('src-tauri/Cargo.toml'), new RegExp(`version = "${version.replaceAll('.', '\\.')}"`));
  assert.match(app, /import \{ version \} from '\.\.\/package.json'/);
  assert.match(app, /<h2 id="about-heading" tabindex="-1" bind:this=\{aboutHeading\}>estampについて<\/h2>\s*<p>バージョン \{version\}<\/p>/);
  assert.match(app, /<Licenses\s*\/>/);
  const licenses = read('src/Licenses.svelte');
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'bizudpgothic/OFL.txt', 'shipporiminchob1/OFL.txt']) assert.ok(licenses.includes(`${file}?raw`));
  assert.doesNotMatch(app + licenses + read('index.html'), /<(?:iframe|a)\b|https?:\/\//);
});

test('startup geometry is fixed and maximize is disabled', () => {
  const [window] = config.app.windows;
  assert.equal(config.app.windows.length, 1);
  assert.deepEqual([window.width, window.height, window.maxWidth, window.maxHeight, window.resizable], [250, 120, 250, undefined, false]);
  assert.deepEqual([window.minWidth, window.minHeight], [250, undefined]);
  assert.equal(window.maximizable, false);
  assert.match(read('src/stampImage.js'), /width="100" height="100"/);
  assert.match(app, /height: 100vh;\s*overflow-y: auto;\s*overflow-x: hidden;/);
});

test('feedback lives inside the visible stamp box, passes clicks through and has separate live regions', () => {
  const box = elements.find(node => literal(node, 'class') === 'stamp-box');
  const main = elements.find(node => literal(node, 'class') === 'main');
  assert.ok(main.children.includes(box));
  const children = box.children.filter(node => node.type === 'Element');
  assert.equal(children[0].name, 'button');
  assert.equal(literal(children[0], 'class'), 'stamp-copy');
  assert.ok(children[0].attributes.some(a => a.type === 'EventHandler' && a.name === 'click'));
  const badges = children.slice(1);
  assert.equal(badges.length, 3);
  assert.deepEqual(badges.map(node => literal(node, 'role')), ['status', 'alert', 'alert']);
  assert.deepEqual(badges.map(node => literal(node, 'aria-live')), ['polite', 'assertive', 'assertive']);
  assert.ok(badges.every(node => literal(node, 'aria-atomic') === 'true'));
  assert.ok(badges.every(node => node.name === 'p' && !attr(node, 'tabindex') && !attr(node, 'style')));
  assert.ok(badges.every(node => node.attributes.some(a => a.type === 'Class' && a.name === 'feedback-visible')));
  const content = node => markup.slice(node.start, node.end);
  assert.match(content(badges[0]), /copyFeedback\.startsWith\('×'\) \? '' : copyFeedback/);
  assert.match(content(badges[1]), /\{#if copyFeedback\.startsWith\('×'\)\}\{copyFeedback\}<br>詳細（Alt\+S）\{\/if\}/);
  assert.match(content(badges[2]), /\{startupIssue\}/);
  assert.match(app, /\.stamp-box \{ position: relative; width: 100px; height: 100px; \}/);
  const feedbackCss = app.match(/\.stamp-feedback\s*\{([^}]+)\}/)[1];
  for (const rule of ['position: absolute', 'left: 0', 'width: 100%', 'font-size: 14px', 'line-height: 20px', 'pointer-events: none']) {
    assert.ok(feedbackCss.includes(rule), rule);
  }
  const visibleCss = app.match(/\.feedback-visible\s*\{([^}]+)\}/)[1];
  for (const rule of ['padding: 4px', 'border: 1px solid currentColor', 'background: var(--background)']) assert.ok(visibleCss.includes(rule));
  assert.doesNotMatch(feedbackCss, /display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(app, /\.stamp-feedback:empty\s*\{[^}]*display:\s*none/);
  assert.match(app, /\.copy-feedback \{ bottom: 0; \}/);
  assert.match(app, /\.startup-issue \{ top: 0; white-space: pre-line; \}/);
  // Two-line warnings and copy failure each use 50px, within the seal y=5..105.
  assert.ok(5 + 100 <= config.app.windows[0].height);
  assert.ok(2 * (2 * 20 + 2 * 4 + 2) <= 100);
  assert.match(app, /\{#if copyMessage\}\s*<p id="copy-error" class="storage-message" tabindex="-1" bind:this=\{copyError\}[\s\S]*?\{copyMessage\}<\/p>/);
});

test('badge state colors meet 4.5:1 contrast against their opaque background', () => {
  const theme = read('src/theme.css');
  const color = name => theme.match(new RegExp(`--${name}: (#[0-9A-Fa-f]{6})`))[1];
  const luminance = hex => {
    const [r, g, b] = hex.slice(1).match(/../g).map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const state of ['success', 'warning', 'error']) {
    const values = [luminance(color(state)), luminance(color('background'))].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, state);
  }
});

test('design palette, type and controls use the PR-2 source values without Skeleton sample theme', () => {
  for (const value of ['#243B6B', '#2563EB', '#F7F6F2', '#1F1F1F', '#5F6470', '#8A8F98', '#18794E', '#8A5700', '#B42318']) assert.ok(read('src/theme.css').includes(value));
  assert.match(read('src/app.postcss'), /font-size: 14px/);
  assert.match(read('src/app.postcss'), /input, select \{ border-radius: 4px/);
  assert.match(read('src/app.postcss'), /button \{ border-radius: 8px/);
  assert.doesNotMatch(read('src/main.ts') + read('index.html'), /@skeletonlabs|data-theme|style=/);
});

test('settings entry uses native menu and accessible seal instead of a gear or Ctrl+,', () => {
  assert.doesNotMatch(app, /settings-entry|Ctrl\+,/);
  const seal = elements.find(node => literal(node, 'class') === 'stamp-copy');
  assert.equal(literal(seal, 'aria-label'), '印影をコピー。右クリックまたはAlt+Sで設定');
  assert.equal(literal(seal, 'title'), literal(seal, 'aria-label'));
  assert.match(app, /<div hidden=\{!settingsOpen\}>/);
  assert.match(windowNative, /Menu::new/);
  assert.match(windowNative, /MenuItem::with_id/);
  assert.match(windowNative, /\.popup_menu\(&menu\)/);
  assert.doesNotMatch(native + windowNative, /TrayIconBuilder|tray_icon/);
});

test('existing main-only expansion command restores both native window and Webview focus before returning to JS', () => {
  const command = windowNative.match(/pub fn set_settings_expanded\([\s\S]*?\r?\n\}\r?\n/)[0];
  assert.match(command, /require_main\(window.label\(\)\)\?;\s*(?:\/\/[^\r\n]*\r?\n\s*)*window\.set_focus\(\)\.map_err\(\|e\| e\.to_string\(\)\)\?;\s*window\.as_ref\(\)\.set_focus\(\)\.map_err\(\|e\| e\.to_string\(\)\)\?;/);
  assert.ok(command.indexOf('window.as_ref().set_focus()') < command.indexOf('let mut saved'));
  assert.match(read('src/theme.css'), /--focus:\s*#2563EB;/);
});

test('first-save guidance stays below the seal in the 120px startup window', () => {
  assert.match(app, /\{#if settingsUnsaved && !settingsOpen\}\s*<p class="unsaved-settings storage-warning" role="status">△ 設定が未保存です（Alt\+S）<\/p>/);
  assert.match(app, /\{#if settingsUnsaved\}\s*<p class="first-settings" role="status">はじめに氏名などを入力し保存してください<\/p>/);
  assert.match(app, /\.main.compact-caption \{ height: 100px; \}/);
  assert.match(app, /\.unsaved-settings, \.settings-hint \{[^}]*line-height: 15px;/);
  assert.ok(5 + 100 + 15 <= config.app.windows[0].height);
});

test('long-name warnings are directly beneath their described inputs and use the warning color', () => {
  for (const [inputId, warningId] of [['top-text', 'top-text-warning'], ['bottom-text', 'bottom-text-warning']]) {
    const input = byId(inputId), warning = byId(warningId);
    assert.equal(literal(input, 'aria-describedby'), warningId);
    assert.equal(elements[elements.indexOf(input) + 1], warning);
    assert.equal(literal(warning, 'role'), 'status');
    assert.match(markup.slice(warning.start, warning.end), /△ 8文字を超えるため縮小します。空白で2行に分けられます/);
  }
  assert.match(app, /\.text-warning \{ color: #8A5700; \}/);
});

test('two-line output warning is directly beneath its described input and reuses the name warning style', () => {
  const input = byId('output-size'), warning = byId('output-size-warning');
  const descriptions = literal(input, 'aria-describedby').split(' ');
  assert.deepEqual(descriptions, ['output-size-warning', 'output-help', 'image-error']);
  for (const id of descriptions) assert.ok(byId(id), id);
  assert.equal(elements[elements.indexOf(input) + 1], warning);
  assert.equal(literal(warning, 'class'), literal(byId('top-text-warning'), 'class'));
  assert.equal(literal(warning, 'role'), 'status');
  assert.match(markup.slice(warning.start, warning.end), /△ 2行の氏名は140px以上で読みやすくなります/);
  assert.match(app, /\.text-warning:empty \{ display: none; \}/);
});
