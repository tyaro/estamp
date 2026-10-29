import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { get, writable } from 'svelte/store';
import * as dates from '../src/date.js';
import { saveSettings } from '../src/save.js';

// Execute the production App handlers, including their post-await code. Only the
// DOM flush, renderer and Tauri boundary are fakes; this is not a WebView test.
const source = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const compiled = ts.transpileModule(script, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function app({ pause = 'render', persist = async () => {} } = {}) {
  const settings = writable({
    top_str: '所属', top_font_size: 80, mid_font_size: 60,
    btm_str: '名前', btm_font_size: 80, output_size: 100,
    date_mode: 'auto', date_format: 'gregorian', manual_date: null,
  });
  let now = new Date(2025, 11, 31, 23, 59, 59);
  const gate = deferred();
  const reached = deferred();
  const events = { writes: [], closed: 0, success: [], error: [], sent: [] };
  const image = { close: async () => { events.closed++; } };
  const boundary = async stage => {
    if (stage === pause) {
      reached.resolve();
      await gate.promise;
    }
  };
  let context;
  const run = code => vm.runInContext(code, context);
  const svg = {
    outerHTML: '', width: { baseVal: { value: 100 } }, height: { baseVal: { value: 100 } },
  };
  const flush = async () => {
    const state = run('dateState');
    const config = get(settings);
    svg.outerHTML = `<svg>${JSON.stringify([
      dates.formatStampDate(state.date, config.date_format), config.top_str, config.btm_str,
      config.top_font_size, config.mid_font_size, config.btm_font_size,
    ])}</svg>`;
  };
  const imports = {
    canvg: { Canvg: { fromString: (_ctx, text) => ({
      resize() {}, render: async () => { image.svg = text; await boundary('render'); },
    }) } },
    './store': { settings },
    svelte: { onMount() {}, tick: flush },
    '@tauri-apps/api/core': { invoke: async (command, { config }) => {
      assert.equal(command, 'save');
      events.sent.push(config);
      await persist(config);
    } },
    '@tauri-apps/api/image': { Image: { new: async () => { await boundary('image'); return image; } } },
    '@tauri-apps/plugin-clipboard-manager': { writeImage: async value => { events.writes.push(value.svg); } },
    'svelte-french-toast': {
      success: message => events.success.push(message), error: message => events.error.push(message),
    },
    './date.js': {
      ...dates, todayState: () => dates.todayState(now), refreshDate: state => dates.refreshDate(state, now),
    },
    './save.js': { saveSettings },
  };
  context = vm.createContext({
    // Svelte declares these reactive assignment targets when it compiles the DOM.
    str_date: '', dateWidth: 0, dateTextScale: 1,
    exports: {}, require: name => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    console: { error() {} },
    document: {
      querySelector: () => svg,
      createElement: () => ({ getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      }) }),
    },
  });
  // Svelte's $settings assignment writes to the real store, so reintroducing
  // `$settings = config` in App after a save makes the regression test fail.
  Object.defineProperty(context, '$settings', { get: () => get(settings), set: value => settings.set(value) });
  run(compiled);
  run('loading = false');
  return {
    settings, events, gate, reached, run,
    copy: () => run('clipboardCopy()'), save: () => run('save()'),
    edit: input => run(`inputDate({ currentTarget: { value: ${JSON.stringify(input)} } })`),
    advance: value => { now = value; },
  };
}

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
      assert.deepEqual(ui.events.success, []);
      assert.match(ui.events.error[0], /変更.*中止/);
      assert.equal(ui.events.closed, 1);
      assert.equal(ui.run('copying'), false);
      if (change === 'invalid date') ui.edit('R7.10.22');
      await ui.copy();
      assert.equal(ui.events.writes.length, 1);
      const state = ui.run('dateState');
      assert.ok(ui.events.writes[0].includes(dates.formatStampDate(state.date, get(ui.settings).date_format)));
      assert.equal(ui.events.closed, 2);
      assert.equal(ui.events.success.length, 1);
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
  assert.equal(ui.events.closed, 1);
  assert.deepEqual(ui.events.error, []);
  assert.equal(ui.events.success.length, 1);
  assert.equal(ui.run('copying'), false);
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
  pending.resolve();
  await saving;
  assert.deepEqual(get(ui.settings), edited);
  assert.equal(ui.run('dateState'), editedDate);
  assert.deepEqual(ui.events.success, ['保存しました']);
  await ui.save();
  assert.deepEqual(ui.events.sent[1], { ...edited, date_mode: 'manual', manual_date: '2024-02-29' });
});

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
  assert.match(ui.events.error[0], /保存に失敗/);
  assert.deepEqual(ui.events.success, []);
});
