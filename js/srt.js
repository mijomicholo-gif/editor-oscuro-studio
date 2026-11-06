export function parseSRT(source) {
  const clean = source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!clean) return [];
  const blocks = clean.split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex(line => line.includes("-->"));
    if (timeIndex < 0) continue;
    const [startText, endText] = lines[timeIndex].split("-->").map(value => value.trim().split(" ")[0]);
    const start = toSeconds(startText);
    const end = toSeconds(endText);
    const text = lines.slice(timeIndex + 1).join(" ").replace(/<[^>]*>/g, "").trim();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) cues.push({start, end, text});
  }
  return cues.sort((a,b) => a.start - b.start);
}
function toSeconds(value) {
  const match = value.match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return NaN;
  return Number(match[1])*3600 + Number(match[2])*60 + Number(match[3]) + Number(match[4].padEnd(3,"0"))/1000;
}