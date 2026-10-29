import test from 'node:test';
import assert from 'node:assert/strict';
import { get, writable } from 'svelte/store';
import { editDate, todayState } from '../src/date.js';
import { saveSettings } from '../src/save.js';

const initialSettings = () => ({
  schema_version: 1, stamp_type: 'dated_stamp',
  top_str: '所属', top_font_size: 80, mid_font_size: 60,
  btm_str: '名前', btm_font_size: 80, output_size: 100,
  date_mode: 'auto', date_format: 'gregorian', manual_date: null,
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('successful pending save preserves edits and the next save uses them', async () => {
  const settings = writable(initialSettings());
  let dateState = editDate(todayState(), 'R7.10.22');
  const pending = deferred();
  let revision = 'loaded revision';
  let sent;
  const saving = saveSettings(settings, dateState, revision, args => {
    sent = args;
    return pending.promise;
  });
  const expectedSnapshot = {
    ...initialSettings(), date_mode: 'manual', manual_date: '2025-10-22',
  };
  assert.deepEqual(sent, { config: expectedSnapshot, revision: 'loaded revision' });

  // Svelte bindings mutate properties on the live object before notifying the store.
  settings.update(current => {
    Object.assign(current, {
      top_str: '新しい所属', btm_str: '新しい名前',
      top_font_size: 72, mid_font_size: 48, btm_font_size: 64,
      output_size: 200, date_format: 'wareki',
    });
    return current;
  });
  dateState = editDate(dateState, 'R6.2.29');
  const edited = { ...get(settings) };
  const editedDate = { ...dateState };
  assert.deepEqual(sent, { config: expectedSnapshot, revision: 'loaded revision' });

  pending.resolve('saved revision');
  revision = await saving;
  assert.equal(revision, 'saved revision');
  assert.deepEqual(get(settings), edited);
  assert.deepEqual(dateState, editedDate);
  assert.deepEqual(sent, { config: expectedSnapshot, revision: 'loaded revision' });

  let nextSent;
  revision = await saveSettings(settings, dateState, revision, async args => {
    nextSent = args;
    return 'next revision';
  });
  assert.deepEqual(nextSent, { config: { ...edited, date_mode: 'manual', manual_date: '2024-02-29' }, revision: 'saved revision' });
  assert.equal(revision, 'next revision');
  assert.deepEqual(get(settings), edited);
});

test('failed pending save propagates the error and preserves edits', async () => {
  const settings = writable(initialSettings());
  const pending = deferred();
  let dateState = editDate(todayState(), 'R7.10.22');
  const saving = saveSettings(settings, dateState, 'loaded revision', () => pending.promise);
  settings.update(current => ({ ...current, btm_str: '編集中', date_format: 'wareki' }));
  dateState = editDate(dateState, 'R7.2.29');
  const edited = { ...get(settings) };
  const editedDate = { ...dateState };
  const error = new Error('save failed');
  const rejected = assert.rejects(saving, error);
  pending.reject(error);
  await rejected;
  assert.deepEqual(get(settings), edited);
  assert.deepEqual(dateState, editedDate);
  assert.ok(dateState.error);
});

test('automatic save sends a null manual date without changing the live settings', async () => {
  const initial = { ...initialSettings(), date_mode: 'manual', manual_date: '2025-10-22' };
  const settings = writable(initial);
  let sent;
  const revision = await saveSettings(settings, todayState(new Date(2026, 9, 29)), null, async args => {
    sent = args;
    return 'first revision';
  });
  assert.deepEqual(sent, { config: { ...initial, date_mode: 'auto', manual_date: null }, revision: null });
  assert.equal(revision, 'first revision');
  assert.deepEqual(get(settings), initial);
});

test('save retains unknown seal types and nested future fields while normalizing dates', async () => {
  const future = {
    ...initialSettings(), stamp_type: 'future_角印',
    future_options: { nested: [true, null, '値'], zero: 0, empty: '' },
    future_flag: false,
  };
  const settings = writable(future);
  settings.update(value => ({ ...value, top_str: '編集済み', date_format: 'wareki' }));
  let sent;
  const revision = await saveSettings(settings, editDate(todayState(), 'Ｒ元．５．１'), '\ufefforiginal', async args => {
    // Exercise the JSON boundary used by Tauri, including the BOM-bearing token.
    sent = JSON.parse(JSON.stringify(args));
    return 'new revision';
  });
  assert.deepEqual(sent, {
    config: { ...future, top_str: '編集済み', date_format: 'wareki', date_mode: 'manual', manual_date: '2019-05-01' },
    revision: '\ufefforiginal',
  });
  assert.equal(revision, 'new revision');
  assert.deepEqual(get(settings).future_options, future.future_options);
  assert.equal(get(settings).stamp_type, 'future_角印');
});
