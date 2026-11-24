const TIMECODE = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})$/;
export function toSeconds(value) {
  const m=String(value||"").trim().match(TIMECODE);
  if(!m)return NaN;
  const h=Number(m[1]||0),min=Number(m[2]),sec=Number(m[3]);
  if(min>59||sec>59)return NaN;
  return h*3600+min*60+sec+Number(m[4].padEnd(3,"0"))/1000;
}
export function normalizeWords(text) {
  return String(text||"").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]+/g)||[];
}
export function parseSRT(source) {
  const clean=String(source||"").replace(/^\uFEFF/,"").replace(/\r/g,"").trim();
  if(!clean)return [];
  const lines=clean.split("\n"),cues=[];
  const re=/^\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/;
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(re);if(!m)continue;
    const start=toSeconds(m[1]),end=toSeconds(m[2]),parts=[];
    for(let j=i+1;j<lines.length&&!re.test(lines[j]);j++){const line=lines[j].trim();if(line&&!/^\d+$/.test(line))parts.push(line);}
    const text=parts.join(" ").replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").trim();
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&text)cues.push({start,end,text});
  }
  return cues.sort((a,b)=>a.start-b.start);
}

/**
 * Lee el formato de sincronización por escenas y conserva los tiempos
 * explícitos del encabezado. El texto de reencuadre nunca forma parte de VOZ.
 */
export function parseSceneDocument(source) {
  const clean=String(source||"").replace(/^\uFEFF/,"").replace(/\r/g,"").trim();
  if(!clean)return [];
  const blocks=clean.split(/(?=^\s*ESCENA\s+\d+\b)/gim)
    .filter(block=>/^\s*ESCENA\s+\d+\b/i.test(block));
  const records=[];
  const headerRe=/^\s*ESCENA\s+(\d+)\s*\|\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*[–—-]\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})/i;
  for(const block of blocks){
    const header=block.match(headerRe);
    const voice=block.match(/^\s*VOZ\s*:\s*([\s\S]*?)(?=^\s*(?:REENCUADRE\s+SUGERIDO\s*:|ESCENA\s+\d+\b|RESUMEN\b)|$)/im);
    if(!header||!voice)continue;
    const text=voice[1].split("\n")
      .filter(line=>! /^\s*REENCUADRE\s+SUGERIDO\s*:/i.test(line))
      .join(" ").trim().replace(/^["“”']|["“”']$/g,"").trim();
    const start=toSeconds(header[2]),end=toSeconds(header[3]);
    if(!text||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
    const image=block.match(/^\s*IMAGEN\s*:\s*(\d+)/im);
    records.push({number:Number(header[1]),image:image?Number(image[1]):null,start,end,text});
  }
  if(records.length)return records.sort((a,b)=>a.number-b.number);

  const legacy=[...clean.matchAll(/(?:^|\n)\s*VOZ\s*:\s*([\s\S]*?)(?=\n\s*ESCENA\s+\d+\b|\n\s*RESUMEN\b|$)/gi)]
    .map(match=>match[1].split("\n")
      .filter(line=>! /^\s*REENCUADRE\s+SUGERIDO\s*:/i.test(line))
      .join(" ").trim().replace(/^["“”']|["“”']$/g,"").trim())
    .filter(Boolean);
  const plain=legacy.length?legacy:clean.split("\n")
    .map(line=>line.trim())
    .filter(line=>line&&!/^\s*(?:ESCENAS?\b|ESCENA\s+\d+|RESUMEN\b|TOTAL\s+DE\s+ESCENAS\b|DURACI[ÓO]N\s+TOTAL\b|PALABRAS\s+TOTALES\b|\d+\s+ESCENAS?\b)/i.test(line))
    .map(line=>line.replace(/^\s*\d+\s*[.|):-]\s*/,"").trim())
    .filter(Boolean);
  return plain.map((text,index)=>({number:index+1,image:null,start:null,end:null,text}));
}

export function parseSceneText(source) {
  return parseSceneDocument(source).map(scene=>scene.text);
}

function editDistance(a,b){
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
  return prev[b.length];
}
export function matchScenesToSubtitles(sceneLines,cues){
  if(!sceneLines.length)return {ok:false,error:"El TXT no contiene escenas reconocibles."};
  if(!cues.length)return {ok:false,error:"El SRT no contiene subtítulos válidos."};
  const tokens=[];
  for(const cue of cues){const words=normalizeWords(cue.text);words.forEach((word,i)=>tokens.push({word,start:cue.start+(cue.end-cue.start)*i/words.length,end:cue.start+(cue.end-cue.start)*(i+1)/words.length}));}
  const timings=[];let cursor=0;
  for(let scene=0;scene<sceneLines.length;scene++){
    const wanted=normalizeWords(sceneLines[scene]);if(!wanted.length)return {ok:false,error:"La escena "+(scene+1)+" no contiene palabras reconocibles."};
    let found=-1,best=0,bestLen=wanted.length;
    for(let i=cursor;i<=tokens.length-wanted.length;i++){
      let exact=true;for(let j=0;j<wanted.length;j++)if(tokens[i+j].word!==wanted[j]){exact=false;break;}
      if(exact){found=i;best=1;break;}
    }
    if(found<0){
      const tolerance=Math.max(2,Math.ceil(wanted.length*.08)),minLen=Math.max(1,wanted.length-tolerance),maxLen=wanted.length+tolerance;
      outer:for(let i=cursor;i<tokens.length;i++)for(let len=minLen;len<=maxLen&&i+len<=tokens.length;len++){
        const candidate=tokens.slice(i,i+len).map(t=>t.word),score=1-editDistance(wanted,candidate)/Math.max(wanted.length,candidate.length);
        if(score>best){best=score;found=i;bestLen=len;}
        if(score>=.94)break outer;
      }
      if(best<.88)return {ok:false,error:"No pude localizar con suficiente confianza el texto de la escena "+(scene+1)+" en el SRT. Revisa el texto o el orden desde esa escena."};
    }
    const first=tokens[found],last=tokens[found+bestLen-1];
    if(!first||!last||last.end<=first.start)return {ok:false,error:"Los tiempos de la escena "+(scene+1)+" no son válidos."};
    let start=first.start,end=last.end;
    if(timings.length&&start<timings[timings.length-1].end){
      const overlap=timings[timings.length-1].end-start;
      if(overlap>.12)return {ok:false,error:"Los subtítulos de las escenas "+scene+" y "+(scene+1)+" se solapan "+overlap.toFixed(2)+" s."};
      const boundary=(timings[timings.length-1].end+start)/2;timings[timings.length-1].end=boundary;start=boundary;
    }
    timings.push({start,end,confidence:best});cursor=found+bestLen;
  }
  return {ok:true,timings,tokens};
}


/**
 * Devuelve la escena visible para un instante de la narración.
 * Los huecos entre intervalos se resuelven explícitamente, sin desplazar
 * las marcas de tiempo originales del TXT/SRT.
 */
export function sceneIndexAtTime(timings, time, gapMode = "previous") {
  if (!Array.isArray(timings) || timings.length === 0) return -1;
  const t = Number(time);
  if (!Number.isFinite(t)) return -1;
  if (t < timings[0].start) return 0;

  for (let i = 0; i < timings.length; i++) {
    const current = timings[i];
    if (t >= current.start && t < current.end) return i;

    const next = timings[i + 1];
    if (next && t >= current.end && t < next.start) {
      if (gapMode === "black") return -1;
      if (gapMode === "next") return i + 1;
      return i;
    }
  }
  return timings.length - 1;
}
