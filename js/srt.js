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
export function parseSceneText(source) {
  const clean=String(source||"").replace(/^\uFEFF/,"").replace(/\r/g,"").trim();
  if(!clean)return [];
  const structured=[...clean.matchAll(/(?:^|\n)\s*VOZ\s*:\s*([\s\S]*?)(?=\n\s*ESCENA\s+\d+\b|\n\s*RESUMEN\b|$)/gi)]
    .map(m=>m[1].trim().replace(/^["“”']|["“”']$/g,"").trim()).filter(Boolean);
  if(structured.length)return structured;
  return clean.split("\n").map(x=>x.trim()).filter(x=>x&&!/^\s*(?:ESCENA\s+\d+|RESUMEN\b|TOTAL\s+DE\s+ESCENAS\b|DURACI[ÓO]N\s+TOTAL\b|PALABRAS\s+TOTALES\b)/i.test(x))
    .map(x=>x.replace(/^\s*\d+\s*[.|):-]\s*/,"").trim()).filter(Boolean);
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
