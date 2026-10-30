import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parse } from 'svelte/compiler';
import { get, writable } from 'svelte/store';
import { buildStampSvg, hasLongStampLine, validateImageSettings } from '../src/stampImage.js';
import * as dates from '../src/date.js';
import { saveSettings, settingsSnapshot } from '../src/save.js';
import { mountApp } from './helpers/appDom.js';

// Execute the production App handlers, including their post-await code. Only the
// DOM flush, renderer and Tauri boundary are fakes; this is not a WebView test.
const source = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const compiled = transpile(script);
// Re-run the production reactive statements when the fake DOM flushes.
const reactive = ts.createSourceFile('App.js', compiled, ts.ScriptTarget.ES2022, true)
  .statements.filter(statement => ts.isLabeledStatement(statement) && statement.label.text === '$')
  .map(statement => statement.getText()).join('\n');

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const initialSettings = () => ({
    schema_version: 1, stamp_type: 'dated_stamp',
    top_str: '所属', top_font_size: 80, mid_font_size: 60,
    btm_str: '名前', btm_font_size: 80, output_size: 100,
    date_mode: 'auto', date_format: 'gregorian', manual_date: null,
});

function app({
  pause = 'render', failAt = '', persist = async config => JSON.stringify(config),
  read = async () => ({ settings: initialSettings(), revision: null, warning: null }),
  importLegacy = read, legacyAvailable = async () => false,
} = {}) {
  const settings = writable(initialSettings());
  let now = new Date(2025, 11, 31, 23, 59, 59);
  const gate = deferred();
  const reached = deferred();
  const events = { renders: [], writes: [], closed: 0, sent: [], revisions: [], commands: [], listeners: new Map(), cleared: [] };
  const timeouts = new Map();
  let elapsed = 0;
  let nextTimer = 2;
  const advanceFeedback = ms => {
    elapsed += ms;
    for (const [id, timer] of timeouts) {
      if (timer.at <= elapsed) {
        timeouts.delete(id);
        timer.callback();
      }
    }
  };
  const image = { close: async () => { events.closed++; } };
  const boundary = async stage => {
    if (stage === failAt) throw new Error('検証エラー');
    if (stage === pause) {
      reached.resolve();
      await gate.promise;
    }
  };
  let context;
  let mount;
  const listeners = target => ({
    addEventListener: (name, callback) => events.listeners.set(`${target}:${name}`, callback),
    removeEventListener: (name, callback) => {
      assert.equal(events.listeners.get(`${target}:${name}`), callback);
      events.listeners.delete(`${target}:${name}`);
    },
  });
  const run = code => vm.runInContext(code, context);
  const svg = {
    outerHTML: '', width: { baseVal: { value: 100 } }, height: { baseVal: { value: 100 } },
  };
  const flush = async () => {
    run(reactive);
    const state = run('dateState');
    const config = get(settings);
    svg.outerHTML = `<svg>${JSON.stringify([
      dates.formatStampDate(state.date, config.date_format), config.top_str, config.btm_str,
      config.top_font_size, config.mid_font_size, config.btm_font_size,
    ])}</svg>`;
  };
  const imports = {
    canvg: { Canvg: { fromString: (_ctx, text) => ({
      resize() {}, render: async () => { events.renders.push(text); image.svg = text; await boundary('render'); },
    }) } },
    './store': { settings },
    svelte: { onMount(callback) { mount = callback; }, tick: flush },
    '@tauri-apps/api/core': { invoke: async (command, args = {}) => {
      events.commands.push({ command, args });
      if (command === 'load') return await read();
      if (command === 'import_legacy') return await importLegacy(args.revision);
      if (command === 'legacy_available') return await legacyAvailable();
      assert.equal(command, 'save');
      events.sent.push(args.config);
      events.revisions.push(args.revision);
      return await persist(args.config, args.revision);
    } },
    '@tauri-apps/api/image': { Image: { new: async (rgba, width, height) => { assert.ok(rgba instanceof Uint8Array); assert.equal(rgba.length, width * height * 4); await boundary('image'); return image; } } },
    '@tauri-apps/plugin-clipboard-manager': { writeImage: async value => { assert.equal(value, image); await boundary('write'); events.writes.push(value.svg); } },
    '../package.json': { version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version },
    './date.js': {
      ...dates, restoreDate: config => dates.restoreDate(config, now), todayState: () => dates.todayState(now), refreshDate: state => dates.refreshDate(state, now),
    },
    './save.js': { saveSettings, settingsSnapshot },
    './fonts.js': { loadStampFonts: async () => { await boundary('fonts'); }, loadUiFonts: async () => {} },
    './performance.js': { markPerformance() {} },
    './stampImage.js': { buildStampSvg, hasLongStampLine, validateImageSettings, renderStampImage: async (text, size) => {
      await boundary('fonts');
      events.renders.push(text); image.svg = text; await boundary('render');
      return { rgba: new Uint8Array(size * size * 4), width: size, height: size };
    } },
  };
  context = vm.createContext({
    // Svelte declares these reactive assignment targets when it compiles the DOM.
    str_date: '', stampSvg: '', imageError: '', startupIssue: '', requestAnimationFrame: callback => callback(),
    exports: {}, require: name => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    console: { error() {} },
    window: {
      ...listeners('window'), setInterval: callback => { events.timer = callback; return 1; },
      clearInterval: id => events.cleared.push(id),
      setTimeout: (callback, delay) => {
        const id = nextTimer++;
        timeouts.set(id, { callback, at: elapsed + delay });
        return id;
      },
      clearTimeout: id => timeouts.delete(id),
    },
    document: {
      ...listeners('document'),
      querySelector: () => svg,
      createElement: () => ({ getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      }) }),
    },
  });
  // Svelte's $settings assignment writes to the real store, so reintroducing
  // `$settings = config` in App after a save makes the regression test fail.
  Object.defineProperty(context, '$settings', { get: () => get(settings), set: value => settings.set(value) });
  // Observe assignments, including assigning the same object (which Svelte
  // still invalidates). Identity assertions alone cannot catch that regression.
  let dateState;
  events.dateAssignments = 0;
  Object.defineProperty(context, 'dateState', {
    get: () => dateState,
    set: value => { dateState = value; events.dateAssignments++; },
  });
  run(compiled.replace('let dateState =', 'dateState ='));
  run('busy = false; ready = true; fontsReady = true');
  return {
    settings, events, gate, reached, run, flush, advanceFeedback, timeouts, mount: () => mount(),
    recover: () => { failAt = ''; },
    load: () => run('load()'), importLegacy: () => run('importLegacy()'),
    copy: () => run('clipboardCopy()'), save: () => run('save()'),
    edit: input => run(`inputDate({ currentTarget: { value: ${JSON.stringify(input)} } })`),
    advance: value => { now = value; },
  };
}

function settingsFocus(ui) {
  ui.run(`
    const focusCalls = [];
    settingsHeading = { focus: () => focusCalls.push('heading'), scrollIntoView: () => focusCalls.push('scroll') };
    settingsButton = { focus: () => focusCalls.push('button') };
    viewport = { scrollTop: 400 };
  `);
}

test('first launch opens and focuses settings; closing without save repeats on restart', async () => {
  for (let launch = 0; launch < 2; launch++) {
    const ui = app();
    settingsFocus(ui);
    await ui.load();
    assert.equal(ui.run('settingsOpen'), true);
    assert.equal(ui.run('settingsUnsaved'), true);
    assert.equal(ui.run("focusCalls.join(',')"), 'heading,scroll');
    ui.run('closeSettings()');
    assert.equal(ui.run('settingsOpen'), false);
    assert.equal(ui.run('settingsUnsaved'), true);
    assert.equal(ui.run('viewport.scrollTop'), 0);
    assert.equal(ui.run('focusCalls.at(-1)'), 'button');
    assert.equal(ui.events.sent.length, 0);
  }
});

test('successful save/import ends first-launch guidance; saved and legacy revisions stay closed', async () => {
  const ui = app({ pause: '' });
  await ui.load();
  await ui.save();
  assert.equal(ui.run('settingsUnsaved'), false);
  for (const revision of ['saved JSON', 'legacy JSON without schema']) {
    const restarted = app({ read: async () => ({ settings: initialSettings(), revision, warning: null }) });
    await restarted.load();
    assert.equal(restarted.run('settingsOpen'), false);
    assert.equal(restarted.run('settingsUnsaved'), false);
  }
  const imported = app({ legacyAvailable: async () => true,
    importLegacy: async () => ({ settings: initialSettings(), revision: 'imported JSON', warning: null }) });
  await imported.load();
  imported.run('confirmingImport = true');
  await imported.importLegacy();
  assert.equal(imported.run('settingsUnsaved'), false);
});

test('quarantine prompts first save while hard load failure opens recovery without declaring absence', async () => {
  const corrupt = app({ read: async () => ({ settings: initialSettings(), revision: null, warning: '△ 破損を退避しました' }) });
  await corrupt.load();
  assert.equal(corrupt.run('settingsOpen && settingsUnsaved'), true);
  assert.match(corrupt.run('storageMessage'), /退避/);
  const broken = app({ read: async () => { throw new Error('permission denied'); } });
  await broken.load();
  assert.equal(broken.run('settingsOpen'), true);
  assert.equal(broken.run('settingsUnsaved'), false);
  assert.equal(broken.run('ready'), false);
  const failedSave = app({ persist: async () => { throw new Error('disk full'); } });
  await failedSave.load();
  await failedSave.save();
  assert.equal(failedSave.run('settingsUnsaved'), true);
});

test('Ctrl+, opens settings and Escape/close return focus; IME and unrelated keys are ignored', async () => {
  const ui = app({ read: async () => ({ settings: initialSettings(), revision: 'saved', warning: null }) });
  settingsFocus(ui);
  const cleanup = ui.mount();
  await new Promise(setImmediate);
  const keydown = ui.events.listeners.get('window:keydown');
  let prevented = 0;
  const key = properties => keydown({ key: ',', ctrlKey: true, preventDefault: () => prevented++, ...properties });
  for (const properties of [{ ctrlKey: false }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { isComposing: true }]) key(properties);
  assert.equal(ui.run('settingsOpen'), false);
  key({});
  await new Promise(setImmediate);
  assert.equal(ui.run('settingsOpen'), true);
  assert.equal(prevented, 1);
  assert.equal(ui.run('focusCalls.at(-2)'), 'heading');
  key({ key: 'Escape', ctrlKey: false });
  assert.equal(ui.run('settingsOpen'), false);
  assert.equal(ui.run('focusCalls.at(-1)'), 'button');
  key({}); await new Promise(setImmediate);
  ui.run('closeSettings()');
  assert.equal(ui.run('focusCalls.at(-1)'), 'button');
  cleanup();
  assert.equal(ui.events.listeners.has('window:keydown'), false);
});

test('long text warnings leave save and copy enabled', async () => {
  const ui = app({ pause: '' });
  ui.settings.update(value => ({ ...value, top_str: '国際事業推進部門室', btm_str: '国際事業推進部 髙橋渡邊' }));
  await ui.flush();
  assert.equal(ui.run('imageError'), '');
  await ui.save(); await ui.copy();
  assert.equal(ui.events.sent.length, 1);
  assert.equal(ui.events.writes.length, 1);
});

for (const pause of ['render', 'image']) {
  for (const change of ['valid date', 'format', 'invalid date', 'midnight', 'output size']) {
    test(`App cancels stale copy after ${change} during ${pause}`, async () => {
      const ui = app({ pause });
      const copying = ui.copy();
      await ui.reached.promise;
      if (change === 'valid date') ui.edit('R7.10.22');
      if (change === 'format') ui.settings.update(value => ({ ...value, date_format: 'wareki' }));
      if (change === 'invalid date') ui.edit('R7.2.29');
      // No timer/focus event: the final pre-write refresh must detect midnight.
      if (change === 'midnight') ui.advance(new Date(2026, 0, 1));
      if (change === 'output size') ui.settings.update(value => ({ ...value, output_size: 200 }));
      ui.gate.resolve();
      await copying;
      assert.deepEqual(ui.events.writes, []);
      assert.match(ui.run('copyMessage'), /変更.*中止/);
      assert.equal(ui.events.closed, 1);
      assert.equal(ui.run('copying'), false);
      assert.equal(ui.run('copyFeedback'), '△ コピー中止');
      ui.advanceFeedback(60_000);
      assert.equal(ui.run('copyFeedback'), '△ コピー中止');
      if (change === 'invalid date') ui.edit('R7.10.22');
      await ui.copy();
      assert.equal(ui.events.writes.length, 1);
      const state = ui.run('dateState');
      assert.ok(ui.events.writes[0].includes(dates.formatStampDate(state.date, get(ui.settings).date_format)));
      assert.equal(ui.events.closed, 2);
      assert.equal(ui.run('copyMessage'), '○ 画像をコピーしました');
    });
  }
}

test('App copies an unchanged stamp once and releases its image', async () => {
  const ui = app();
  const copying = ui.copy();
  await ui.reached.promise;
  await ui.copy(); // A second click cannot race with the first copy.
  ui.gate.resolve();
  await copying;
  assert.equal(ui.events.writes.length, 1);
  assert.ok(ui.events.writes[0].includes('2025.12.31'));
  assert.equal(ui.events.writes[0], ui.run('stampSvg'), 'copy uses the computed preview SVG');
  assert.equal(ui.events.closed, 1);
  assert.equal(ui.run('copyMessage'), '○ 画像をコピーしました');
  assert.equal(ui.run('copying'), false);
});

test('copy success badge expires at 1.8 seconds, keeps the paragraph and resets for a new copy', async () => {
  const ui = app({ pause: '' });
  await ui.copy();
  assert.equal(ui.run('copyFeedback'), '○ コピー成功');
  ui.advanceFeedback(1799);
  assert.equal(ui.run('copyFeedback'), '○ コピー成功');
  await ui.copy();
  ui.advanceFeedback(1); // The previous copy timer must have been cleared.
  assert.equal(ui.run('copyFeedback'), '○ コピー成功');
  ui.advanceFeedback(1799);
  assert.equal(ui.run('copyFeedback'), '');
  assert.equal(ui.run('copyMessage'), '○ 画像をコピーしました');
});

for (const failAt of ['fonts', 'render', 'image', 'write']) {
  test(`copy failure at ${failAt} persists until the next attempt, which can succeed`, async () => {
    const ui = app({ pause: '', failAt });
    await ui.copy();
    assert.equal(ui.run('copyFeedback'), '× コピー失敗');
    assert.match(ui.run('copyMessage'), /^× .*検証エラー/);
    assert.equal(ui.timeouts.size, 0);
    ui.advanceFeedback(60_000);
    assert.equal(ui.run('copyFeedback'), '× コピー失敗');
    ui.recover();
    const copying = ui.copy();
    assert.equal(ui.run('copyFeedback'), '');
    await copying;
    assert.equal(ui.run('copyFeedback'), '○ コピー成功');
    assert.equal(ui.events.writes.length, 1);
  });
}

test('unmount clears the success timer and pending copy cannot create feedback after disposal', async () => {
  const ui = app({ pause: '' });
  const unmount = ui.mount();
  await new Promise(setImmediate);
  await ui.copy();
  assert.equal(ui.timeouts.size, 1);
  unmount();
  assert.equal(ui.timeouts.size, 0);

  const pending = app({ pause: 'write' });
  const dispose = pending.mount();
  await new Promise(setImmediate);
  const copying = pending.copy();
  await pending.reached.promise;
  dispose();
  pending.gate.resolve();
  await copying;
  assert.equal(pending.run('copyFeedback'), '');
  assert.equal(pending.timeouts.size, 0);
});

test('load/save problems stay visible independently of successful copy and clear after recovery', async () => {
  for (const operation of ['load', 'save']) {
    let failing = true;
    const ui = app({
      pause: '',
      read: async () => {
        if (operation === 'load' && failing) throw new Error('read failed');
        return { settings: initialSettings(), revision: null, warning: null };
      },
      persist: async () => {
        if (failing) throw new Error('save failed');
        return 'saved';
      },
    });
    await ui[operation]();
    await ui.flush();
    assert.equal(ui.run('startupIssue'), '× 設定エラー');
    ui.advanceFeedback(60_000);
    await ui.flush();
    assert.equal(ui.run('startupIssue'), '× 設定エラー');
    if (operation === 'save') {
      await ui.copy();
      assert.equal(ui.run('startupIssue'), '× 設定エラー');
      assert.equal(ui.run('copyFeedback'), '○ コピー成功');
    }
    failing = false;
    await ui[operation]();
    await ui.flush();
    assert.equal(ui.run('startupIssue'), '');
  }
});

test('compiled App shows save failure and unsaved warning immediately after Save, then success on retry', async () => {
  let failing = true;
  const ui = await mountApp(initialSettings(), { persist: async () => {
    if (failing) throw new Error('書込み不可');
    return 'saved revision';
  } });
  try {
    ui.settings.update(value => ({ ...value, top_str: '営業部' }));
    await ui.tick();
    const save = ui.button('保存');
    const messages = () => save.parentNode.childNodes.slice(save.parentNode.childNodes.indexOf(save) + 1)
      .filter(node => node.nodeName === 'P');
    assert.ok(messages().some(node => node.textContent === '△ 未保存の変更があります'));
    save.dispatch('click');
    await new Promise(setImmediate);
    await ui.tick();
    assert.ok(messages().length >= 2, 'failure result and unsaved warning stay next to Save');
    assert.match(messages()[0].textContent, /^× 保存に失敗しました：.*書込み不可/);
    assert.equal(messages()[0].getAttribute('role'), 'alert');
    assert.equal(messages()[1].textContent, '△ 未保存の変更があります');
    assert.equal(messages()[1].getAttribute('role'), 'status');
    assert.equal(ui.input('top-text').value, '営業部');
    failing = false;
    save.dispatch('click');
    await new Promise(setImmediate);
    await ui.tick();
    assert.equal(messages()[0].textContent, '○ 保存しました');
    assert.equal(messages()[0].getAttribute('role'), 'status');
    assert.equal(messages().length, 1, 'successful save clears the unsaved warning');
  } finally { ui.destroy(); }
});

test('startup indicator also exposes load warnings and font failures', async () => {
  const ui = app({ read: async () => ({ settings: initialSettings(), revision: null, warning: '△ 設定を退避しました' }) });
  await ui.load();
  await ui.flush();
  assert.equal(ui.run('startupIssue'), '△ 設定に注意');
  const fonts = app({ failAt: 'fonts' });
  await fonts.run('prepareFonts()');
  await fonts.flush();
  assert.equal(fonts.run('startupIssue'), '× 書体エラー');
});

test('App preserves edits after the save handler completes and saves them next time', async () => {
  const pending = deferred();
  const ui = app({ persist: () => pending.promise });
  ui.edit('R7.10.22');
  const saving = ui.save();
  assert.equal(ui.events.sent[0].manual_date, '2025-10-22');
  ui.settings.update(value => Object.assign(value, {
    top_str: '編集中の所属', btm_str: '編集中の名前', top_font_size: 72,
    mid_font_size: 48, btm_font_size: 64, output_size: 200, date_format: 'wareki',
  }));
  ui.edit('R6.2.29');
  const edited = { ...get(ui.settings) };
  const editedDate = ui.run('dateState');
  pending.resolve('saved revision');
  await saving;
  assert.equal(ui.run('revision'), 'saved revision');
  assert.deepEqual(get(ui.settings), edited);
  assert.equal(ui.run('dateState'), editedDate);
  assert.equal(ui.run('dirty'), true);
  assert.match(ui.run('storageMessage'), /未保存の変更があります/);
  await ui.save();
  assert.deepEqual(ui.events.sent[1], { ...edited, date_mode: 'manual', manual_date: '2024-02-29' });
  assert.deepEqual(ui.events.revisions, [null, 'saved revision']);
  assert.equal(ui.run('dirty'), false);
  assert.equal(ui.run('storageMessage'), '○ 保存しました');
});

test('App clears the save-during-edit warning when edits revert to the saved values', async () => {
  const pending = deferred();
  const ui = app({ persist: () => pending.promise });
  ui.edit('R7.10.22');
  const saved = { ...get(ui.settings) };
  const saving = ui.save();
  ui.settings.update(value => ({ ...value, btm_str: '編集中' }));
  ui.edit('R6.2.29');
  pending.resolve('saved revision');
  await saving;
  await ui.flush();
  assert.equal(ui.run('dirty'), true);
  assert.equal(ui.run('storageMessage'), '△ 未保存の変更があります');

  ui.settings.set(saved);
  await ui.flush();
  assert.equal(ui.run('dirty'), true);
  assert.equal(ui.run('storageMessage'), '△ 未保存の変更があります');
  ui.edit('R7.10.22');
  await ui.flush();
  assert.equal(ui.run('dirty'), false);
  assert.equal(ui.run('storageMessage'), '');
  assert.equal(ui.events.sent.length, 1);
});

for (const message of [
  '× 保存に失敗しました：disk full',
  '× 保存に失敗しました：stale revision',
  '△ 設定ファイルが破損していたため退避しました',
  '△ 未保存の変更があります △ 旧設定の有無を確認できませんでした：read failed',
]) {
  test(`App keeps other storage messages when edits revert: ${message}`, async () => {
    const ui = app();
    await ui.load();
    const saved = { ...get(ui.settings) };
    ui.settings.update(value => ({ ...value, btm_str: '編集中' }));
    ui.run(`storageMessage = ${JSON.stringify(message)}`);
    await ui.flush();
    assert.equal(ui.run('dirty'), true);
    assert.equal(ui.run('storageMessage'), message);
    ui.settings.set(saved);
    await ui.flush();
    assert.equal(ui.run('dirty'), false);
    assert.equal(ui.run('storageMessage'), message);
  });
}

test('App save guards invalid input and preserves edits on failure', async () => {
  const pending = deferred();
  const ui = app({ persist: () => pending.promise });
  ui.edit('R7.2.29');
  await ui.save();
  assert.equal(ui.events.sent.length, 0);
  ui.edit('R7.10.22');
  const saving = ui.save();
  ui.settings.update(value => ({ ...value, btm_str: '編集中' }));
  ui.edit('R');
  pending.reject(new Error('save failed'));
  await saving;
  assert.equal(get(ui.settings).btm_str, '編集中');
  assert.ok(ui.run('dateState.error'));
  assert.match(ui.run('storageMessage'), /保存に失敗/);
  assert.equal(ui.run('revision'), null);
  assert.equal(ui.run('busy'), false);
});

test('App reports unsaved invalid date input typed during a successful save', async () => {
  const pending = deferred();
  const ui = app({ persist: () => pending.promise });
  const saving = ui.save();
  ui.edit('R');
  pending.resolve('saved revision');
  await saving;
  assert.equal(ui.run('revision'), 'saved revision');
  assert.equal(ui.run('dirty'), true);
  assert.match(ui.run('storageMessage'), /未保存/);
});

test('App waits for fonts before rendering the first copied image', async () => {
  const ui = app({ pause: 'fonts' });
  const copying = ui.copy();
  await ui.reached.promise;
  await new Promise(setImmediate);
  assert.deepEqual(ui.events.renders, []);
  assert.equal(ui.events.closed, 0);
  assert.deepEqual(ui.events.writes, []);
  ui.gate.resolve();
  await copying;
  assert.equal(ui.events.renders.length, 1);
  assert.equal(ui.events.writes.length, 1);
});

test('App blocks copy until the initial font load completes', async () => {
  const ui = app({ pause: 'fonts' });
  ui.run('fontsReady = false');
  await ui.flush();
  assert.equal(ui.run('stampSvg'), '', 'preview layout waits for bundled fonts');
  const preparing = ui.run('prepareFonts()');
  await ui.reached.promise;
  await ui.copy();
  assert.deepEqual(ui.events.writes, []);
  ui.gate.resolve();
  await preparing;
  assert.equal(ui.run('fontsReady'), true);
  assert.match(ui.run('stampSvg'), /<svg/);
  await ui.copy();
  assert.equal(ui.events.writes.length, 1);
});

for (const operation of ['load', 'importLegacy']) {
  for (const mode of ['manual', 'auto', 'invalid manual']) {
    test(`App ${operation} restores ${mode} dates, metadata and unknown values together`, async () => {
      const loaded = {
        settings: {
          ...initialSettings(), stamp_type: 'future_角印',
          date_mode: mode === 'auto' ? 'auto' : 'manual', date_format: 'wareki',
          manual_date: mode === 'invalid manual' ? 'H31.5.1' : '2019-05-01',
        },
        revision: '\ufefforiginal revision', warning: '△ 読込時の案内',
      };
      const ui = app({
        read: async () => loaded, importLegacy: async revision => {
          assert.equal(revision, 'previous revision');
          return loaded;
        },
        legacyAvailable: async () => true,
      });
      ui.edit('R7.10.22'); // A successful restore must replace the previous editor state.
      ui.run("revision = 'previous revision'; legacyAvailable = true; confirmingImport = true");
      await ui[operation]();
      assert.deepEqual(get(ui.settings), loaded.settings);
      assert.equal(ui.run('revision'), loaded.revision);
      assert.equal(ui.run('storageMessage'), loaded.warning);
      assert.equal(ui.run('ready'), true);
      assert.equal(ui.run('busy'), false);
      assert.equal(ui.run('legacyAvailable'), true);
      assert.equal(ui.run('confirmingImport'), false);
      const state = ui.run('dateState');
      assert.equal(ui.run('dateDraft'), state.input);
      assert.equal(state.mode, mode === 'auto' ? 'auto' : 'manual');
      if (mode === 'invalid manual') {
        assert.ok(state.error);
        assert.equal(state.input, 'H31.5.1');
        await ui.save();
        await ui.copy();
        assert.equal(ui.events.sent.length, 0);
        assert.equal(ui.events.writes.length, 0);
      } else {
        assert.equal(state.error, '');
        assert.equal(state.date, mode === 'auto' ? '2025-12-31' : '2019-05-01');
        ui.edit('Ｒ７．１０．２２');
        ui.settings.update(value => ({ ...value, top_str: '編集済み' }));
        await ui.save();
        assert.deepEqual(ui.events.sent[0], { ...loaded.settings, top_str: '編集済み', date_mode: 'manual', manual_date: '2025-10-22' });
        assert.equal(ui.events.revisions[0], loaded.revision);
        assert.equal(ui.run('revision'), JSON.stringify(ui.events.sent[0]));
      }
    });
  }
}

test('App blocks save and copy until load succeeds and allows retry after failure', async () => {
  const pending = deferred();
  let failing = true;
  const ui = app({ read: () => failing ? pending.promise : Promise.resolve({
    settings: initialSettings(), revision: null, warning: null,
  }) });
  ui.run('ready = false');
  const loading = ui.load();
  await ui.save();
  await ui.copy();
  assert.equal(ui.events.sent.length, 0);
  assert.equal(ui.events.writes.length, 0);
  pending.reject(new Error('unsupported schema'));
  await loading;
  assert.equal(ui.run('ready'), false);
  assert.equal(ui.run('busy'), false);
  assert.match(ui.run('storageMessage'), /unsupported schema/);
  failing = false;
  await ui.load();
  assert.equal(ui.run('ready'), true);
  assert.equal(ui.run('storageMessage'), '○ 設定を読み込みました');
});

test('App imports only with availability and confirmation; failure keeps edits and revision', async () => {
  const ui = app({
    importLegacy: async revision => {
      assert.equal(revision, 'current revision');
      throw new Error('stale revision');
    },
    legacyAvailable: async () => false,
  });
  ui.run("revision = 'current revision'");
  await ui.importLegacy();
  ui.run('legacyAvailable = true');
  await ui.importLegacy();
  assert.equal(ui.events.commands.length, 0);
  ui.edit('R元.5.1');
  const beforeDate = ui.run('dateState');
  const beforeSettings = get(ui.settings);
  ui.run('confirmingImport = true');
  await ui.importLegacy();
  assert.equal(ui.run('revision'), 'current revision');
  assert.equal(ui.run('dateState'), beforeDate);
  assert.equal(get(ui.settings), beforeSettings);
  assert.match(ui.run('storageMessage'), /stale revision/);
  assert.equal(ui.run('legacyAvailable'), false);
  assert.equal(ui.run('confirmingImport'), false);
});

test('App serializes save requests and keeps the revision after a rejected save', async () => {
  const pending = deferred();
  const ui = app({ persist: () => pending.promise });
  ui.run("revision = 'current revision'");
  const saving = ui.save();
  await ui.save();
  assert.equal(ui.events.sent.length, 1);
  assert.deepEqual(ui.events.revisions, ['current revision']);
  pending.reject(new Error('stale revision'));
  await saving;
  assert.equal(ui.run('revision'), 'current revision');
  assert.equal(ui.run('busy'), false);
  assert.match(ui.run('storageMessage'), /stale revision/);
});

test('App removes date watchers and ignores a load completing after unmount', async () => {
  const pending = deferred();
  const ui = app({ read: () => pending.promise });
  const before = get(ui.settings);
  ui.run('busy = true; ready = false');
  const cleanup = ui.mount();
  assert.equal(ui.events.listeners.size, 3);
  ui.advance(new Date(2026, 0, 1));
  ui.events.timer();
  assert.equal(ui.run('dateState.date'), '2026-01-01');
  ui.advance(new Date(2026, 0, 2));
  ui.events.listeners.get('window:focus')();
  assert.equal(ui.run('dateState.date'), '2026-01-02');
  ui.advance(new Date(2026, 0, 3));
  ui.events.listeners.get('document:visibilitychange')();
  assert.equal(ui.run('dateState.date'), '2026-01-03');
  cleanup();
  assert.equal(ui.events.listeners.size, 0);
  assert.deepEqual(ui.events.cleared, [1]);
  pending.resolve({ settings: { ...initialSettings(), top_str: 'late response' }, revision: 'late', warning: null });
  await new Promise(setImmediate);
  assert.equal(get(ui.settings), before);
  assert.equal(ui.run('ready'), false);
  assert.equal(ui.run('revision'), null);
  assert.deepEqual(ui.events.commands.map(call => call.command), ['load']);
});

for (const failAt of ['fonts', 'render', 'image', 'write']) {
  test(`App displays Japanese copy failure after ${failAt} and resets single-flight`, async () => {
    const ui = app({ pause: '', failAt });
    await ui.copy();
    assert.match(ui.run('copyMessage'), /× 画像コピーに失敗しました.*検証エラー/);
    assert.equal(ui.run('copying'), false);
    assert.equal(ui.events.closed, failAt === 'write' ? 1 : 0);
    assert.equal(ui.events.writes.length, 0);
  });
}

test('App persists Japanese load, save, copy success and font load failure in the UI', async () => {
  const ui = app({ pause: '' });
  await ui.load(); assert.match(ui.run('storageMessage'), /○ 設定を読み込みました/);
  await ui.save(); assert.match(ui.run('storageMessage'), /○ 保存しました/);
  await ui.copy(); assert.match(ui.run('copyMessage'), /○ 画像をコピーしました/);
  const failed = app({ failAt: 'fonts' });
  await failed.run('prepareFonts()');
  assert.match(failed.run('fontMessage'), /× 書体を読み込めません.*検証エラー/);
});

for (const change of ['top_str', 'btm_str', 'top_font_size', 'mid_font_size', 'btm_font_size']) {
  test(`App cancels edits to ${change} during render`, async () => {
    const ui = app(); const copying = ui.copy(); await ui.reached.promise;
    ui.settings.update(value => ({ ...value, [change]: change.endsWith('_str') ? '変更' : 72 }));
    ui.gate.resolve(); await copying;
    assert.equal(ui.events.writes.length, 0);
    assert.match(ui.run('copyMessage'), /変更.*中止/);
    assert.equal(ui.events.closed, 1);
  });
}

// Native buttons translate Enter/Space into click. Test the production click
// binding and the complete copy handler; the OS key dispatch is checked on Windows.
test('native Enter/Space activation is bound to the copy handler without duplicate key handlers', async () => {
  const ast = parse(source.replace(/<script lang="ts">[\s\S]*?<\/script>/, '<script></script>'));
  const elements = [];
  const walk = node => {
    if (node?.type === 'Element') elements.push(node);
    for (const child of node?.children ?? []) walk(child);
  };
  walk(ast.html);
  const button = elements.find(node => node.name === 'button' && node.attributes.some(a => a.name === 'aria-label' && a.value?.[0]?.data === '印影をコピー'));
  assert.ok(button);
  assert.equal(button.attributes.find(a => a.name === 'type').value[0].data, 'button');
  assert.ok(!button.attributes.some(a => ['role', 'tabindex', 'keydown', 'keyup'].includes(a.name)));
  const click = button.attributes.find(a => a.type === 'EventHandler' && a.name === 'click');
  assert.equal(click.expression.type, 'Identifier');
  for (const key of ['Enter', ' ']) {
    const ui = app({ pause: '' });
    await ui.run(`${click.expression.name}()`);
    assert.equal(ui.events.writes.length, 1, key);
    assert.equal(ui.run('copyMessage'), '○ 画像をコピーしました');
    assert.equal(ui.events.closed, 1);
  }
});

test('IME composition defers date validation and blocks save/copy until the committed value', async () => {
  const ui = app({ pause: '' });
  const before = ui.run('dateState');
  ui.run('composing = true');
  ui.edit('令和');
  assert.equal(ui.run('dateState'), before);
  assert.equal(ui.run('dateDraft'), '令和');
  await ui.copy(); await ui.save();
  assert.equal(ui.events.writes.length, 0);
  assert.equal(ui.events.sent.length, 0);
  ui.run("finishComposition({target: {id: 'date-input', value: '令和7年10月22日'}})");
  assert.equal(ui.run('dateState.date'), '2025-10-22');
  assert.equal(ui.run('dateDraft'), '令和7年10月22日');
  assert.equal(ui.run('dateState.error'), '');
  await ui.copy(); await ui.save();
  assert.equal(ui.events.writes.length, 1);
  assert.equal(ui.events.sent[0].manual_date, '2025-10-22');
  // IME input in either name field must not replace the date input.
  ui.run("composing = true; finishComposition({target: {id: 'top-text', value: '部署名'}})");
  assert.equal(ui.run('dateState.date'), '2025-10-22');
});

test('date refresh never assigns unchanged state or any state during composition', async () => {
  const ui = app({ pause: '' });
  const dispose = ui.mount();
  await new Promise(setImmediate);
  const refresh = () => {
    ui.events.timer();
    ui.events.listeners.get('window:focus')();
    ui.events.listeners.get('document:visibilitychange')();
  };
  let assignments = ui.events.dateAssignments;
  refresh();
  assert.equal(ui.events.dateAssignments, assignments, 'same-day refresh must not assign even the same object');
  ui.run('composing = true');
  ui.edit('令和');
  ui.advance(new Date(2026, 0, 1));
  refresh();
  ui.run('resetDate()');
  assert.equal(ui.events.dateAssignments, assignments, 'midnight refresh must wait for composition');
  assert.equal(ui.run('dateDraft'), '令和');
  ui.run("finishComposition({target: {id: 'date-input', value: '令和7年10月22日'}})");
  assignments = ui.events.dateAssignments;
  refresh();
  assert.equal(ui.events.dateAssignments, assignments, 'manual dates must not be reassigned');
  ui.edit('令和');
  assignments = ui.events.dateAssignments;
  refresh();
  assert.equal(ui.events.dateAssignments, assignments, 'invalid drafts must not be reassigned');
  ui.run('resetDate()');
  assert.equal(ui.run('dateDraft'), '2026-01-01');
  assert.equal(ui.run('dateState.mode'), 'auto');
  ui.advance(new Date(2026, 0, 2));
  refresh();
  assert.equal(ui.run('dateDraft'), '2026-01-02');
  assert.equal(ui.run('dateState.input'), '2026-01-02');
  dispose();
});

for (const committed of ['令和7年10月22日', '令和7年2月29日']) {
  test(`compiled App retains the date DOM draft across timer/focus/resume and validates ${committed}`, async () => {
    const ui = await mountApp(initialSettings());
    try {
      const input = ui.input('date-input');
      const confirmation = ui.input('date-confirmation').textContent;
      input.dispatch('compositionstart');
      input.nativeValue = '令和';
      input.dispatch('input', { isComposing: true });
      const writes = input.valueWrites;
      await ui.tick();
      assert.equal(input.valueWrites, writes);
      for (const midnight of [false, true]) {
        if (midnight) ui.advance(new Date(2026, 0, 1));
        ui.timer(); ui.focus(); ui.resume();
        // Also exercise an unrelated settings-store notification during IME.
        ui.settings.update(value => ({ ...value, date_format: 'wareki' }));
        await ui.tick();
        assert.equal(input.value, '令和');
        assert.equal(input.valueWrites, writes, 'composition must cause zero programmatic value writes');
        assert.equal(ui.input('date-confirmation').textContent, confirmation);
        assert.equal(ui.input('date-error').textContent, '');
      }
      input.nativeValue = committed;
      input.dispatch('compositionend');
      await ui.tick();
      assert.equal(input.value, committed);
      assert.equal(input.valueWrites, writes, 'committed raw text also needs no DOM rewrite');
      if (committed.includes('2月29日')) {
        assert.match(ui.input('date-error').textContent, /存在しません/);
        assert.equal(ui.input('date-confirmation').textContent, confirmation);
      } else {
        assert.equal(ui.input('date-error').textContent, '');
        assert.match(ui.input('date-confirmation').textContent, /令和7年10月22日/);
      }
      // Some WebViews send a final input event after compositionend.
      input.dispatch('input', { isComposing: false });
      ui.timer();
      await ui.tick();
      assert.equal(input.value, committed);
      assert.equal(input.valueWrites, writes);
    } finally { ui.destroy(); }
  });
}

const otherDrafts = [
  ...['top-text', 'bottom-text'].map(id => [id, '変換中の文字']),
  // Native number inputs expose ASCII numeric text or an empty value during an
  // incomplete edit; full-width IME text is not exposed as their .value.
  ...['top-size', 'date-size', 'bottom-size', 'output-size'].flatMap(id => [[id, '080'], [id, '']]),
];
for (const [id, draft] of otherDrafts) {
  test(`compiled App preserves IME input ${JSON.stringify(draft)} in ${id} across timer and store updates`, async () => {
    const ui = await mountApp(initialSettings());
    try {
      const input = ui.input(id);
      input.dispatch('compositionstart');
      input.nativeValue = draft;
      input.dispatch('input', { isComposing: true });
      const writes = input.valueWrites;
      await ui.tick();
      ui.advance(new Date(2026, 0, 1));
      ui.timer();
      ui.settings.update(value => ({ ...value, date_format: 'wareki' }));
      await ui.tick();
      assert.equal(input.value, draft);
      assert.equal(input.valueWrites, writes);
      input.dispatch('compositionend');
      input.dispatch('input', { isComposing: false });
      ui.timer();
      await ui.tick();
      assert.equal(input.value, draft);
      assert.equal(input.valueWrites, writes);
      assert.match(ui.input('date-confirmation').textContent, /令和8年1月1日/);
    } finally { ui.destroy(); }
  });
}

for (const [input, message] of [
  ['H31.5.1', '平成31年5月1日は平成の期間外です。正しい表記は令和元年5月1日です。'],
  ['1872-01-01', '旧暦は未対応です（1873年1月1日以降を入力してください）。'],
]) test(`P3 keeps the complete long date error for ${input} and disables output until corrected`, async () => {
  const ui = app({ pause: '' });
  const original = ui.run('dateState.date');
  ui.edit(input);
  assert.equal(ui.run('dateState.input'), input);
  assert.equal(ui.run('dateState.error'), message);
  assert.equal(ui.run('dateState.date'), original);
  await ui.copy(); await ui.save();
  assert.equal(ui.events.writes.length, 0);
  assert.equal(ui.events.sent.length, 0);
  ui.edit('R元.5.1');
  assert.equal(ui.run('dateState.error'), '');
  await ui.copy();
  assert.equal(ui.events.writes.length, 1);
});
