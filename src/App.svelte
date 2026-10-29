<script lang="ts">
  import { settings,type LoadedSettings } from './store';
  import { onMount, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Image } from '@tauri-apps/api/image';
  import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
  import toast, { Toaster } from 'svelte-french-toast';
  import { describeDate, editDate, formatStampDate, refreshDate, restoreDate, todayState } from './date.js';
  import { saveSettings, settingsSnapshot } from './save.js';
  import { loadStampFonts, loadUiFonts } from './fonts.js';
  import { buildStampSvg, renderStampImage, validateImageSettings } from './stampImage.js';
  import { markPerformance } from './performance.js';
  import Licenses from './Licenses.svelte';

  let dateState = todayState();
  $: str_date = formatStampDate(dateState.date, $settings.date_format);
  $: stampSvg = buildStampSvg($settings, str_date);
  $: imageError = (() => {
    try { validateImageSettings($settings); return ''; }
    catch (error) { return `× ${String(error)}`; }
  })();
  const refreshToday = () => { dateState = refreshDate(dateState); };
  const inputDate = (event: Event) => {
    dateState = editDate(dateState, (event.currentTarget as HTMLInputElement).value);
  };

  let copying = false;
  let copyMessage = '';
  let disposed = false;
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
  let fontsReady = false;
  let fontMessage = '';

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
    savedSnapshot = JSON.stringify(settingsSnapshot($settings, dateState));
    revision = result.revision;
    storageMessage = result.warning ?? '○ 設定を読み込みました';
    ready = true;
  };

  const save = async () => {
    if (busy || !ready || dateState.error || imageError) return;
    refreshToday();
    busy = true;
    try {
      const snapshot = JSON.stringify(settingsSnapshot($settings, dateState));
      // Save a snapshot; do not replace edits made while IPC is pending.
      revision = await saveSettings(settings, dateState, revision, args => invoke<string>("save", args));
      savedSnapshot = snapshot;
      dirty = !!dateState.error || JSON.stringify(settingsSnapshot($settings, dateState)) !== snapshot;
      storageMessage = dirty ? '△ 未保存の変更があります' : '○ 保存しました';
      if (!dirty) toast.success("保存しました", { position: "top-center" });
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
    busy = true;
    try {
      const result = await invoke<LoadedSettings>("load");
      if (disposed) return;
      applyLoaded(result);
    } catch (error) {
      if (disposed) return;
      ready = false;
      storageMessage = `× 設定を読み込めませんでした：${String(error)}`;
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
      toast.success("旧設定を取り込みました", { position: "top-center" });
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
    void load();
    void prepareFonts();
    const timer = window.setInterval(refreshToday, 1000);
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  });
  const clipboardCopy = async () => {
    if (busy || !ready || !fontsReady || copying || dateState.error || imageError) return;
    copying = true;
    copyMessage = '';
    try {
      refreshToday();
      await tick();
      const expectedSvg = buildStampSvg($settings, formatStampDate(dateState.date, $settings.date_format));
      const outputSize = $settings.output_size;
      const rendered = await renderStampImage(expectedSvg, outputSize);
      const image = await Image.new(rendered.rgba, rendered.width, rendered.height);
      try {
        refreshToday();
        await tick();
        if (disposed || busy || !ready || dateState.error || imageError
          || buildStampSvg($settings, formatStampDate(dateState.date, $settings.date_format)) !== expectedSvg
          || $settings.output_size !== outputSize) {
          copyMessage = '△ 印影が変更されたためコピーを中止しました。もう一度コピーしてください。';
          toast.error(copyMessage, { position: 'bottom-center' });
          return;
        }
        await writeImage(image);
        copyMessage = '○ 画像をコピーしました';
      } finally {
        await image.close();
      }
      toast.success('画像をコピーしました', { position: 'bottom-center' });
    } catch (error) {
      copyMessage = `× 画像コピーに失敗しました：${String(error)}`;
      toast.error(copyMessage, { position: 'bottom-center' });
    } finally {
      copying = false;
    }
  };
</script>
<Toaster />
<div class="app-viewport">
<div class="main">
  <button aria-label="印影をコピー" disabled={busy || !ready || !fontsReady || copying || !!dateState.error || !!imageError} on:click={()=>clipboardCopy()}>
  {#if fontsReady}
  {@html stampSvg}
  {:else}
    書体を読込中…
  {/if}
</button>
</div>
{#if storageMessage}
  <p class="storage-message" class:storage-warning={storageMessage.startsWith('△')} class:storage-success={storageMessage.startsWith('○')} role="alert">{storageMessage}</p>
{/if}
{#if copyMessage}
  <p class="storage-message" class:storage-success={copyMessage.startsWith('○')} role="status">{copyMessage}</p>
{/if}
{#if imageError}
  <p class="storage-message" role="alert">{imageError}</p>
{/if}
{#if fontMessage}
  <p class="storage-message" role="alert">{fontMessage}</p>
  <button on:click={prepareFonts}>書体を再読込</button>
{/if}
<fieldset class="menu" disabled={busy || !ready}>
  <table>
    <tr>
      <th>位置</th>
      <th>文字列</th>
      <th style="width:20px">サイズ</th>
    </tr>
    <tr>
      <td style="width:4rem;text-align:center">
        上段
      </td>
      <td >
        <input class="variant-glass-primary" style="width:6rem"  aria-label="上段の文字列" bind:value={$settings.top_str}>
      </td>
      <td>
        <input class="variant-glass-primary" type="number" style="width:4rem" aria-label="上段の文字サイズ" min="1" max="400" step="1" bind:value={$settings.top_font_size}>
      </td>
    </tr>
    <tr>
      <td style="width:4rem;text-align:center">
        日付
      </td>
      <td >
        <input id="date-input" aria-label="日付（西暦・和暦）" aria-invalid={!!dateState.error}
          aria-describedby="date-error date-confirmation" class="variant-glass-primary" style="width:6rem"
          value={dateState.input} on:input={inputDate} placeholder="R7.10.22">
      </td>
      <td>
        <input aria-label="日付の文字サイズ" class="variant-glass-primary" type="number" style="width:4rem" min="1" max="400" step="1" bind:value={$settings.mid_font_size}>
        <select aria-label="日付の表示形式" bind:value={$settings.date_format}>
          <option value="gregorian">西暦</option>
          <option value="wareki">和暦</option>
        </select>
      </td>
    </tr>
    <tr>
      <td colspan="3" class="date-detail">
        <p id="date-error" role="alert" class="date-error">{dateState.error ? `× ${dateState.error}` : ''}</p>
        <p id="date-confirmation">{describeDate(dateState.date)}</p>
        <span>{dateState.mode === 'auto' ? '自動' : '手動'}</span>
        <button type="button" on:click={() => { dateState = todayState(); }}>今日に戻す</button>
      </td>
    </tr>
    <tr>
      <td style="width:4rem;text-align:center">
        下段
      </td>
      <td >
        <input class="variant-glass-primary" style="width:6rem"  aria-label="下段の文字列" bind:value={$settings.btm_str}>
      </td>
      <td>
        <input class="variant-glass-primary" type="number" style="width:4rem" aria-label="下段の文字サイズ" min="1" max="400" step="1" bind:value={$settings.btm_font_size}>
      </td>
    </tr>
    <tr>
      <td style="width:4rem;text-align:center">
        サイズ
      </td>
      <td >
        <input type="number" class="variant-glass-primary" style="width:6rem"  aria-label="出力サイズ（px）" min="1" max="4096" step="1" bind:value={$settings.output_size}>
      </td>
      <td>
        px
      </td>
    </tr>
  </table>
</fieldset>
<div style="display:flex;justify-content:center;margin-top:5px">
    <button class="save" disabled={busy || !ready || !!dateState.error || !!imageError} on:click={save}>保存</button>
</div>
{#if dirty && (!storageMessage || storageMessage.startsWith('○'))}
  <p class="storage-message storage-warning" role="status">△ 未保存の変更があります</p>
{/if}
<div class="storage-actions">
  <button disabled={busy} on:click={load}>再読込（編集中の値を置換）</button>
  {#if ready && legacyAvailable}
    <button disabled={busy} on:click={() => confirmingImport = true}>旧設定を取り込む</button>
    <p>実行ファイルと同じフォルダーの Setting.json が見つかりました。保存後も取り込めます。</p>
    {#if confirmingImport}
      <p role="alert">保存済みの設定と編集中の値を旧設定で置き換えます。取り込みますか？ 元の旧ファイルは残ります。</p>
      <button disabled={busy} on:click={importLegacy}>置き換えて取り込む</button>
      <button disabled={busy} on:click={() => confirmingImport = false}>キャンセル</button>
    {/if}
  {/if}
</div>

<Licenses />
</div>

<style>
  input{
    border-radius: 8px;
    text-align: center;
    background-color:primary;
    border: 2px;
    
  }
  .save{
    background-color: rgb(147, 147, 250);
    width: 150px;
    height: 25px;
    border-radius: 8px;
    margin-top: 5px;
  }
  button{
    width: fit-content;
  }
  button:hover{
    opacity: 0.8;
  }
  button:active{
    opacity: 0.6;
  }
  .main{
    text-align: center;
    justify-items: center;
    justify-content: center;
    align-items: flex-start;
    display: flex;
    margin-top:5px;
    width: 240px;
    height: 125px;
  }
  .app-viewport {
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .date-detail {
    max-width: 240px;
    font-size: 14px;
  }
  .date-error {
    color: #B42318;
    width: 240px;
    white-space: nowrap;
    overflow-x: auto;
  }
  .date-detail button {
    margin-left: 8px;
  }
  .menu{
    border: 0;
    padding: 0;
    min-width: 15rem;
    margin-top:5px;
  }
  .storage-message {
    color: #B42318;
    background: #F7F6F2;
    padding: 8px;
    margin: 0;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .storage-actions {
    display: grid;
    gap: 4px;
    margin: 8px;
    font-size: 14px;
  }
  .storage-success {
    color: #18794E;
  }
  .storage-warning {
    color: #8A5700;
  }
  .storage-actions button {
    min-height: 32px;
    border-radius: 8px;
  }

</style>

