import test from "node:test";
import assert from "node:assert/strict";
import { parseSRT, parseSceneText, normalizeWords, matchScenesToSubtitles } from "../js/srt.js";

test("normaliza tildes, mayúsculas y puntuación española",()=>{
  assert.deepEqual(normalizeWords("¿QUÉ ocurrió después? ¡Murió en 1700!"),["que","ocurrio","despues","murio","en","1700"]);
});

test("lee SRT con coma decimal, bloques multilínea y etiquetas",()=>{
  const cues=parseSRT("1\n00:00:00,000 --> 00:00:02,500\n¿Qué ocurrió\ndespués?\n\n2\n00:00:02,500 --> 00:00:05,000\n< i >La respuesta final.</i>");
  assert.equal(cues.length,2);
  assert.equal(cues[0].start,0);
  assert.equal(cues[0].end,2.5);
  assert.equal(cues[0].text,"¿Qué ocurrió después?");
  assert.equal(cues[1].text,"La respuesta final.");
});

test("reconoce líneas de escena de TXT y elimina encabezados",()=>{
  assert.deepEqual(parseSceneText("ESCENAS\n1. Primera frase completa.\n2. Segunda frase completa.\nRESUMEN\n2 escenas"),["Primera frase completa.","Segunda frase completa."]);
});

test("sincroniza frases por texto aunque haya tildes y varias líneas SRT",()=>{
  const txt=["¿Qué ocurrió después de la muerte?","La respuesta está en las antiguas civilizaciones."];
  const srt=parseSRT("1\n00:00:00,000 --> 00:00:03,000\n¿Qué ocurrió después\nde la muerte?\n\n2\n00:00:03,000 --> 00:00:07,000\nLa respuesta está en las antiguas\ncivilizaciones.");
  const result=matchScenesToSubtitles(txt,srt);
  assert.equal(result.ok,true);
  assert.equal(result.timings.length,2);
  assert.equal(result.timings[0].start,0);
  assert.equal(result.timings[0].end,3);
  assert.equal(result.timings[1].start,3);
  assert.equal(result.timings[1].end,7);
});

test("rechaza un guion que no aparece en el SRT en vez de inventar tiempos",()=>{
  const result=matchScenesToSubtitles(["Una frase completamente distinta"],parseSRT("1\n00:00:00,000 --> 00:00:02,000\nTexto que no coincide."));
  assert.equal(result.ok,false);
});
