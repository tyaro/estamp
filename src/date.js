// All dates are civil YYYY-MM-DD strings. Never parse them with Date/UTC.
const eras = [
  { name: '明治', initial: 'M', base: 1867, start: '1873-01-01' },
  { name: '大正', initial: 'T', base: 1911, start: '1912-07-30' },
  { name: '昭和', initial: 'S', base: 1925, start: '1926-12-25' },
  { name: '平成', initial: 'H', base: 1988, start: '1989-01-08' },
  { name: '令和', initial: 'R', base: 2018, start: '2019-05-01' },
];
const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');

/** @param {number} year @param {number} month @param {number} day */
function civilDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error('西暦は1年から9999年までで入力してください。');
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new Error(`${year}年${month}月${day}日は存在しません。`);
  }
  const date = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
  if (date < eras[0].start) throw new Error('旧暦は未対応です（1873年1月1日以降を入力してください）。');
  return date;
}

/** Parse user input, rejecting rather than correcting dates outside an era.
 * @param {string} input @returns {string} */
export function parseDate(input) {
  const normalized = input.normalize('NFKC').trim().toUpperCase();
  if (!normalized) throw new Error('日付を入力してください。');
  const western = /^(\d{4})([/.\-])(\d{1,2})\2(\d{1,2})$/.exec(normalized);
  if (western) return civilDate(Number(western[1]), Number(western[3]), Number(western[4]));
  const japanese = /^(明治|大正|昭和|平成|令和|[MTSHR])(元|\d{1,4})(?:年(\d{1,2})月(\d{1,2})日|([/.\-])(\d{1,2})\5(\d{1,2}))$/.exec(normalized);
  if (!japanese) throw new Error('日付の形式を確認してください（例：R7.10.22、令和7年10月22日、2025/10/22）。');
  const era = eras.find(e => e.name === japanese[1] || e.initial === japanese[1]);
  if (!era) throw new Error('元号を確認してください。');
  const year = japanese[2] === '元' ? 1 : Number(japanese[2]);
  if (year === 0) throw new Error(`${era.name}0年は存在しません。`);
  const month = Number(japanese[3] || japanese[6]);
  const day = Number(japanese[4] || japanese[7]);
  const date = civilDate(era.base + year, month, day);
  const actual = eraFor(date);
  if (actual !== era) {
    throw new Error(`${era.name}${year === 1 ? '元' : year}年${month}月${day}日は${era.name}の期間外です。正しい表記は${formatWareki(date)}です。`);
  }
  return date;
}

/** @param {string} date */
function eraFor(date) {
  return eras.filter(e => e.start <= date).slice(-1)[0];
}

/** @param {string} date Validated civil date. */
export function formatWareki(date) {
  const [year, month, day] = date.split('-').map(Number);
  const era = eraFor(date);
  const eraYear = year - era.base;
  return `${era.name}${eraYear === 1 ? '元' : eraYear}年${month}月${day}日`;
}

/** @param {string} date @param {'gregorian' | 'wareki'} format */
export function formatStampDate(date, format) {
  return format === 'wareki' ? formatWareki(date) : date.replace(/-/g, '.');
}

/** @param {string} date */
export function describeDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${formatWareki(date)}（${year}/${month}/${day}）`;
}

/** Use local getters; accepting a clock makes midnight/timezone tests deterministic.
 * @param {Date} [now] */
export function localToday(now = new Date()) {
  return civilDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** @typedef {{mode: 'auto' | 'manual', date: string, input: string, error: string}} DateState */

/** @param {Date} [now] @returns {DateState} */
export function todayState(now = new Date()) {
  const date = localToday(now);
  return { mode: 'auto', date, input: date, error: '' };
}

/** @param {DateState} state @param {string} input @returns {DateState} */
export function editDate(state, input) {
  try {
    return { mode: 'manual', date: parseDate(input), input, error: '' };
  } catch (error) {
    return { ...state, input, error: error instanceof Error ? error.message : String(error) };
  }
}

/** @param {{date_mode?: string, manual_date?: string | null}} config @param {Date} [now] */
export function restoreDate(config, now = new Date()) {
  const state = todayState(now);
  if (config.date_mode !== 'manual') return state;
  const input = config.manual_date ?? '';
  // Persisted manual dates must use the same canonical representation as save.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { ...state, mode: /** @type {const} */ ('manual'), input, error: '保存された日付が不正です。日付を入力するか「今日に戻す」を選んでください。' };
  }
  return { ...editDate(state, input), mode: /** @type {const} */ ('manual') };
}

/** @param {DateState} state @param {Date} [now] @returns {DateState} */
export function refreshDate(state, now = new Date()) {
  if (state.mode === 'manual' || state.error) return state;
  const date = localToday(now);
  if (date === state.date) return state;
  return { ...state, date, input: state.error ? state.input : date };
}
