import { parseSRT } from "./srt.js";

const $ = id => document.getElementById(id);
const state = { media: [], audioUrl: null, audioName: "", textLines: [], cues: [], ratio: "16:9", selected: null, zoom: 1 };
const audio = $("voiceAudio");
const canvas = $("previewCanvas");
const ctx = canvas.getContext("2d");
let toastTimer;
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
function formatTime(seconds) { const s=Math.max(0,seconds||0); const m=Math.floor(s/60); const sec=Math.floor(s%60); const cs=Math.floor((s%1)*100); return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${String(cs).padStart(2,"0")}`; }
function duration() { return audio.duration && Number.isFinite(audio.duration) ? audio.duration : state.cues.at(-1)?.end || state.media.length*5; }
function importMedia(files) {
  const selected=[...files];
  const accepted=selected.filter(f=>f.type.startsWith("image/")||f.type.startsWith("video/"));
  for(const file of accepted) {
    const url=URL.createObjectURL(file);
    state.media.push({file,url,name:file.name,type:file.type,kind:file.type.startsWith("video/")?"video":"image",duration:5});
  }
  renderMedia(); renderTracks(); if(state.media.length) $("emptyPreview").hidden=true;
  if(accepted.length) toast(`${accepted.length} archivo(s) importado(s).`);
  else if(selected.length) toast("No se reconocieron imágenes ni vídeos compatibles.");
}
function renderMedia() {
  const images=state.media.filter(x=>x.kind==="image").length, videos=state.media.length-images;
  $("mediaCount").textContent=state.media.length ? `${state.media.length} escenas cargadas (${images} imágenes, ${videos} clips)` : "Aún no hay medios.";
  $("timelineSummary").textContent=`${state.media.length} escenas`;
}
function renderTracks() {
  const video=$("videoTrack"); video.innerHTML="";
  if(!state.media.length) video.innerHTML='<div class="track-empty">Importa medios para crear tu secuencia</div>';
  state.media.forEach((item,i)=>{const el=document.createElement("div");el.className="clip";el.textContent=item.name;el.title=item.name;el.style.flexGrow=String(Math.max(1,item.duration));el.addEventListener("click",()=>selectClip(i));video.append(el);});
  const at=$("audioTrack");at.innerHTML=state.audioName?'<div class="clip audio"></div>':'<div class="track-empty">Tu narración aparecerá aquí</div>';
  const st=$("subtitleTrack");st.innerHTML="";
  if(!state.cues.length) st.innerHTML='<div class="track-empty">Los subtítulos aparecerán aquí</div>';
  else state.cues.slice(0,80).forEach(c=>{const el=document.createElement("div");el.className="clip subtitle";el.textContent=c.text;el.title=`${formatTime(c.start)} · ${c.text}`;el.style.flexGrow=String(Math.max(.3,c.end-c.start));st.append(el);});
}
function selectClip(index){state.selected=index;const item=state.media[index];$("inspectorEmpty").hidden=true;$("inspectorInfo").hidden=false;$("inspectorInfo").innerHTML=`<div style="padding:18px"><strong style="font-size:12px">${escapeHTML(item.name)}</strong><p style="color:#858b9a;font-size:10px;margin-top:9px">${item.kind==="image"?"Imagen":"Vídeo"} · Escena ${index+1}</p><label style="display:block;color:#aeb3c0;font-size:10px;margin-top:18px">Duración (segundos)<input id="clipDuration" type="number" min="0.5" max="600" step="0.5" value="${item.duration}" style="display:block;width:100%;margin-top:7px;padding:8px;background:#101116;color:white;border:1px solid #383d49;border-radius:5px"></label><button id="applyDuration" class="btn btn-outline full">Aplicar duración</button></div>`; $("applyDuration").onclick=()=>{const v=Number($("clipDuration").value);if(v>=.5&&v<=600){item.duration=v;renderTracks();toast("Duración actualizada.");}};}
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function drawCurrent() {
  const t=audio.currentTime||0;
  $("currentTime").textContent=formatTime(t);$("durationTime").textContent=formatTime(duration());
  if(!state.media.length)return;
  let index=0, cursor=0;
  if(state.cues.length){const cue=state.cues.find(c=>t>=c.start&&t<c.end);if(cue){index=Math.min(state.media.length-1,Math.max(0,state.cues.indexOf(cue)));}else{index=Math.min(state.media.length-1,state.cues.filter(c=>c.start<=t).length);}}
  else {for(let i=0;i<state.media.length;i++){const d=state.media[i].duration;if(t<cursor+d){index=i;break;}cursor+=d;index=Math.min(i+1,state.media.length-1);}}
  const item=state.media[index];if(!item)return;
  try {
    ctx.fillStyle="#050507";ctx.fillRect(0,0,canvas.width,canvas.height);
    if(item.kind==="image"){const img=await loadImage(item.url);drawCover(img);}
    else {let vid=document.querySelector("#activePreviewVideo");if(!vid){vid=document.createElement("video");vid.id="activePreviewVideo";vid.muted=true;vid.playsInline=true;vid.preload="auto";vid.style.display="none";document.body.append(vid);}if(vid.dataset.url!==item.url){vid.pause();vid.src=item.url;vid.dataset.url=item.url;vid.load();}const localTime=state.cues.length?Math.max(0,t-(state.cues[index]?.start||0)):Math.max(0,t-cursor);if(Math.abs(vid.currentTime-localTime)>.4)vid.currentTime=Math.min(localTime,Math.max(0,(vid.duration||1)-.05));if(!audio.paused)await vid.play().catch(()=>{});else vid.pause();if(vid.readyState>=2)drawCover(vid);}
    }
  }catch(e){console.warn("No se pudo dibujar el medio",e);}
}
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
function drawCover(source){const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;const scale=Math.max(canvas.width/sw,canvas.height/sh);const w=sw*scale,h=sh*scale;ctx.drawImage(source,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}
function handleAudio(file){if(!file)return;if(!file.type.startsWith("audio/")&&!/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)){toast("Selecciona un archivo de audio compatible.");return;}if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=URL.createObjectURL(file);state.audioName=file.name;audio.src=state.audioUrl;$("audioName").textContent=file.name;audio.load();renderTracks();toast("Narración cargada.");}
$("mediaInput").addEventListener("change",e=>{importMedia(e.target.files);e.target.value="";});
$("mediaDrop").addEventListener("click",e=>{if(e.target!==$("mediaInput"))$("mediaInput").click();});
$("mediaDrop").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("mediaInput").click();}});
$("filesBtn").onclick=()=>$("mediaInput").click();
$("folderBtn").onclick=()=>{const input=$("mediaInput");input.setAttribute("webkitdirectory","");input.click();input.addEventListener("change",()=>input.removeAttribute("webkitdirectory"),{once:true});};
$("audioInput").addEventListener("change",e=>{handleAudio(e.target.files[0]);e.target.value="";});
$("audioDrop").addEventListener("click",e=>{if(e.target!==$("audioInput"))$("audioInput").click();});
$("audioDrop").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("audioInput").click();}});
$("txtInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;state.textLines=(await f.text()).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);$("syncStatus").textContent=`${state.textLines.length} líneas de escenas cargadas.`;toast("Texto de escenas cargado.");});
$("srtInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;state.cues=parseSRT(await f.text());$("syncStatus").textContent=`${state.cues.length} subtítulos detectados${state.textLines.length?" · TXT cargado":""}.`;renderTracks();toast(state.cues.length?"Subtítulos SRT cargados.":"No se encontraron subtítulos válidos.");});
for(const id of ["mediaDrop","audioDrop"]){const el=$(id);el.addEventListener("dragover",e=>{e.preventDefault();el.classList.add("dragover");});el.addEventListener("dragleave",()=>el.classList.remove("dragover"));el.addEventListener("drop",e=>{e.preventDefault();el.classList.remove("dragover");if(id==="mediaDrop")importMedia(e.dataTransfer.files);else handleAudio(e.dataTransfer.files[0]);});}
$("playBtn").onclick=async()=>{if(!audio.src){toast("Importa primero una narración de audio.");return;}if(audio.paused){await audio.play();$("playBtn").textContent="Ⅱ";}else{audio.pause();$("playBtn").textContent="▶";}drawCurrent();};
$("stopBtn").onclick=()=>{audio.pause();audio.currentTime=0;$("playBtn").textContent="▶";drawCurrent();};
$("toStart").onclick=()=>{audio.currentTime=0;drawCurrent();};
audio.addEventListener("timeupdate",drawCurrent);audio.addEventListener("ended",()=>$("playBtn").textContent="▶");audio.addEventListener("loadedmetadata",()=>{$("durationTime").textContent=formatTime(duration());});
document.querySelectorAll(".format").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".format").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.ratio=btn.dataset.ratio;const vertical=state.ratio==="9:16";$("previewFrame").classList.toggle("vertical",vertical);canvas.width=vertical?720:1280;canvas.height=vertical?1280:720;$("previewResolution").textContent=vertical?"9:16 · 1080 × 1920":"16:9 · 1920 × 1080";drawCurrent();});
$("zoomIn").onclick=()=>{state.zoom=Math.min(2,state.zoom+.1);$("zoomValue").textContent=Math.round(state.zoom*100)+"%";$("videoTrack").style.transformOrigin="left";$("videoTrack").style.transform=`scaleX(${state.zoom})`;};
$("zoomOut").onclick=()=>{state.zoom=Math.max(.5,state.zoom-.1);$("zoomValue").textContent=Math.round(state.zoom*100)+"%";$("videoTrack").style.transform=`scaleX(${state.zoom})`;};
$("newProject").onclick=()=>{if(!confirm("¿Crear un proyecto nuevo? Se quitarán los medios cargados de esta sesión."))return;state.media.forEach(x=>URL.revokeObjectURL(x.url));state.media=[];state.cues=[];state.textLines=[];state.audioName="";if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;audio.removeAttribute("src");audio.load();$("audioName").textContent="Aún no hay audio.";$("syncStatus").textContent="Sin archivos de sincronización.";$("emptyPreview").hidden=false;$("inspectorEmpty").hidden=false;$("inspectorInfo").hidden=true;renderMedia();renderTracks();drawCurrent();};
$("exportBtn").onclick=()=>toast("La exportación MP4 se habilitará en la siguiente etapa. Por ahora puedes importar y sincronizar medios y revisar la vista previa.");
renderMedia();renderTracks();