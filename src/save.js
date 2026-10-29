import { get } from 'svelte/store';

/** Only known settings cross IPC; Rust merges opaque extra fields from the file.
 * @param {import('./store').Setting} current
 * @param {import('./date.js').DateState} dateState
 * @returns {import('./store').Setting}
 */
export function settingsSnapshot(current, dateState) {
  const { schema_version, stamp_type, top_str, top_font_size, mid_font_size,
    btm_str, btm_font_size, output_size, date_format } = current;
  return { schema_version, stamp_type, top_str, top_font_size, mid_font_size,
    btm_str, btm_font_size, output_size, date_format,
    date_mode: dateState.mode, manual_date: dateState.mode === 'manual' ? dateState.date : null };
}

/** Save a snapshot without writing it back over edits made while IPC is pending.
 * @param {import('svelte/store').Readable<import('./store').Setting>} settings
 * @param {import('./date.js').DateState} dateState
 * @param {string | null} revision Opaque token from the last load, import or save.
 * @param {(args: {config: import('./store').Setting, revision: string | null}) => Promise<string>} persist
 * @returns {Promise<string>} New revision; callers update only the token after success.
 */
export async function saveSettings(settings, dateState, revision, persist) {
  const config = settingsSnapshot(get(settings), dateState);
  return await persist({ config, revision });
}
