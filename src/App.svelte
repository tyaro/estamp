<script lang="ts">
  import { settings,type LoadedSettings } from './store';
  import { onMount, tick } from 'svelte';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { invoke } from '@tauri-apps/api/core';
  import { Image } from '@tauri-apps/api/image';
  import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
  import { describeDate, editDate, formatStampDate, refreshDate, restoreDate, todayState } from './date.js';
  import { saveSettings, settingsSnapshot } from './save.js';
  import { loadStampFonts, loadUiFonts } from './fonts.js';
  import { buildStampSvg, hasLongStampLine, renderStampImage, splitStampText, validateImageSettings } from './stampImage.js';
  import { markPerformance } from './performance.js';
  import Licenses from './Licenses.svelte';
  import { version } from '../package.json';

  let composing = false;
  let dateState = todayState();
  // Keep the raw IME draft independent of the last validated date.
  let dateDraft = dateState.input;
  let fontsReady = false;
  let settingsOpen = false;
  let stampButton: HTMLButtonElement;
  let aboutHeading: HTMLHeadingElement;
  let hintLaunchCount = 0;
  let changingSettings = false;
  let settingsHeading: HTMLHeadingElement;
  let copyError: HTMLParagraphElement;
  let viewport: HTMLDivElement;
  let initialLoad = true;
  let settingsUnsaved = false;
  const changeSettings = async (open: boolean) => {
    if (disposed || changingSettings) return;
    changingSettings = true;
    try {
      await invoke('set_settings_expanded', { expanded: open });
      if (disposed) return;
      settingsOpen = open;
      await tick();
      if (open) {
        settingsHeading?.focus({ preventScroll: true });
        settingsHeading?.scrollIntoView({ block: 'nearest' });
      } else {
        if (viewport) viewport.scrollTop = 0;
        stampButton?.focus();
      }
    } catch (error) {
      if (!disposed) storageMessage = `× 設定ウィンドウを変更できません：${String(error)}`;
    } finally {
      changingSettings = false;
    }
  };
  const openSettings = () => changeSettings(true);
  const closeSettings = () => changeSettings(false);
  const toggleSettings = () => changeSettings(!settingsOpen);
  const showMenu = async (keyboard = false) => {
    try { await invoke('show_settings_menu', { keyboard }); }
    catch (error) { if (!disposed) storageMessage = `× メニューを表示できません：${String(error)}`; }
  };
  const contextMenu = (event: MouseEvent) => {
    // Suppress the production WebView2 menu even if native IPC fails.
    event.preventDefault();
    // Shift+F10 can also synthesize contextmenu: keydown already opened it.
    if (event.button === 2 || !keyboardMenuActive) void showMenu();
  };
  let keyboardMenuActive = false;
  const settingsKeyup = () => { keyboardMenuActive = false; };
  const settingsKeydown = (event: KeyboardEvent) => {
    if (event.isComposing || composing) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!event.repeat) void toggleSettings();
    } else if ((event.shiftKey && event.key === 'F10' && !event.altKey && !event.ctrlKey && !event.metaKey)
      || event.key === 'ContextMenu' || event.key === 'Apps') {
      event.preventDefault();
      keyboardMenuActive = true;
      if (!event.repeat) void showMenu(true);
    } else if (event.key === 'Escape' && settingsOpen) {
      event.preventDefault();
      void closeSettings();
    }
  };
  const focusCopyError = () => {
    copyError?.focus({ preventScroll: true });
    copyError?.scrollIntoView({ block: 'start' });
  };
  const menuAction = async (action: string) => {
    if (disposed) return;
    if (action === 'settings') await toggleSettings();
    else if (action === 'copy') await clipboardCopy();
    else if (action === 'today') resetDate();
    else if (action === 'about') {
      await openSettings();
      if (disposed || !settingsOpen) return;
      aboutHeading?.focus({ preventScroll: true });
      aboutHeading?.scrollIntoView({ block: 'start' });
    }
  };
  // The first click copies immediately. The browser's click.detail excludes the
  // second click of a double-click; dblclick opens settings using the OS interval.
  const stampClick = (event: MouseEvent) => {
    if (event.detail > 1) return;
    return clipboardCopy();
  };
  const stampDoubleClick = (event: MouseEvent) => {
    if (event.button === 0) void openSettings();
  };
  $: str_date = formatStampDate(dateState.date, $settings.date_format);
  $: stampSvg = fontsReady ? buildStampSvg($settings, str_date) : '';
  $: imageError = (() => {
    try { validateImageSettings($settings); return ''; }
    catch (error) { return `× ${String(error)}`; }
  })();
  const refreshToday = () => {
    if (composing) return;
    const refreshed = refreshDate(dateState);
    if (refreshed === dateState) return;
    dateState = refreshed;
    dateDraft = dateState.input;
  };
  const inputDate = (event: Event) => {
    dateDraft = (event.currentTarget as HTMLInputElement).value;
    if (composing || (event as InputEvent).isComposing) return;
    dateState = editDate(dateState, dateDraft);
  };

  const finishComposition = (event: CompositionEvent) => {
    composing = false;
    const input = event.target as HTMLInputElement;
    if (input.id === 'date-input') {
      dateDraft = input.value;
      dateState = editDate(dateState, dateDraft);
    }
  };

  const resetDate = () => {
    if (composing) return;
    dateState = todayState();
    dateDraft = dateState.input;
  };

  let copying = false;
  let copyMessage = '';
  let disposed = false;
  let copyFeedback = '';
  let copyFeedbackTimer: number | undefined;
  const setCopyFeedback = (message: string) => {
    window.clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = undefined;
    if (disposed) return;
    copyMessage = message;
    copyFeedback = message.startsWith('○') ? '○ コピー成功'
      : message.startsWith('△') ? '△ コピー中止'
      : message ? '× コピー失敗' : '';
    // Keep failures/cancellations visible until the next copy attempt.
    if (message.startsWith('○')) {
      copyFeedbackTimer = window.setTimeout(() => {
        copyFeedback = '';
        copyFeedbackTimer = undefined;
      }, 1800);
    }
  };
  let busy = true;
  let ready = false;
  let revision: string | null = null;
  let storageMessage = '';
  let legacyAvailable = false;
  let confirmingImport = false;
  let savedSnapshot: string | null = null;
  let dirty = false;
  $: dirty = savedSnapshot !== null && (!!dateState.error
    || JSON.stringify(settingsSnapshot($settings, dateState)) !== savedSnapshot);
  $: if (!dirty && storageMessage === '△ 未保存の変更があります') storageMessage = '';
  let fontMessage = '';
  // Independent of copy feedback: a successful copy must not hide a save error.
  $: startupIssue = fontMessage ? '× 書体エラー'
    : storageMessage.startsWith('×') ? '× 設定エラー'
    : dateState.error || imageError ? '× 入力エラー\n（Alt+S）'
    // First-save guidance remains below the seal and takes priority over edits.
    : !settingsUnsaved && dirty ? '△ 変更未保存\n（Alt+S）'
    : storageMessage.includes('△') ? '△ 設定に注意' : '';

  const prepareFonts = async () => {
    try {
      await Promise.all([loadStampFonts(), loadUiFonts()]);
      markPerformance('fonts-ready');
      if (!disposed) {
        fontsReady = true; fontMessage = '';
        await tick();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!disposed) markPerformance('first-stamp-render');
        }));
      }
    } catch (error) {
      if (!disposed) fontMessage = `× 書体を読み込めません：${String(error)}`;
    }
  };

  const applyLoaded = (result: LoadedSettings) => {
    $settings = result.settings;
    dateState = restoreDate(result.settings);
    dateDraft = dateState.input;
    savedSnapshot = JSON.stringify(settingsSnapshot($settings, dateState));
    revision = result.revision;
    hintLaunchCount = result.hint_launch_count ?? 0;
    // Rust returns null only for an absent file or after successful quarantine.
    // Valid legacy settings in the config directory already have a revision.
    settingsUnsaved = result.revision === null;
    storageMessage = result.warning ?? '○ 設定を読み込みました';
    ready = true;
  };

  const save = async () => {
    if (composing || busy || !ready || dateState.error || imageError) return;
    refreshToday();
    busy = true;
    try {
      const firstSave = settingsUnsaved;
      const snapshot = JSON.stringify(settingsSnapshot($settings, dateState));
      // Save a snapshot; do not replace edits made while IPC is pending.
      revision = await saveSettings(settings, dateState, revision, args => invoke<string>("save", args));
      settingsUnsaved = false;
      savedSnapshot = snapshot;
      dirty = !!dateState.error || JSON.stringify(settingsSnapshot($settings, dateState)) !== snapshot;
      storageMessage = dirty ? '△ 未保存の変更があります' : '○ 保存しました';
      if (firstSave && !dirty && !dateState.error && !imageError && !fontMessage && !copyFeedback.startsWith('×')) await closeSettings();
    } catch (error) {
      storageMessage = `× 保存に失敗しました：${String(error)}`;
    } finally {
      busy = false;
    }
  };

  const refreshLegacy = async () => {
    legacyAvailable = false;
    confirmingImport = false;
    try {
      legacyAvailable = await invoke<boolean>("legacy_available");
    } catch (error) {
      storageMessage += ` △ 旧設定の有無を確認できませんでした：${String(error)}`;
    }
  };

  const load = async () => {
    const startup = initialLoad;
    initialLoad = false;
    busy = true;
    try {
      const result = await invoke<LoadedSettings>("load");
      if (disposed) return;
      applyLoaded(result);
      if (startup && settingsUnsaved) await openSettings();
    } catch (error) {
      if (disposed) return;
      ready = false;
      storageMessage = `× 設定を読み込めませんでした：${String(error)}`;
      if (startup) await openSettings();
    } finally {
      if (!disposed) {
        await refreshLegacy();
        busy = false;
      }
    }
  };

  const importLegacy = async () => {
    if (busy || !ready || !legacyAvailable || !confirmingImport) return;
    busy = true;
    try {
      applyLoaded(await invoke<LoadedSettings>("import_legacy", { revision }));
    } catch (error) {
      storageMessage = `× 旧設定を取り込めませんでした：${String(error)}`;
    } finally {
      if (!disposed) {
        await refreshLegacy();
        busy = false;
      }
    }
  };

  onMount(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!disposed) markPerformance('first-window-paint');
    }));
    document.title = '電子印 — 右クリックで設定';
    let unlisten: UnlistenFn | undefined;
    void listen<string>('settings-menu-action', event => { void menuAction(event.payload); },
      { target: { kind: 'WebviewWindow', label: 'main' } }).then(stop => {
        if (disposed) stop(); else unlisten = stop;
      }).catch(error => { if (!disposed) storageMessage = `× メニューを準備できません：${String(error)}`; });
    void load();
    void prepareFonts();
    const timer = window.setInterval(refreshToday, 1000);
    window.addEventListener('focus', refreshToday);
    window.addEventListener('keydown', settingsKeydown);
    window.addEventListener('keyup', settingsKeyup);
    window.addEventListener('contextmenu', contextMenu);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      disposed = true;
      unlisten?.();
      window.clearTimeout(copyFeedbackTimer);
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
      window.removeEventListener('keydown', settingsKeydown);
      window.removeEventListener('keyup', settingsKeyup);
      window.removeEventListener('contextmenu', contextMenu);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  });
  const clipboardCopy = async () => {
    if (composing || busy || !ready || !fontsReady || copying || dateState.error || imageError) return;
    copying = true;
    setCopyFeedback('');
    try {
      refreshToday();
      await tick();
      const expectedSvg = stampSvg;
      const outputSize = $settings.output_size;
      const rendered = await renderStampImage(expectedSvg, outputSize);
      const image = await Image.new(rendered.rgba, rendered.width, rendered.height);
      try {
        refreshToday();
        await tick();
        if (disposed || composing || busy || !ready || dateState.error || imageError
          || stampSvg !== expectedSvg
          || $settings.output_size !== outputSize) {
          setCopyFeedback('△ 印影が変更されたためコピーを中止しました。もう一度コピーしてください。');
          return;
        }
        await writeImage(image);
        setCopyFeedback('○ 画像をコピーしました');
      } finally {
        await image.close();
      }
    } catch (error) {
      setCopyFeedback(`× 画像コピーに失敗しました：${String(error)}`);
    } finally {
      copying = false;
    }
  };
</script>
<div class="app-viewport" bind:this={viewport}>
  <div class="main" class:compact-caption={(settingsUnsaved && !settingsOpen) || (!settingsUnsaved && hintLaunchCount <= 3)}>
    <div class="stamp-box">
      <button class="stamp-copy" type="button" aria-label="印影をコピー。右クリックまたはAlt+Sで設定"
        title="印影をコピー。右クリックまたはAlt+Sで設定" bind:this={stampButton}
        aria-disabled={composing || busy || !ready || !fontsReady || copying || !!dateState.error || !!imageError}
        aria-busy={copying} on:click={stampClick} on:dblclick={stampDoubleClick}>
        {#if fontsReady}
          {@html stampSvg}
        {:else}
          書体を読込中…
        {/if}
      </button>
      <p class="stamp-feedback copy-feedback" class:storage-success={copyFeedback.startsWith('○')}
        class:storage-warning={copyFeedback.startsWith('△')}
        class:feedback-visible={!!copyFeedback && !copyFeedback.startsWith('×')}
        role="status" aria-live="polite" aria-atomic="true">{copyFeedback.startsWith('×') ? '' : copyFeedback}</p>
      <p class="stamp-feedback copy-feedback" class:feedback-visible={copyFeedback.startsWith('×')}
        role="alert" aria-live="assertive" aria-atomic="true">{#if copyFeedback.startsWith('×')}{copyFeedback}<br>詳細（Alt+S）{/if}</p>
      <p class="stamp-feedback startup-issue" class:storage-warning={startupIssue.startsWith('△')}
        class:feedback-visible={!!startupIssue}
        role="alert" aria-live="assertive" aria-atomic="true">{startupIssue}</p>
    </div>
  </div>
  {#if settingsUnsaved && !settingsOpen}
    <p class="unsaved-settings storage-warning" role="status">△ 設定が未保存です（Alt+S）</p>
  {/if}
  {#if !settingsUnsaved && hintLaunchCount <= 3}
    <p class="settings-hint">右クリックで設定</p>
  {/if}
  <div hidden={!settingsOpen}>
  {#if storageMessage}
    <p class="storage-message" class:storage-warning={storageMessage.startsWith('△')}
      class:storage-success={storageMessage.startsWith('○')} aria-hidden="true">{storageMessage}</p>
  {/if}
  {#if copyMessage}
    <p id="copy-error" class="storage-message" tabindex="-1" bind:this={copyError}
      class:storage-warning={copyMessage.startsWith('△')}
      class:storage-success={copyMessage.startsWith('○')}>{copyMessage}</p>
  {/if}
  {#if fontMessage}
    <p class="storage-message" role="alert">{fontMessage}</p>
    <div class="retry"><button type="button" on:click={prepareFonts}>書体を再読込</button></div>
  {/if}
  <section id="settings-panel" class="settings-panel" aria-labelledby="settings-heading">
    <h1 id="settings-heading" tabindex="-1" bind:this={settingsHeading}>印影の設定</h1>
    <button type="button" on:click={closeSettings}>閉じる</button>
    {#if copyFeedback.startsWith('×')}
      <button type="button" on:click={focusCopyError}>コピー失敗の詳細へ</button>
    {/if}
    {#if settingsUnsaved}
      <p class="first-settings" role="status">はじめに氏名などを入力し保存してください</p>
    {/if}
    <fieldset class="menu" disabled={busy || !ready}
      on:compositionstart={() => composing = true} on:compositionend={finishComposition}>
      <legend>文字と日付</legend>
      <label for="top-text">上段の文字列</label>
      <input id="top-text" aria-describedby="top-text-warning" bind:value={$settings.top_str}>
      <p id="top-text-warning" class="text-warning" role="status">{hasLongStampLine($settings.top_str) ? '△ 8文字を超えるため縮小します。空白で2行に分けられます' : ''}</p>
      <label for="top-size">上段の文字サイズ</label>
      <input id="top-size" type="number" min="1" max="400" step="1" aria-describedby="size-help image-error" bind:value={$settings.top_font_size}>

      <label for="date-input">日付（西暦・和暦）</label>
      <input id="date-input" type="text" aria-invalid={!!dateState.error}
        aria-describedby="date-help date-error date-confirmation" value={dateDraft}
        on:input={inputDate} placeholder="R7.10.22" autocomplete="off" spellcheck={false}>
      <p id="date-error" role="alert" class="date-error">{dateState.error ? `× ${dateState.error}` : ''}</p>
      <p id="date-help" class="hint">例：R7.10.22、令和7年10月22日、2025/10/22</p>
      <p id="date-confirmation">{describeDate(dateState.date)}</p>
      <p class="hint">{dateState.mode === 'auto' ? '自動：今日の日付に更新します' : '手動：指定した日付を使います'}</p>
      <button type="button" on:click={resetDate}>今日に戻す</button>
      <label for="date-size">日付の文字サイズ</label>
      <input id="date-size" type="number" min="1" max="400" step="1" aria-describedby="size-help image-error" bind:value={$settings.mid_font_size}>
      <label for="date-format">日付の表示形式</label>
      <select id="date-format" bind:value={$settings.date_format}>
        <option value="gregorian">西暦</option>
        <option value="wareki">和暦</option>
      </select>

      <label for="bottom-text">下段の文字列</label>
      <input id="bottom-text" aria-describedby="bottom-text-warning" bind:value={$settings.btm_str}>
      <p id="bottom-text-warning" class="text-warning" role="status">{hasLongStampLine($settings.btm_str) ? '△ 8文字を超えるため縮小します。空白で2行に分けられます' : ''}</p>
      <label for="bottom-size">下段の文字サイズ</label>
      <input id="bottom-size" type="number" min="1" max="400" step="1" aria-describedby="size-help image-error" bind:value={$settings.btm_font_size}>
      <p id="size-help" class="hint">文字サイズ：1〜400の整数。印影に収まるよう自動調整します。</p>
      <label for="output-size">出力サイズ（px）</label>
      <input id="output-size" type="number" min="1" max="4096" step="1" aria-describedby="output-size-warning output-help image-error" bind:value={$settings.output_size}>
      <p id="output-size-warning" class="text-warning" role="status">{$settings.output_size < 140 && (splitStampText($settings.top_str).length === 2 || splitStampText($settings.btm_str).length === 2) ? '△ 2行の氏名は140px以上で読みやすくなります' : ''}</p>
      <p id="output-help" class="hint">1〜4096pxの整数。画面の印影は100pxです。</p>
    </fieldset>
    <p id="image-error" class="date-error" role="alert">{imageError}</p>
    <button class="save" type="button" disabled={composing || busy || !ready || !!dateState.error || !!imageError} on:click={save}>保存</button>
    {#if storageMessage}
      <p class="storage-message" class:storage-warning={storageMessage.startsWith('△')}
        class:storage-success={storageMessage.startsWith('○')}
        role={storageMessage.startsWith('×') ? 'alert' : 'status'}>{storageMessage}</p>
    {/if}
    {#if (dirty || settingsUnsaved) && storageMessage !== '△ 未保存の変更があります'}
      <p class="storage-message storage-warning" role="status">△ 未保存の変更があります</p>
    {/if}
    <div class="storage-actions">
      <button type="button" disabled={busy} on:click={load}>再読込（編集中の値を置換）</button>
      {#if ready && legacyAvailable}
        <button type="button" disabled={busy} on:click={() => confirmingImport = true}>旧設定を取り込む</button>
        <p>実行ファイルと同じフォルダーの Setting.json が見つかりました。保存後も取り込めます。</p>
        {#if confirmingImport}
          <p role="alert">保存済みの設定と編集中の値を旧設定で置き換えます。取り込みますか？ 元の旧ファイルは残ります。</p>
          <button type="button" disabled={busy} on:click={importLegacy}>置き換えて取り込む</button>
          <button type="button" disabled={busy} on:click={() => confirmingImport = false}>キャンセル</button>
        {/if}
      {/if}
    </div>
  </section>
  <section class="about" aria-labelledby="about-heading">
    <h2 id="about-heading" tabindex="-1" bind:this={aboutHeading}>estampについて</h2>
    <p>バージョン {version}</p>
    <p>画像の日付印を作るアプリ</p>
    <p>発行元：Banto Works</p>
    <Licenses />
  </section>
  </div>
</div>

<style>
  .main.compact-caption { height: 100px; }
  .unsaved-settings, .settings-hint { padding: 0 8px; text-align: center; line-height: 15px; }
  .settings-hint { color: #5F6470; }
  .first-settings { margin: 8px 0; }
  .text-warning { color: #8A5700; }
  .text-warning:empty { display: none; }
  /* Preserve the seal-only startup area, including its existing 5px top gap. */
  .main {
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    margin-top: 5px;
    width: 250px;
    max-width: 100%;
    height: 110px;
  }
  .stamp-copy {
    padding: 0;
    border: 0;
    background: transparent;
    border-radius: 8px;
    min-width: 100px;
    min-height: 100px;
  }
  .stamp-copy :global(svg) { display: block; }
  .stamp-box { position: relative; width: 100px; height: 100px; }
  .stamp-feedback {
    position: absolute;
    left: 0;
    width: 100%;
    color: var(--error);
    font-size: 14px;
    line-height: 20px;
    pointer-events: none;
  }
  /* Keep empty live regions mounted and exposed to assistive technology. */
  .feedback-visible {
    padding: 4px;
    border: 1px solid currentColor;
    border-radius: 4px;
    background: var(--background);
  }
  .copy-feedback { bottom: 0; }
  .startup-issue { top: 0; white-space: pre-line; }
  .app-viewport {
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .settings-panel, .about { padding: 16px; min-width: 0; }
  h1, h2 { color: var(--primary); font-size: 16px; margin: 0 0 16px; }
  .menu { display: grid; gap: 8px; border: 0; padding: 0; margin: 0; min-width: 0; }
  legend { font-weight: 700; margin-bottom: 8px; padding: 0; }
  label { margin-top: 8px; }
  input, select { width: 100%; min-width: 0; }
  p { margin: 0; }
  .hint { color: var(--muted); }
  .date-error {
    color: var(--error);
    width: 100%;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .date-error:empty { display: none; }
  .save { background: var(--primary); color: #fff; width: 100%; margin-top: 16px; }
  .storage-message { color: var(--error); padding: 8px; margin: 0; }
  .storage-success { color: var(--success); }
  .storage-warning { color: var(--warning); }
  .storage-actions { display: grid; gap: 8px; margin-top: 16px; min-width: 0; }
  .retry { padding: 8px; }
  .about { border-top: 1px solid var(--border); }
  .about > p { margin-bottom: 8px; }
</style>
