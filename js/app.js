import { parseSRT } from "./srt.js";

const $ = id => document.getElementById(id);
const state = { media: [], audioUrl: null, audioName: "", textLines: [], textName: "", srtName: "", cues: [], ratio: "16:9", selected: null, zoom: 1 };
const audio = $("voiceAudio");
const canvas = $("previewCanvas");
const ctx = canvas.getContext("2d");
let toastTimer;
let previewVideo = null;
let previewFrameRequest = 0;
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
  renderMedia(); renderTracks(); if(state.media.length) { if(state.selected===null) state.selected=0; drawCurrent(); }
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
function selectClip(index){state.selected=index;const item=state.media[index];$("inspectorEmpty").hidden=true;$("inspectorInfo").hidden=false;$("inspectorInfo").innerHTML=`<div style="padding:18px"><strong style="font-size:12px">${escapeHTML(item.name)}</strong><p style="color:#858b9a;font-size:10px;margin-top:9px">${item.kind==="image"?"Imagen":"Vídeo"} · Escena ${index+1}</p><label style="display:block;color:#aeb3c0;font-size:10px;margin-top:18px">Duración (segundos)<input id="clipDuration" type="number" min="0.5" max="600" step="0.5" value="${item.duration}" style="display:block;width:100%;margin-top:7px;padding:8px;background:#101116;color:white;border:1px solid #383d49;border-radius:5px"></label><button id="applyDuration" class="btn btn-outline full">Aplicar duración</button></div>`; $("applyDuration").onclick=()=>{const v=Number($("clipDuration").value);if(v>=.5&&v<=600){item.duration=v;renderTracks();toast("Duración actualizada.");}};drawCurrent();}
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function getPreviewVideo() {
  if (!previewVideo) {
    previewVideo=document.createElement("video");
    previewVideo.id="activePreviewVideo";
    previewVideo.muted=true;
    previewVideo.playsInline=true;
    previewVideo.preload="auto";
    previewVideo.style.display="none";
    document.body.append(previewVideo);
    previewVideo.addEventListener("loadeddata",()=>{ if(state.media.length) drawCover(previewVideo); });
  }
  return previewVideo;
}
function paintVideoFrame() {
  if(previewVideo && previewVideo.readyState>=2) drawCover(previewVideo);
  if(previewVideo && !previewVideo.paused && !previewVideo.ended) previewFrameRequest=requestAnimationFrame(paintVideoFrame);
}
async function drawCurrent() {
  const t=audio.src ? (audio.currentTime||0) : 0;
  $("currentTime").textContent=formatTime(t);
  $("durationTime").textContent=formatTime(duration());
  if(!state.media.length)return;
  let index=0, cursor=0, localTime=0;
  if(!audio.src && state.selected!==null) index=state.selected;
  else if(state.cues.length) {
    let cueIndex=state.cues.findIndex(c=>t>=c.start&&t<c.end);
    if(cueIndex<0) cueIndex=state.cues.filter(c=>c.start<=t).length;
    index=Math.min(state.media.length-1,Math.max(0,cueIndex));
    const cue=state.cues[index];
    localTime=cue ? Math.max(0,t-cue.start) : 0;
  } else {
    for(let i=0;i<state.media.length;i++) {
      const d=state.media[i].duration||5;
      if(t<cursor+d){index=i;localTime=t-cursor;break;}
      cursor+=d;index=Math.min(i+1,state.media.length-1);
    }
  }
  const item=state.media[index];if(!item)return;
  try {
    ctx.fillStyle="#050507";ctx.fillRect(0,0,canvas.width,canvas.height);
    if(item.kind==="image") {
      if(previewVideo) previewVideo.pause();
      const img=await loadImage(item.url);drawCover(img);
    } else {
      const vid=getPreviewVideo();
      if(vid.dataset.url!==item.url) {
        vid.pause();vid.src=item.url;vid.dataset.url=item.url;vid.load();
        await new Promise(resolve=>{
          if(vid.readyState>=2) return resolve();
          const done=()=>{vid.removeEventListener("loadeddata",done);vid.removeEventListener("error",done);resolve();};
          vid.addEventListener("loadeddata",done,{once:true});vid.addEventListener("error",done,{once:true});
        });
      }
      if(Number.isFinite(vid.duration) && vid.duration>0) {
        const target=Math.min(localTime,Math.max(0,vid.duration-.05));
        if(Math.abs(vid.currentTime-target)>.35) {
          try { vid.currentTime=target; } catch {}
        }
      }
      if(audio.src && !audio.paused) {
        await vid.play().catch(()=>{});
        cancelAnimationFrame(previewFrameRequest);paintVideoFrame();
      } else {
        vid.pause();
        if(vid.readyState>=2) drawCover(vid);
      }
    }
  } catch(e) { console.warn("No se pudo mostrar el medio",e); toast("No se pudo reproducir este archivo de vídeo."); }
}
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
function drawCover(source){const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;const scale=Math.max(canvas.width/sw,canvas.height/sh);const w=sw*scale,h=sh*scale;ctx.drawImage(source,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}
function handleAudio(file){if(!file)return;if(!file.type.startsWith("audio/")&&!/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)){toast("Selecciona un archivo de audio compatible.");return;}if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=URL.createObjectURL(file);state.audioName=file.name;audio.src=state.audioUrl;$("audioName").textContent=file.name;audio.load();renderTracks();toast("Narración cargada.");}
// Los controles conservan el diseño original y abren selectores nativos.
$("mediaBtn").addEventListener("click",()=> $("mediaInput").click());
$("filesBtn").addEventListener("click",()=> $("mediaInput").click());
$("folderBtn").addEventListener("click",()=>{const input=$("mediaInput");input.setAttribute("webkitdirectory","");input.click();});
$("mediaInput").addEventListener("change",e=>{importMedia(e.target.files);e.target.value="";e.target.removeAttribute("webkitdirectory");});
$("audioBtn").addEventListener("click",()=> $("audioInput").click());
$("audioInput").addEventListener("change",e=>{handleAudio(e.target.files[0]);e.target.value="";});
$("txtInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;state.textLines=(await f.text()).split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);$("syncStatus").textContent=`${state.textLines.length} líneas de escenas cargadas.`;toast("Texto de escenas cargado.");e.target.value="";});
$("srtInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;state.cues=parseSRT(await f.text());$("syncStatus").textContent=`${state.cues.length} subtítulos detectados${state.textLines.length?" · TXT cargado":""}.`;renderTracks();toast(state.cues.length?"Subtítulos SRT cargados.":"No se encontraron subtítulos válidos.");e.target.value="";});
for(const id of ["mediaBtn","audioBtn"]){const el=$(id);el.addEventListener("dragover",e=>{e.preventDefault();el.classList.add("dragover");});el.addEventListener("dragleave",()=>el.classList.remove("dragover"));el.addEventListener("drop",e=>{e.preventDefault();el.classList.remove("dragover");if(id==="mediaBtn")importMedia(e.dataTransfer.files);else handleAudio(e.dataTransfer.files[0]);});}
$("playBtn").onclick=async()=>{
  if(audio.src) {
    if(audio.paused) { await audio.play(); $("playBtn").textContent="Ⅱ"; drawCurrent(); }
    else { audio.pause(); if(previewVideo)previewVideo.pause(); $("playBtn").textContent="▶"; }
    return;
  }
  const item=state.media[state.selected??0];
  if(!item){toast("Importa primero un vídeo o una imagen.");return;}
  if(item.kind!=="video"){toast("Selecciona un clip de vídeo para reproducirlo.");return;}
  const vid=getPreviewVideo();
  if(vid.dataset.url!==item.url){vid.src=item.url;vid.dataset.url=item.url;vid.load();}
  try {
    if(vid.paused){await vid.play();$("playBtn").textContent="Ⅱ";cancelAnimationFrame(previewFrameRequest);paintVideoFrame();}
    else {vid.pause();$("playBtn").textContent="▶";}
  } catch {toast("El navegador no pudo reproducir este vídeo.");}
};
$("stopBtn").onclick=()=>{audio.pause();if(previewVideo){previewVideo.pause();try{previewVideo.currentTime=0;}catch{}}audio.currentTime=0;$("playBtn").textContent="▶";drawCurrent();};
$("toStart").onclick=()=>{if(audio.src)audio.currentTime=0;if(previewVideo){previewVideo.pause();try{previewVideo.currentTime=0;}catch{}}$("playBtn").textContent="▶";drawCurrent();};
audio.addEventListener("timeupdate",drawCurrent);
audio.addEventListener("play",()=>{$("playBtn").textContent="Ⅱ";});
audio.addEventListener("pause",()=>{if(!previewVideo||previewVideo.paused)$("playBtn").textContent="▶";});
audio.addEventListener("ended",()=>{$("playBtn").textContent="▶";if(previewVideo)previewVideo.pause();});
audio.addEventListener("loadedmetadata",()=>{$("durationTime").textContent=formatTime(duration());});
document.querySelectorAll(".format").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".format").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.ratio=btn.dataset.ratio;const vertical=state.ratio==="9:16";$("previewFrame").classList.toggle("vertical",vertical);canvas.width=vertical?720:1280;canvas.height=vertical?1280:720;$("previewResolution").textContent=vertical?"9:16 · 1080 × 1920":"16:9 · 1920 × 1080";drawCurrent();});
$("zoomIn").onclick=()=>{state.zoom=Math.min(2,state.zoom+.1);$("zoomValue").textContent=Math.round(state.zoom*100)+"%";$("videoTrack").style.transformOrigin="left";$("videoTrack").style.transform=`scaleX(${state.zoom})`;};
$("zoomOut").onclick=()=>{state.zoom=Math.max(.5,state.zoom-.1);$("zoomValue").textContent=Math.round(state.zoom*100)+"%";$("videoTrack").style.transform=`scaleX(${state.zoom})`;};
$("newProject").onclick=()=>{if(!confirm("¿Crear un proyecto nuevo? Se quitarán los medios cargados de esta sesión."))return;if(previewVideo){previewVideo.pause();previewVideo.removeAttribute("src");previewVideo.load();}state.selected=null;state.media.forEach(x=>URL.revokeObjectURL(x.url));state.media=[];state.cues=[];state.textLines=[];state.textName="";state.srtName="";state.audioName="";if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;audio.removeAttribute("src");audio.load();$("audioName").textContent="Aún no hay audio.";$("syncStatus").textContent="Sin archivos de sincronización.";$("inspectorEmpty").hidden=false;$("inspectorInfo").hidden=true;renderMedia();renderTracks();toast("Editor listo. Puedes importar tus archivos.");drawCurrent();};
$("exportBtn").onclick=()=>toast("La exportación MP4 se habilitará en la siguiente etapa. Por ahora puedes importar y sincronizar medios y revisar la vista previa.");
renderMedia();renderTracks();