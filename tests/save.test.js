import test from 'node:test';
import assert from 'node:assert/strict';
import { get, writable } from 'svelte/store';
import { editDate, todayState } from '../src/date.js';
import { saveSettings } from '../src/save.js';

const initialSettings = () => ({
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
  let sent;
  const saving = saveSettings(settings, dateState, config => {
    sent = config;
    return pending.promise;
  });
  const expectedSnapshot = {
    ...initialSettings(), date_mode: 'manual', manual_date: '2025-10-22',
  };
  assert.deepEqual(sent, expectedSnapshot);

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
  assert.deepEqual(sent, expectedSnapshot);

  pending.resolve();
  await saving;
  assert.deepEqual(get(settings), edited);
  assert.deepEqual(dateState, editedDate);
  assert.deepEqual(sent, expectedSnapshot);

  let nextSent;
  await saveSettings(settings, dateState, async config => { nextSent = config; });
  assert.deepEqual(nextSent, { ...edited, date_mode: 'manual', manual_date: '2024-02-29' });
  assert.deepEqual(get(settings), edited);
});

test('failed pending save propagates the error and preserves edits', async () => {
  const settings = writable(initialSettings());
  const pending = deferred();
  let dateState = editDate(todayState(), 'R7.10.22');
  const saving = saveSettings(settings, dateState, () => pending.promise);
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
  await saveSettings(settings, todayState(new Date(2026, 9, 29)), async config => { sent = config; });
  assert.deepEqual(sent, { ...initial, date_mode: 'auto', manual_date: null });
  assert.deepEqual(get(settings), initial);
});
