import { get } from 'svelte/store';

/** Save a snapshot without writing it back over edits made while IPC is pending.
 * @param {import('svelte/store').Readable<import('./store').Setting>} settings
 * @param {import('./date.js').DateState} dateState
 * @param {(config: import('./store').Setting) => Promise<void>} persist
 */
export async function saveSettings(settings, dateState, persist) {
  const config = {
    ...get(settings),
    date_mode: dateState.mode,
    manual_date: dateState.mode === 'manual' ? dateState.date : null,
  };
  await persist(config);
}
