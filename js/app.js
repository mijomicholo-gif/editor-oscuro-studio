import { parseSRT } from "./srt.js";

const $ = id => document.getElementById(id);
const audio = $("voiceAudio");
const music = $("musicAudio");
const canvas = $("previewCanvas");
const ctx = canvas.getContext("2d");
const state = {
  media: [], audioFile:null, audioUrl:null, musicFile:null, musicUrl:null, textLines:[], textName:"",
  cues:[], srtName:"", ratio:"16:9", mode:"srt", selected:0,
  playing:false, raf:0, lastFrame:0, motion:"Sin movimiento",
  quality:"Full HD · 1080p", subtitleStyle:"Karaoke profesional",
  highlight:"#ffd84a", durations:[], transition:"none", transitionDuration:.8, exporting:false
};
let previewVideo=null, toastTimer=null, drawToken=0;

function toast(message){
  const el=$("toast"); if(!el)return;
  el.textContent=message;el.classList.add("show");
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3000);
}
function fmt(value){
  const s=Math.max(0,Number(value)||0),m=Math.floor(s/60),sec=Math.floor(s%60),cs=Math.floor(s%1*100);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
}
function normalizeWords(text){
  return String(text||"").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]+/g)||[];
}
function getExactSync(){
  if(!state.media.length)return {ok:false,error:"Importa primero las imágenes en el orden correcto."};
  if(!state.textLines.length||!state.cues.length)return {ok:false,error:"Carga el TXT y el SRT para sincronizar las escenas."};
  if(state.textLines.length!==state.media.length)return {ok:false,error:"El TXT tiene "+state.textLines.length+" líneas y hay "+state.media.length+" escenas. Debe existir una línea por escena."};
  const tokens=[];
  state.cues.forEach(cue=>normalizeWords(cue.text).forEach(word=>tokens.push({word,start:cue.start,end:cue.end})));
  if(!tokens.length)return {ok:false,error:"El SRT no contiene palabras válidas."};
  const timings=[];let cursor=0;
  for(let scene=0;scene<state.textLines.length;scene++){
    const wanted=normalizeWords(state.textLines[scene]);
    if(!wanted.length)return {ok:false,error:"La línea "+(scene+1)+" del TXT no contiene palabras reconocibles."};
    let found=-1;
    search:for(let i=cursor;i<=tokens.length-wanted.length;i++){
      for(let j=0;j<wanted.length;j++)if(tokens[i+j].word!==wanted[j])continue search;
      found=i;break;
    }
    if(found<0)return {ok:false,error:"No se encontró la escena "+(scene+1)+" del TXT dentro del SRT. Revisa que ambos archivos contengan el mismo texto y orden. No se aplicó una sincronización aproximada."};
    const first=tokens[found],last=tokens[found+wanted.length-1];
    if(!(Number.isFinite(first.start)&&Number.isFinite(last.end)&&last.end>first.start))return {ok:false,error:"Los tiempos de la escena "+(scene+1)+" no son válidos en el SRT."};
    if(timings.length&&first.start<timings[timings.length-1].end)return {ok:false,error:"El SRT no separa temporalmente las escenas "+scene+" y "+(scene+1)+". Divide el subtítulo en el punto de cambio de imagen para evitar inventar un tiempo."};
    timings.push({start:first.start,end:last.end});cursor=found+wanted.length;
  }
  return {ok:true,timings};
}
function buildSceneTimings(){
  if(!state.media.length)return [];
  if(state.mode==="srt"){const result=getExactSync();return result.ok?result.timings:[];}
  if(state.mode==="auto"&&state.textLines.length){
    if(state.textLines.length!==state.media.length||!Number.isFinite(audio.duration)||audio.duration<=0)return [];
    const weights=state.textLines.map(line=>Math.max(1,normalizeWords(line).length));
    const total=weights.reduce((x,y)=>x+y,0);let used=0;
    return state.media.map((_,i)=>{const start=audio.duration*used/total;used+=weights[i];return {start,end:audio.duration*used/total};});
  }
  let cursor=0;return state.media.map((_,i)=>{const start=cursor;cursor+=state.durations[i]||5;return {start,end:cursor};});
}
function totalDuration(){
  if(state.mode==="srt"&&state.cues.length)return Math.max(audio.duration||0,state.cues[state.cues.length-1].end);
  if(state.mode==="auto"&&audio.duration)return audio.duration;
  return state.durations.reduce((a,b)=>a+b,0);
}
function sceneAt(time){
  const timings=buildSceneTimings();
  if(state.mode==="srt"){
    if(!timings.length)return 0;
    for(let i=0;i<timings.length;i++)if(time>=timings[i].start&&time<timings[i].end)return i;
    if(time<timings[0].start)return 0;
    for(let i=0;i<timings.length-1;i++)if(time>=timings[i].end&&time<timings[i+1].start)return i;
    return timings.length-1;
  }
  let cursor=0;for(let i=0;i<state.durations.length;i++){if(time<cursor+state.durations[i])return i;cursor+=state.durations[i];}
  return Math.max(0,state.media.length-1);
}
function sceneStart(index){
  if(state.mode==="srt"){const timing=buildSceneTimings()[index];return timing?timing.start:0;}
  return state.durations.slice(0,index).reduce((a,b)=>a+b,0);
}
function sceneDuration(index){
  if(state.mode==="srt"){const timing=buildSceneTimings()[index];return timing?Math.max(.05,timing.end-timing.start):.5;}
  return state.durations[index]||5;
}
function loadImg(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
function activeVideo(){
  if(!previewVideo){previewVideo=document.createElement("video");previewVideo.muted=true;previewVideo.playsInline=true;previewVideo.preload="auto";previewVideo.style.display="none";document.body.append(previewVideo);}
  return previewVideo;
}
function drawCover(source, progress=0, motion=state.motion, clear=true, alpha=1, offsetX=0, zoomExtra=1){
  const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
  if(!sw||!sh)return;
  if(clear){ctx.fillStyle="#05070b";ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.save();ctx.globalAlpha=alpha;
  let factor=zoomExtra,x=offsetX,y=0;
  if(motion==="Zoom lento de acercamiento")factor=1+progress*.12;
  if(motion==="Zoom lento de alejamiento")factor=1.12-progress*.12;
  if(motion==="Movimiento cinematográfico")factor=1.06+progress*.08;
  if(motion==="Desplazamiento hacia la izquierda"){factor=1.14;x=(.5-progress)*canvas.width*.12;}
  if(motion==="Desplazamiento hacia la derecha"){factor=1.14;x=(progress-.5)*canvas.width*.12;}
  if(motion==="Desplazamiento hacia arriba"){factor=1.14;y=(.5-progress)*canvas.height*.12;}
  if(motion==="Desplazamiento hacia abajo"){factor=1.14;y=(progress-.5)*canvas.height*.12;}
  const scale=Math.max(canvas.width/sw,canvas.height/sh)*factor,w=sw*scale,h=sh*scale;
  ctx.drawImage(source,(canvas.width-w)/2+x,(canvas.height-h)/2+y,w,h);ctx.restore();
}
function drawSubtitle(time){
  if(!$("includeSubtitles").checked)return;
  const cue=state.cues.find(c=>time>=c.start&&time<c.end);if(!cue)return;
  const words=cue.text.trim().split(/\s+/),elapsed=Math.max(0,time-cue.start),duration=Math.max(.001,cue.end-cue.start);
  const weights=words.map(w=>Math.max(1,w.length)),target=elapsed/duration*weights.reduce((a,b)=>a+b,0);
  let sum=0,active=words.length-1;for(let i=0;i<weights.length;i++){sum+=weights[i];if(target<sum){active=i;break;}}
  const style=state.subtitleStyle,scale=style==="Impacto"?1.2:style==="Compacto"?.78:style==="Minimalista"?.88:1;
  const size=Math.max(22,canvas.width*.027*scale),lineH=size*1.25,maxW=canvas.width*.84;
  ctx.save();ctx.font=`700 ${size}px Arial`;ctx.textBaseline="middle";ctx.lineJoin="round";ctx.lineWidth=style==="Contorno reforzado"?size*.2:size*.09;ctx.strokeStyle="#000";ctx.shadowColor="#000";ctx.shadowBlur=4;
  const lines=[];let line=[],width=0,space=ctx.measureText(" ").width;
  for(const word of words){const ww=ctx.measureText(word).width;if(line.length&&width+space+ww>maxW){lines.push(line);line=[word];width=ww;}else{line.push(word);width+= (line.length>1?space:0)+ww;}}
  if(line.length)lines.push(line);
  let wi=0;const y0=canvas.height-canvas.height*.08-(lines.length-1)*lineH;
  lines.forEach((wordsInLine,li)=>{const tw=wordsInLine.reduce((a,w)=>a+ctx.measureText(w).width,0)+space*(wordsInLine.length-1);let x=(canvas.width-tw)/2;
    wordsInLine.forEach((word,j)=>{ctx.strokeText(word,x,y0+li*lineH);ctx.fillStyle=wi===active?state.highlight:"#fff";ctx.fillText(word,x,y0+li*lineH);x+=ctx.measureText(word).width+(j<wordsInLine.length-1?space:0);wi++;});
  });ctx.restore();
}
async function render(time=audio.currentTime||0){
  if(!state.media.length)return;
  const token=++drawToken,index=sceneAt(time),item=state.media[index];state.selected=index;
  const start=sceneStart(index);
  const span=sceneDuration(index);
  const progress=Math.max(0,Math.min(1,(time-start)/span));
  try{
    if(item.kind==="image"){
      if(previewVideo){previewVideo.pause();previewVideo.removeAttribute("src");}
      const img=await loadImg(item.url);if(token!==drawToken)return;
      const transitionSeconds=Math.min(state.transitionDuration,span*.45);
      const transitionProgress=transitionSeconds>0?Math.max(0,Math.min(1,(time-start)/transitionSeconds)):1;
      const previous=state.media[index-1];
      if(index>0&&previous?.kind==="image"&&state.transition!=="none"&&transitionProgress<1){
        const prevImg=await loadImg(previous.url);if(token!==drawToken)return;
        drawCover(prevImg,1,state.motion,true,1);
        if(state.transition==="slide")drawCover(img,progress,state.motion,false,1,canvas.width*(1-transitionProgress),1);
        else if(state.transition==="zoom")drawCover(img,progress,state.motion,false,transitionProgress,0,1.18-.18*transitionProgress);
        else drawCover(img,progress,state.motion,false,transitionProgress);
      }else drawCover(img,progress);
      drawSubtitle(time);
    }else{
      const v=activeVideo();
      if(v.dataset.url!==item.url){v.pause();v.src=item.url;v.dataset.url=item.url;v.load();await new Promise(resolve=>{if(v.readyState>=2)return resolve();v.addEventListener("loadeddata",resolve,{once:true});v.addEventListener("error",resolve,{once:true});});}
      if(token!==drawToken)return;
      if(Number.isFinite(v.duration)&&v.duration>0){const target=Math.min(Math.max(0,time-start),v.duration-.04);if(Math.abs(v.currentTime-target)>.35&&!state.playing)v.currentTime=target;}
      if(state.playing){if(v.paused)await v.play().catch(()=>{});drawCover(v,progress);drawSubtitle(time);}
      else{v.pause();if(v.readyState>=2)drawCover(v,progress);drawSubtitle(time);}
    }
  }catch(e){console.warn(e);}
  updateClock(time);
}
function updateClock(time){
  const total=totalDuration(),safeTime=Math.max(0,Math.min(Number(time)||0,total||0));
  $("currentTime").textContent=fmt(safeTime);$("durationTime").textContent=fmt(total);
  $("timelineCurrent").textContent=fmt(safeTime);$("timelineEnd").textContent=fmt(total);
  const scrubber=$("timelineScrubber");scrubber.max=Math.max(1,Math.round(total*100));scrubber.value=Math.min(Number(scrubber.max),Math.round(safeTime*100));
  $("playerSceneCount").textContent=state.media.length;
  $("previewResolution").textContent=state.ratio==="16:9"?"16:9 · 1920 × 1080":"9:16 · 1080 × 1920";
}
function tick(){
  if(!state.playing)return;
  const time=audio.src?audio.currentTime:performance.now()/1000-state.lastFrame;
  if(time>=totalDuration()){pause();return;}
  render(time);state.raf=requestAnimationFrame(tick);
}
function play(){
  if(!state.media.length){toast("Importa primero tus imágenes o clips.");return;}
  if(audio.src){audio.play().then(()=>{state.playing=true;$("playBtn").textContent="Ⅱ";if(music.src&&$("includeMusic").checked){music.volume=Number($("musicVolume").value)/100;music.play().catch(()=>{});}tick();}).catch(()=>toast("No se pudo reproducir el audio."));}
  else{state.lastFrame=performance.now()/1000;$("playBtn").textContent="Ⅱ";state.playing=true;tick();}
}
function pause(){state.playing=false;cancelAnimationFrame(state.raf);audio.pause();music.pause();if(previewVideo)previewVideo.pause();$("playBtn").textContent="▶";render(audio.currentTime||0);}
function importMedia(files){
  const accepted=[...files].filter(f=>f.type.startsWith("image/")||f.type.startsWith("video/")||/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/i.test(f.name));
  accepted.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}));
  accepted.forEach(file=>state.media.push({file,url:URL.createObjectURL(file),name:file.name,kind:file.type.startsWith("video/")||/\.(mp4|webm|mov|m4v)$/i.test(file.name)?"video":"image"}));
  state.durations=state.media.map((_,i)=>state.durations[i]||5);
  updateUI();if(state.media.length)render(0);toast(accepted.length?`${accepted.length} archivo(s) añadidos.`:"No se encontraron medios compatibles.");
}
function updateUI(){
  const images=state.media.filter(x=>x.kind==="image").length;
  $("mediaCount").textContent=state.media.length?`${state.media.length} escenas cargadas (${images} imágenes, ${state.media.length-images} clips)`:"Aún no hay medios.";
  $("sceneTotal").textContent=state.media.length;$("sceneFileCount").textContent=`${state.media.length} escenas`;$("playerSceneCount").textContent=state.media.length;
  $("subtitleTotal").textContent=state.cues.length;$("projectDuration").textContent=fmt(totalDuration());
  $("audioName").textContent=state.audioFile?state.audioFile.name:"Aún no hay audio.";
  $("musicName").textContent=state.musicFile?state.musicFile.name:"Aún no hay música.";$("musicStatus").textContent=state.musicFile?"COMPLETADO":"PENDIENTE";$("musicStatus").classList.toggle("done",!!state.musicFile);
  $("timelineEnd").textContent=fmt(totalDuration());$("timelineCurrent").textContent=fmt(audio.currentTime||0);$("timelineScrubber").max=Math.max(1,Math.round(totalDuration()*100));$("timelineScrubber").value=Math.round((audio.currentTime||0)*100);
  const total=Math.max(.1,totalDuration()),syncForTrack=state.mode==="srt"?getExactSync():null,trackTimings=syncForTrack?.ok?syncForTrack.timings:buildSceneTimings();
  const visual=$("visualTrack");visual.innerHTML="";state.media.forEach((item,i)=>{const chip=document.createElement("button");chip.type="button";chip.className="timeline-clip";chip.textContent=String(i+1).padStart(3,"0");chip.title=item.name;const span=trackTimings[i]?Math.max(.05,trackTimings[i].end-trackTimings[i].start):(state.durations[i]||5);chip.style.flexBasis=Math.max(2,span/total*100)+"%";chip.onclick=()=>{pause();const target=sceneStart(i);if(audio.src)audio.currentTime=target;render(target);updateClock(target);};visual.append(chip);});
  $("voiceTrack").innerHTML=state.audioFile?'<span class="timeline-audio"></span>':'<span class="lane-empty">Sin narración</span>';if(state.audioFile){const voice=$("voiceTrack").firstChild;voice.textContent=state.audioFile.name;voice.style.width="100%";}
  $("musicTrack").innerHTML=state.musicFile?'<span class="timeline-audio"></span>':'<span class="lane-empty">Sin música</span>';if(state.musicFile){const musicClip=$("musicTrack").firstChild;musicClip.textContent=state.musicFile.name;musicClip.style.width="100%";}
  $("subtitleTrack").innerHTML="";state.cues.forEach(cue=>{const chip=document.createElement("span");chip.className="timeline-subtitle";chip.textContent=cue.text;chip.title=fmt(cue.start)+" – "+fmt(cue.end);chip.style.flexBasis=Math.max(2,(cue.end-cue.start)/total*100)+"%";$("subtitleTrack").append(chip);});
  const syncCheck=state.mode==="srt"?getExactSync():null;
  $("syncStatus").textContent=syncCheck&&!syncCheck.ok?syncCheck.error:([state.textName?`TXT: ${state.textLines.length} escenas`:"",state.srtName?`SRT: ${state.cues.length} subtítulos`:""].filter(Boolean).join(" · ")||"Sin archivos de sincronización.");
  for(const [id,done] of [["mediaStatus",!!state.media.length],["scenesStatus",!!state.media.length],["playerStatus",!!state.media.length],["audioStatus",!!state.audioFile],["syncStatusBadge",!!(state.textName&&state.srtName)]]){
    const el=$(id);el.textContent=done?"COMPLETADO":"PENDIENTE";el.classList.toggle("done",done);
  }
  $("playerEmpty").hidden=!!state.media.length;
  const list=$("sceneList");list.innerHTML="";
  if(!state.media.length){list.innerHTML='<div class="scene-empty"><span>▧</span><strong>Todavía no hay escenas</strong><small>Las imágenes y clips que importes aparecerán aquí.</small></div>';}
  state.media.forEach((item,i)=>{
    const card=document.createElement("button");card.type="button";card.className="scene-card";card.addEventListener("click",()=>{pause();state.selected=i;render(sceneStart(i));});
    const thumb=document.createElement(item.kind==="video"?"video":"img");thumb.src=item.url;if(item.kind==="video"){thumb.muted=true;thumb.preload="metadata";}else thumb.alt=item.name;
    const label=document.createElement("div");label.textContent=`${String(i+1).padStart(2,"0")} · ${item.name}`;card.append(thumb,label);
    const durationInput=document.createElement("input");durationInput.type="number";durationInput.min=".5";durationInput.step=".5";durationInput.value=state.durations[i];durationInput.title="Duración en segundos";durationInput.style.cssText="width:calc(100% - 16px);margin:0 8px 8px;background:#101522;color:white;border:1px solid #343c50;border-radius:5px;padding:6px";durationInput.disabled=state.mode==="srt";durationInput.addEventListener("change",()=>{const v=Number(durationInput.value);if(v>=.5){state.durations[i]=v;updateUI();render(audio.currentTime||0);}});card.append(durationInput);list.append(card);
  });
  updateClock(audio.currentTime||0);
}
function loadAudio(file){
  if(!file)return;if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);
  state.audioFile=file;state.audioUrl=URL.createObjectURL(file);audio.src=state.audioUrl;audio.load();audio.onloadedmetadata=()=>{updateUI();};
  updateUI();toast("Narración cargada.");
}
async function loadTxt(file){state.textLines=(await file.text()).replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);state.textName=file.name;updateUI();toast(`TXT cargado: ${state.textLines.length} líneas.`);}
async function loadSrt(file){const cues=parseSRT(await file.text());if(!cues.length){toast("No se encontraron subtítulos SRT válidos.");return;}state.cues=cues;state.srtName=file.name;updateUI();render(audio.currentTime||0);toast(`SRT cargado: ${cues.length} subtítulos.`);}
function bindDrop(id,handler){const el=$(id);["dragenter","dragover"].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();el.classList.add("dragover");}));["dragleave","drop"].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();el.classList.remove("dragover");}));el.addEventListener("drop",e=>handler(e.dataTransfer.files));}
$("mediaBtn").onclick=()=>$("mediaInput").click();$("filesBtn").onclick=()=>$("mediaInput").click();$("folderBtn").onclick=()=>{$("mediaInput").setAttribute("webkitdirectory","");$("mediaInput").click();};$("folderVisual").onclick=e=>{e.stopPropagation();$("folderBtn").click();};
$("mediaInput").onchange=e=>{importMedia(e.target.files);e.target.value="";e.target.removeAttribute("webkitdirectory");};
$("audioBtn").onclick=()=>$("audioInput").click();$("audioInput").onchange=e=>{loadAudio(e.target.files[0]);e.target.value="";};
$("musicBtn").onclick=()=>$("musicInput").click();$("musicInput").onchange=e=>{const f=e.target.files[0];if(f){if(state.musicUrl)URL.revokeObjectURL(state.musicUrl);state.musicFile=f;state.musicUrl=URL.createObjectURL(f);music.src=state.musicUrl;music.volume=Number($("musicVolume").value)/100;updateUI();toast("Música de fondo cargada.");}e.target.value="";};
$("musicVolume").oninput=e=>{music.volume=Number(e.target.value)/100;$("musicVolumeValue").textContent=e.target.value+"%";};$("musicLoop").onchange=e=>music.loop=e.target.checked;
$("txtBtn").onclick=()=>$("txtInput").click();$("srtBtn").onclick=()=>$("srtInput").click();
$("txtInput").onchange=e=>{if(e.target.files[0])loadTxt(e.target.files[0]);e.target.value="";};$("srtInput").onchange=e=>{if(e.target.files[0])loadSrt(e.target.files[0]);e.target.value="";};
bindDrop("mediaBtn",importMedia);bindDrop("audioBtn",files=>loadAudio([...files].find(f=>f.type.startsWith("audio/")||/\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name))));
bindDrop("musicBtn",files=>{const f=[...files].find(x=>x.type.startsWith("audio/")||/\.(mp3|wav|m4a|aac|ogg)$/i.test(x.name));if(f){if(state.musicUrl)URL.revokeObjectURL(state.musicUrl);state.musicFile=f;state.musicUrl=URL.createObjectURL(f);music.src=state.musicUrl;music.volume=Number($("musicVolume").value)/100;updateUI();}});
bindDrop("txtDrop",files=>{const f=[...files].find(x=>x.name.toLowerCase().endsWith(".txt"));if(f)loadTxt(f);});bindDrop("srtDrop",files=>{const f=[...files].find(x=>x.name.toLowerCase().endsWith(".srt"));if(f)loadSrt(f);});
$("playBtn").onclick=()=>state.playing?pause():play();$("stopBtn").onclick=()=>{pause();audio.currentTime=0;render(0);};$("toStart").onclick=()=>{pause();audio.currentTime=0;render(0);};
audio.addEventListener("timeupdate",()=>{if(state.playing)render(audio.currentTime);else updateClock(audio.currentTime);});
audio.addEventListener("ended",pause);
$("timelineScrubber").oninput=e=>{pause();audio.currentTime=Number(e.target.value)/100;render(audio.currentTime);};
document.querySelectorAll(".format").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".format").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.ratio=btn.dataset.ratio;const vertical=state.ratio==="9:16";$("previewFrame").classList.toggle("vertical",vertical);canvas.width=vertical?720:1280;canvas.height=vertical?1280:720;render(audio.currentTime||0);updateUI();}));
$("includeMusic").onchange=()=>{if(!$("includeMusic").checked)music.pause();else if(state.playing&&music.src)music.play().catch(()=>{});toast($("includeMusic").checked?"La música se incluirá en el video.":"La música está desactivada.");};
$("includeSubtitles").onchange=()=>{render(audio.currentTime||0);toast($("includeSubtitles").checked?"Los subtítulos están activados.":"Los subtítulos están desactivados.");};
$("transitionSelect").onchange=e=>{state.transition=e.target.value;render(audio.currentTime||0);};
$("transitionDuration").oninput=e=>{state.transitionDuration=Number(e.target.value);$("transitionDurationValue").textContent=state.transitionDuration.toFixed(1)+" s";render(audio.currentTime||0);};
$("motionSelect").onchange=e=>{state.motion=e.target.value;render(audio.currentTime||0);};
$("qualitySelect").onchange=e=>state.quality=e.target.value;
document.querySelectorAll("#subtitleStyles .chip").forEach(chip=>chip.onclick=()=>{document.querySelectorAll("#subtitleStyles .chip").forEach(x=>x.classList.remove("active"));chip.classList.add("active");state.subtitleStyle=chip.textContent.trim();render(audio.currentTime||0);});
document.querySelectorAll("#wordColors .color-chip").forEach(chip=>chip.onclick=()=>{document.querySelectorAll("#wordColors .color-chip").forEach(x=>x.classList.remove("active"));chip.classList.add("active");state.highlight=chip.dataset.color;render(audio.currentTime||0);});
$("newProject").onclick=()=>{if(!confirm("¿Crear un proyecto nuevo? Se eliminarán los archivos cargados."))return;pause();state.media.forEach(x=>URL.revokeObjectURL(x.url));state.media=[];state.durations=[];state.cues=[];state.textLines=[];state.textName="";state.srtName="";state.selected=0;if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;state.audioFile=null;audio.removeAttribute("src");audio.load();updateUI();ctx.clearRect(0,0,canvas.width,canvas.height);toast("Proyecto nuevo preparado.");};

let lastDownloadUrl=null;
function showVideoDownload(blob,filename){
 if(lastDownloadUrl)URL.revokeObjectURL(lastDownloadUrl);
 lastDownloadUrl=URL.createObjectURL(blob);
 const link=$("downloadVideoLink");
 link.href=lastDownloadUrl;
 link.download=filename;
 link.hidden=false;
 link.textContent="↓ DESCARGAR VIDEO MP4";
 link.focus({preventScroll:true});
 toast("Video listo. Pulsa «Descargar video MP4» para guardarlo.");
}
async function exportMP4(){
 if(state.exporting)return;
 if(!state.media.length||!state.audioFile){toast("Importa escenas y una narración antes de exportar.");return;}
 if(state.mode!=="manual"&&!state.textLines.length){toast("Para sincronizar automáticamente carga un TXT.");return;}
 if(state.mode==="srt"&&!state.cues.length){toast("Para sincronizar exactamente carga también un SRT.");return;}
 if(state.mode==="srt"){const sync=getExactSync();if(!sync.ok){toast(sync.error);return;}}
 state.exporting=true;$("exportBtn").disabled=$("createVideoBtn").disabled=true;
 const setProgress=(p,msg)=>toast(`${msg} · ${p}%`);
 let recorder=null,stream=null,audioContext=null,ffmpeg=null;
 try{
  setProgress(2,"Preparando el motor de exportación");
  const width=state.ratio==="16:9"?(state.quality.includes("720")?1280:1920):(state.quality.includes("720")?720:1080);
  const height=state.ratio==="16:9"?(state.quality.includes("720")?720:1080):(state.quality.includes("720")?1280:1920);
  const work=document.createElement("canvas");work.width=width;work.height=height;const c=work.getContext("2d");
  stream=work.captureStream(24);audioContext=new AudioContext();const decoded=await audioContext.decodeAudioData(await state.audioFile.arrayBuffer());
  const source=audioContext.createBufferSource(),dest=audioContext.createMediaStreamDestination();source.buffer=decoded;source.connect(dest);let musicSource=null;if(state.musicFile&&$("includeMusic").checked){const mb=await audioContext.decodeAudioData(await state.musicFile.arrayBuffer());musicSource=audioContext.createBufferSource();musicSource.buffer=mb;musicSource.loop=$("musicLoop").checked;const mg=audioContext.createGain();mg.gain.value=Number($("musicVolume").value)/100;musicSource.connect(mg).connect(dest);}dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const mp4Types=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4;codecs=avc1.42E01E","video/mp4"];
  const nativeMp4=mp4Types.find(type=>MediaRecorder.isTypeSupported(type));
  const mime=nativeMp4||(MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm");
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:state.quality.includes("720")?3500000:6500000});
  const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(Error("No se pudo grabar el montaje."));});
  const cache=await Promise.all(state.media.map(async item=>{if(item.kind==="image"){const img=new Image();img.src=item.url;await img.decode();return img;}const v=document.createElement("video");v.src=item.url;v.muted=true;v.preload="auto";await new Promise((res,rej)=>{v.onloadeddata=res;v.onerror=()=>rej(Error("No se pudo leer "+item.name));});return v;}));
  function paint(t){
   const idx=sceneAt(t),start=sceneStart(idx),span=sceneDuration(idx),m=cache[idx];
   if(m instanceof HTMLVideoElement){const local=t-start;if(Math.abs(m.currentTime-Math.min(local,m.duration||0))>.35)m.currentTime=Math.min(local,Math.max(0,(m.duration||.1)-.05));}
   const p=Math.max(0,Math.min(1,(t-start)/span));
   const drawExportFrame=(source,alpha=1,offsetX=0,extraZoom=1)=>{const sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;if(!sw||!sh)return;let z=extraZoom,x=offsetX,y=0;if(state.motion==="Zoom lento de acercamiento")z*=1+p*.12;if(state.motion==="Zoom lento de alejamiento")z*=1.12-p*.12;if(state.motion==="Movimiento cinematográfico")z*=1.06+p*.08;if(state.motion.includes("izquierda")){z*=1.14;x+=(.5-p)*width*.12;}if(state.motion.includes("derecha")){z*=1.14;x+=(p-.5)*width*.12;}if(state.motion.includes("arriba")){z*=1.14;y=(.5-p)*height*.12;}if(state.motion.includes("abajo")){z*=1.14;y=(p-.5)*height*.12;}const sc=Math.max(width/sw,height/sh)*z,dw=sw*sc,dh=sh*sc;c.save();c.globalAlpha=alpha;c.drawImage(source,(width-dw)/2+x,(height-dh)/2+y,dw,dh);c.restore();};
   c.fillStyle="#05070b";c.fillRect(0,0,width,height);
   const transSecs=Math.min(state.transitionDuration,span*.45),transP=transSecs>0?Math.max(0,Math.min(1,(t-start)/transSecs)):1,prev=cache[idx-1];
   if(idx>0&&m instanceof HTMLImageElement&&prev instanceof HTMLImageElement&&state.transition!=="none"&&transP<1){
    drawExportFrame(prev,1);
    if(state.transition==="slide")drawExportFrame(m,1,width*(1-transP),1);
    else if(state.transition==="zoom")drawExportFrame(m,transP,0,1.18-.18*transP);
    else drawExportFrame(m,transP);
   }else drawExportFrame(m,1);
   const cue=$("includeSubtitles").checked?state.cues.find(q=>t>=q.start&&t<q.end):null;if(cue){const words=cue.text.split(/\s+/);const dur=cue.end-cue.start;const total=words.reduce((s,w)=>s+Math.max(1,w.length),0),target=(t-cue.start)/dur*total;let sum=0,active=words.length-1;for(let i=0;i<words.length;i++){sum+=Math.max(1,words[i].length);if(target<sum){active=i;break;}}const fs=width*.027;c.font=`bold ${fs}px Arial`;c.textAlign="center";c.textBaseline="middle";const text=words.join(" ");c.lineWidth=fs*.1;c.strokeStyle="#000";c.strokeText(text,width/2,height*.91);c.fillStyle="#fff";c.fillText(text,width/2,height*.91);}
  }
  const length=Math.max(decoded.duration,totalDuration());await audioContext.resume();recorder.start(250);source.start();if(musicSource)musicSource.start();const startAt=audioContext.currentTime;
  while(audioContext.currentTime-startAt<length){const t=audioContext.currentTime-startAt;paint(t);setProgress(Math.min(65,5+Math.floor(t/length*60)),"Montando escenas");await new Promise(r=>requestAnimationFrame(r));}
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());await audioContext.close();audioContext=null;
  let finalBlob;
  if(nativeMp4){
   finalBlob=new Blob(chunks,{type:"video/mp4"});
  }else{
   setProgress(68,"Preparando conversión MP4");
   const [{FFmpeg},{fetchFile,toBlobURL}]=await Promise.all([import("https://esm.sh/@ffmpeg/ffmpeg@0.12.10"),import("https://esm.sh/@ffmpeg/util@0.12.1")]);
   ffmpeg=new FFmpeg();const base="https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
   await ffmpeg.load({coreURL:await toBlobURL(base+"/ffmpeg-core.js","text/javascript"),wasmURL:await toBlobURL(base+"/ffmpeg-core.wasm","application/wasm")});
   const webm=new Blob(chunks,{type:mime});await ffmpeg.writeFile("input.webm",await fetchFile(webm));setProgress(72,"Convirtiendo a MP4");
   ffmpeg.on("progress",({progress})=>setProgress(Math.min(98,72+Math.floor(progress*26)),"Convirtiendo MP4"));
   await ffmpeg.exec(["-i","input.webm","-vf",`scale=${width}:${height}:flags=lanczos,setsar=1`,"-r","24","-c:v","libx264","-preset","ultrafast","-crf",state.quality.includes("720")?"29":"27","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart","output.mp4"]);
   const data=await ffmpeg.readFile("output.mp4");
   if(!data||!data.length)throw Error("La conversión no generó un archivo MP4.");
   finalBlob=new Blob([data],{type:"video/mp4"});
  }
  if(!finalBlob||finalBlob.size<1024)throw Error("El video generado está vacío o incompleto.");
  showVideoDownload(finalBlob,"editor-oscuro-studio.mp4");
 }catch(e){console.error(e);toast("No se pudo exportar: "+(e?.message||"error del navegador"));}finally{if(recorder&&recorder.state!=="inactive")try{recorder.stop();}catch{}if(audioContext&&audioContext.state!=="closed")await audioContext.close().catch(()=>{});stream?.getTracks().forEach(t=>t.stop());ffmpeg?.terminate();state.exporting=false;$("exportBtn").disabled=$("createVideoBtn").disabled=false;}
}
$("exportBtn").onclick=exportMP4;$("createVideoBtn").onclick=exportMP4;
document.querySelectorAll('input[name="syncMode"]').forEach(r=>r.addEventListener("change",()=>{state.mode=r.value;updateUI();render(audio.currentTime||0);}));
updateUI();
