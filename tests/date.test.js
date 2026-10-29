import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseDate, formatWareki, formatStampDate, describeDate, localToday, todayState, editDate, restoreDate, refreshDate } from '../src/date.js';

test('all era boundaries and minimum supported day', () => {
  for (const [input, iso, display] of [
    ['M6.1.1', '1873-01-01', '明治6年1月1日'],
    ['M45.7.29', '1912-07-29', '明治45年7月29日'],
    ['T元.7.30', '1912-07-30', '大正元年7月30日'],
    ['T15.12.24', '1926-12-24', '大正15年12月24日'],
    ['S1.12.25', '1926-12-25', '昭和元年12月25日'],
    ['S64.1.7', '1989-01-07', '昭和64年1月7日'],
    ['H1.1.8', '1989-01-08', '平成元年1月8日'],
    ['H31.4.30', '2019-04-30', '平成31年4月30日'],
    ['R元.5.1', '2019-05-01', '令和元年5月1日'],
  ]) {
    assert.equal(parseDate(input), iso);
    assert.equal(parseDate(iso), iso);
    assert.equal(formatWareki(iso), display);
    assert.equal(parseDate(display), iso);
  }
});

test('out-of-era errors include the correct notation', () => {
  for (const [input, expected] of [
    ['M45.7.30', '大正元年7月30日'], ['T1.7.29', '明治45年7月29日'],
    ['T15.12.25', '昭和元年12月25日'], ['S1.12.24', '大正15年12月24日'],
    ['S64.1.8', '平成元年1月8日'], ['H1.1.7', '昭和64年1月7日'],
    ['H31.5.1', '令和元年5月1日'], ['R1.4.30', '平成31年4月30日'],
    ['平成32年10月22日', '令和2年10月22日'],
  ]) assert.throws(() => parseDate(input), { message: new RegExp(`期間外です。正しい表記は${expected}です。`) });
});

test('NFKC, lowercase, first year, and western separators', () => {
  for (const input of ['R7.10.22', 'r7.10.22', '令和7年10月22日', '2025/10/22', '2025-10-22', '2025.10.22', 'Ｒ７．１０．２２', '令和７年１０月２２日', '２０２５／１０／２２', '２０２５－１０－２２', '  R7.10.22  ']) {
    assert.equal(parseDate(input), '2025-10-22');
  }
  for (const input of ['R元.5.1', 'r1.5.1', '令和元年5月1日', 'Ｒ元．５．１']) assert.equal(parseDate(input), '2019-05-01');
});

test('leap days, nonexistent dates, lower bound, and malformed input', () => {
  for (const input of ['R6.2.29', '2024-02-29', '2000/2/29']) assert.match(parseDate(input), /-02-29$/);
  for (const input of ['R7.2.29', '1900/2/29', '2025/4/31', '2025/0/1', '2025/13/1', '2025/1/0', '2025/1/32']) assert.throws(() => parseDate(input), /存在しません/);
  for (const input of ['1872/12/31', 'M5.12.31', '明治元年1月1日', '0001-01-01']) assert.throws(() => parseDate(input), /旧暦は未対応/);
  assert.throws(() => parseDate('R0.1.1'), /令和0年は存在しません/);
  assert.throws(() => parseDate(''), /日付を入力/);
  for (const input of ['25/1/1', '7.10.22', '2025/10-22', 'R7.10/22', 'R-1.1.1', '2025-01-01T00:00:00Z', '任意文字列']) assert.throws(() => parseDate(input), /形式/);
  // Real-day validation precedes era validation.
  assert.throws(() => parseDate('H32.2.30'), /2020年2月30日は存在しません/);
});

test('stamp and confirmation formats share the canonical date', () => {
  assert.equal(formatStampDate('2019-05-01', 'gregorian'), '2019.05.01');
  assert.equal(formatStampDate('2019-05-01', 'wareki'), '令和元年5月1日');
  assert.equal(describeDate('2025-10-22'), '令和7年10月22日（2025/10/22）');
});

test('local clock, midnight/year rollover, resume, and manual retention', () => {
  const before = new Date(2025, 11, 31, 23, 59, 59);
  const after = new Date(2026, 0, 1, 0, 0, 1);
  assert.equal(localToday(before), '2025-12-31');
  assert.equal(localToday(after), '2026-01-01');
  const automatic = refreshDate(todayState(before), after);
  assert.equal(automatic.date, '2026-01-01');
  assert.equal(automatic.input, '2026-01-01');
  assert.equal(refreshDate(automatic, new Date(2026, 0, 3)).date, '2026-01-03');
  const manual = editDate(automatic, 'H31.4.30');
  assert.deepEqual(refreshDate(manual, after), manual);
  assert.equal(todayState(after).mode, 'auto');
  assert.equal(todayState(after).date, '2026-01-01');
});

test('invalid edits preserve last valid date and input until corrected or reset', () => {
  const state = editDate(todayState(), 'R6.2.29');
  for (const input of ['', 'R7.2.29', 'R1.4.30']) {
    const invalid = editDate(state, input);
    assert.equal(invalid.date, '2024-02-29');
    assert.equal(invalid.input, input);
    assert.ok(invalid.error);
    assert.equal(editDate(invalid, '2025/10/22').error, '');
  }
  const invalidAuto = editDate(todayState(new Date(2025, 11, 31)), 'R');
  const resumed = refreshDate(invalidAuto, new Date(2026, 0, 1));
  assert.equal(resumed.input, 'R');
  assert.equal(resumed.date, '2025-12-31');
  assert.ok(resumed.error);
  assert.equal(todayState().error, '');
});

test('restore legacy settings, automatic mode, canonical manual date, and corrupt date', () => {
  const now = new Date(2026, 9, 29);
  assert.deepEqual(restoreDate({}, now), todayState(now));
  assert.equal(restoreDate({date_mode: 'auto', manual_date: '2019-05-01'}, now).date, '2026-10-29');
  const restored = restoreDate({date_mode: 'manual', manual_date: '2019-05-01'}, now);
  assert.equal(restored.date, '2019-05-01');
  assert.equal(restored.mode, 'manual');
  for (const manual_date of [null, 'R7.10.22', '2025-02-29', '1872-12-31']) {
    assert.ok(restoreDate({date_mode: 'manual', manual_date}, now).error);
  }
});

test('local today stays correct on either side of UTC in CI too', () => {
  const moduleUrl = new URL('../src/date.js', import.meta.url).href;
  for (const [timezone, expected] of [['Asia/Tokyo', '2026-01-01'], ['America/Los_Angeles', '2025-12-31']]) {
    const actual = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { localToday } from ${JSON.stringify(moduleUrl)};
      process.stdout.write(localToday(new Date('2025-12-31T15:30:00Z')));
    `], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(actual, expected);
  }
});
