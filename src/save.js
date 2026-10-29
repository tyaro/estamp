import { get } from 'svelte/store';

/** Save a snapshot without writing it back over edits made while IPC is pending.
 * @param {import('svelte/store').Readable<import('./store').Setting>} settings
 * @param {import('./date.js').DateState} dateState
 * @param {string | null} revision Opaque token from the last load, import or save.
 * @param {(args: {config: import('./store').Setting, revision: string | null}) => Promise<string>} persist
 * @returns {Promise<string>} New revision; callers update only the token after success.
 */
export async function saveSettings(settings, dateState, revision, persist) {
  const config = {
    ...get(settings),
    date_mode: dateState.mode,
    manual_date: dateState.mode === 'manual' ? dateState.date : null,
  };
  return await persist({ config, revision });
}
