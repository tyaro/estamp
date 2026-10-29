<script lang="ts">
  import {Canvg} from 'canvg';
  import { settings,type Setting } from './store';
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Image } from '@tauri-apps/api/image';
  import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
  import toast, { Toaster } from 'svelte-french-toast';

  const save = async() => {
    let config = $settings
    let result = await invoke("save",{config});
    toast.success("save complete!!",{position:"top-center"})
    console.log(result)
  }

  const load = async () => {
    let result:Setting = await invoke("load",{})
    $settings = result
  }

  onMount(async ()=>{
    await load()
  })



  const clipboardCopy = async () => {
    try {
      const src = document.querySelector<SVGSVGElement>('#stamp');
      if (!src) throw new Error('印影が見つかりません');
      const svgText = src.outerHTML.replace(/NS[0-9]+:href/g, 'xlink:href');
      const canvas = document.createElement('canvas');
      canvas.width = src.width.baseVal.value;
      canvas.height = src.height.baseVal.value;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('画像を作成できません');
      const v = Canvg.fromString(ctx, svgText);
      v.resize($settings.output_size, $settings.output_size, 'xMidYMid meet');
      await v.render();
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const image = await Image.new(new Uint8Array(data), width, height);
      try {
        await writeImage(image);
      } finally {
        await image.close();
      }
      toast.success('copy!!', { position: 'bottom-center' });
    } catch (error) {
      console.error('画像コピーに失敗しました', error);
      toast.error('画像コピーに失敗しました', { position: 'bottom-center' });
    }
  };
  const today = new Date()
  let str_date:string = today.getFullYear() + "."
              + ("00"+String(today.getMonth()+1)).slice(-2) +"."
              + ("00"+today.getDate()).slice(-2);


</script>
<Toaster />
<div class="main">
  <button on:click={()=>clipboardCopy()}>
  <svg id="stamp"  version="1.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 400 400">
 
  <circle stroke="#ff0000" cx="200" cy="200" r="192" fill-opacity="0" stroke-width="16"/>
  <line x1="20" y1="155" x2="380" y2="155" style="stroke:rgb(255,0,0);stroke-width:5" />
  <line x1="20" y1="245" x2="380" y2="245" style="stroke:rgb(255,0,0);stroke-width:5" />
  <text font-family='Shippori Mincho B1' font-weight='bold' font-size={$settings.top_font_size}   x=200 y=100 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {$settings.top_str}
  </text>
  <text font-size={$settings.mid_font_size}  x=200 y=200 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {str_date}
  </text>
  <text font-family='Shippori Mincho B1' font-weight='bold' font-size={$settings.btm_font_size} x=200 y=300 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {$settings.btm_str}
  </text>
</svg>
</button>
</div>
<div class="menu">
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
        中
      </td>
      <td >
        <input class="variant-glass-primary" style="width:6rem"  bind:value={str_date}>
      </td>
      <td>
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
</div>
<div style="display:flex;justify-content:center;margin-top:5px">
    <button class="save" on:click={save}>保存</button>
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
  .menu{
    min-width: 15rem;
    margin-top:5px;
  }

</style>

