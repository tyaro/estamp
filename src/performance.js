import { invoke } from '@tauri-apps/api/core';

// Opt-in verification builds only. Values use navigationStart (performance time
// origin); the native harness separately measures process start -> visible window.
const enabled = import.meta.env.DEV || import.meta.env.VITE_PR05_MEASURE === '1';
/** @param {string} event */
export function markPerformance(event) {
  if (!enabled || window.__estampPerformance?.[event] !== undefined) return;
  const ms = performance.now();
  window.__estampPerformance ??= {};
  window.__estampPerformance[event] = ms;
  performance.mark(`estamp:${event}`);
  console.info('[estamp:performance]', event, ms);
  // A verification build can export these three fixed events to the native
  // harness. Ordinary builds cannot write a measurement file.
  if (import.meta.env.VITE_PR05_MEASURE === '1') {
    void invoke('pr05_measure', { event, ms }).catch(error => console.warn('計測出力に失敗', error));
  }
}
