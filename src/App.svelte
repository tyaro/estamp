<script lang="ts">
  import {
      writeText,
      readText,
      readImage,
      writeImage,
  } from "tauri-plugin-clipboard-api";

  function base64Encode(...parts) {
    return new Promise(resolve => {
      const reader:any = new FileReader();
      reader.onload = () => {
        const offset = reader.result.indexOf(",") + 1;
        resolve(reader.result.slice(offset));
      };
      reader.readAsDataURL(new Blob(parts));
    });
  }

  

  const clipboardCopy = async () => {
    // const re = /class="s-XsEmFtvddWTw"/;
    // const svg = svgText.replace(re,"")
    let src = document.querySelector("svg")
    let canvas = document.createElement("canvas");
    canvas.width = src.width.baseVal.value;
    canvas.height = src.height.baseVal.value;
    const ctx = canvas.getContext('2d');
    const svgText = new XMLSerializer().serializeToString(src);
    const enc:any = await base64Encode(svgText)
    const imgsrc = "data:image/svg+xml;charset=utf-8;base64," + enc
    let img = new Image();
    img.onload = async () => {
      ctx.drawImage(img, 0, 0,img.width,img.height);
      document.getElementById("newimg").src = data;
    }
    img.src = "data:image/svg+xml;charset=utf-8;base64," + enc
    const data = canvas.toDataURL("image/png")
      // console.log(imgsrc)
      const b = await base64Encode(data)
      const result = await writeImage(b).catch((e:any)=>{console.log("error:",e)})
    // const b = await base64Encode(canvas.toBlob())
    // const result = await writeImage(b).catch((e)=>{console.log("error:",e)})
    // console.log(result)
    // console.log(img.src)
    // canvas.toBlob(async(blob)=>{
    //   const result = await writeImage(blob)
    //   // const item = new ClipboardItem({'image/png':blob})
    //   // await navigator.clipboard.write([item]).catch((e)=>console.log("error",e));
    //   console.log(result)
    // })
    
  };
  const today = new Date()
  let str_top = "部署名"
  let str_date:String = today.getFullYear + "." 
              + ("00"+today.getMonth+1).slice(-2) +"."
              + ("00"+today.getDay).slice(-2);
  let str_bottom = "名前"
</script>

<div id="estamp">
<svg id="stamp" version="1.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 400 400">
  <circle stroke="#ff0000" cx="200" cy="200" r="192" fill-opacity="0" stroke-width="16"/>
  <line x1="20" y1="155" x2="380" y2="155" style="stroke:rgb(255,0,0);stroke-width:5" />
  <line x1="20" y1="245" x2="380" y2="245" style="stroke:rgb(255,0,0);stroke-width:5" />
  <text font-family='Shippori Mincho B1' font-size="80"  font-weight="normal" x=200 y=100 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {str_top}
  </text>
  <text font-size="64"  x=200 y=200 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {str_date}
  </text>
  <text font-family='Shippori Mincho B1' font-size="96" x=200 y=300 fill="#ff0000" text-anchor="middle" dominant-baseline="central">
    {str_bottom}
  </text>
</svg>
</div>
<button on:click={()=>clipboardCopy()}>copy</button>
<div><img id="newimg" alt="hoge"></div>



<style>
  /* @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1&display=swap');ß */
  @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@400;700&display=swap');
</style>

