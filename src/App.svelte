<script lang="ts">
  import {Canvg} from 'canvg';
  import { settings,type LoadedSettings } from './store';
  import { onMount, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Image } from '@tauri-apps/api/image';
  import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
  import toast, { Toaster } from 'svelte-french-toast';
  import { describeDate, editDate, formatStampDate, refreshDate, restoreDate, todayState } from './date.js';
  import { saveSettings } from './save.js';

  let dateState = todayState();
  $: str_date = formatStampDate(dateState.date, $settings.date_format);
  // Canvas renderer and SVG both support transforms; keep the long era date inside the stamp.
  $: dateWidth = Array.from(str_date).reduce((width, char) => width + (/[^\x00-\x7F]/.test(char) ? 1 : 0.6), 0) * $settings.mid_font_size;
  $: dateTextScale = Math.min(1, 340 / dateWidth);
  const refreshToday = () => { dateState = refreshDate(dateState); };
  const inputDate = (event: Event) => {
    dateState = editDate(dateState, (event.currentTarget as HTMLInputElement).value);
  };

  let copying = false;
  let disposed = false;
  let busy = true;
  let ready = false;
  let revision: string | null = null;
  let storageMessage = '';
  let legacyAvailable = false;
  let confirmingImport = false;

  const applyLoaded = (result: LoadedSettings) => {
    $settings = result.settings;
    dateState = restoreDate(result.settings);
    revision = result.revision;
    storageMessage = result.warning ?? '';
    ready = true;
  };

  const save = async () => {
    if (busy || !ready || dateState.error) return;
    refreshToday();
    busy = true;
    try {
      // Save a snapshot; do not replace edits made while IPC is pending.
      revision = await saveSettings(settings, dateState, revision, args => invoke<string>("save", args));
      storageMessage = '';
      toast.success("保存しました", { position: "top-center" });
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
    void load();
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
    if (busy || !ready || copying || dateState.error) return;
    copying = true;
    try {
      refreshToday();
      await tick();
      if (dateState.error) {
        toast.error('印影が変更されたためコピーを中止しました。もう一度コピーしてください。', { position: 'bottom-center' });
        return;
      }
      const src = document.querySelector<SVGSVGElement>('#stamp');
      if (!src) throw new Error('印影が見つかりません');
      const expectedSvg = src.outerHTML;
      const outputSize = $settings.output_size;
      const svgText = expectedSvg.replace(/NS[0-9]+:href/g, 'xlink:href');
      const canvas = document.createElement('canvas');
      canvas.width = src.width.baseVal.value;
      canvas.height = src.height.baseVal.value;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('画像を作成できません');
      const v = Canvg.fromString(ctx, svgText);
      v.resize(outputSize, outputSize, 'xMidYMid meet');
      await v.render();
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const image = await Image.new(new Uint8Array(data), width, height);
      try {
        // Rendering and Image.new both yield. Flush date/format edits before writing.
        refreshToday();
        await tick();
        if (dateState.error || document.querySelector('#stamp')?.outerHTML !== expectedSvg
          || $settings.output_size !== outputSize) {
          toast.error('印影が変更されたためコピーを中止しました。もう一度コピーしてください。', { position: 'bottom-center' });
          return;
        }
        await writeImage(image);
      } finally {
        await image.close();
      }
      toast.success('copy!!', { position: 'bottom-center' });
    } catch (error) {
      console.error('画像コピーに失敗しました', error);
      toast.error('画像コピーに失敗しました', { position: 'bottom-center' });
    } finally {
      copying = false;
    }
  };
</script>
<Toaster />
<div class="app-viewport">
{#if storageMessage}
  <p class="storage-message" class:storage-warning={storageMessage.startsWith('△')} role="alert">{storageMessage}</p>
{/if}
<div class="main">
  <button aria-label="印影をコピー" disabled={busy || !ready || copying || !!dateState.error} on:click={()=>clipboardCopy()}>
  <svg id="stamp"  version="1.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 400 400">
 
  <circle stroke="#ff0000" cx="200" cy="200" r="192" fill-opacity="0" stroke-width="16"/>
  <line x1="20" y1="155" x2="380" y2="155" style="stroke:rgb(255,0,0);stroke-width:5" />
  <line x1="20" y1="245" x2="380" y2="245" style="stroke:rgb(255,0,0);stroke-width:5" />
  <text font-family='Shippori Mincho B1' font-weight='bold' font-size={$settings.top_font_size}   x=200 y=100 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {$settings.top_str}
  </text>
  <text transform={`translate(200 200) scale(${dateTextScale} 1)`} font-size={$settings.mid_font_size}  x=0 y=0 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {str_date}
  </text>
  <text font-family='Shippori Mincho B1' font-weight='bold' font-size={$settings.btm_font_size} x=200 y=300 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {$settings.btm_str}
  </text>
</svg>
</button>
</div>
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
        <input class="variant-glass-primary" style="width:6rem"  bind:value={$settings.top_str}>
      </td>
      <td>
        <input class="variant-glass-primary" type="number" style="width:4rem" bind:value={$settings.top_font_size}>
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
        <input class="variant-glass-primary" style="width:6rem"  bind:value={$settings.btm_str}>
      </td>
      <td>
        <input class="variant-glass-primary" type="number" style="width:4rem" bind:value={$settings.btm_font_size}>
      </td>
    </tr>
    <tr>
      <td style="width:4rem;text-align:center">
        サイズ
      </td>
      <td >
        <input type="number" class="variant-glass-primary" style="width:6rem"  bind:value={$settings.output_size}>
      </td>
      <td>
        px
      </td>
    </tr>
  </table>
</fieldset>
<div style="display:flex;justify-content:center;margin-top:5px">
    <button class="save" disabled={busy || !ready || !!dateState.error} on:click={save}>保存</button>
</div>
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

</div>

<style>
  /* @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1&display=swap');ß */
  @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@400;700&display=swap');

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
  button :hover{
    opacity: 0.8;
  }
  button :active{
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
    font-size: 12px;
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
  .storage-warning {
    color: #8A5700;
  }
  .storage-actions button {
    min-height: 32px;
    border-radius: 8px;
  }

</style>

