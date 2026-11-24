import test from "node:test";
import assert from "node:assert/strict";
import { parseSRT, parseSceneText, parseSceneDocument, normalizeWords, matchScenesToSubtitles } from "../js/srt.js";

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

test("ignora las notas de reencuadre al extraer las frases del TXT",()=>{
  const source=[
    "ESCENA 1 | 00:00:00,000 – 00:00:07,044",
    "IMAGEN: 1",
    'VOZ: "Primera frase de la narración."',
    "",
    "ESCENA 2 | 00:00:07,044 – 00:00:15,289",
    "IMAGEN: 2",
    'VOZ: "Segunda frase de la narración."',
    "REENCUADRE SUGERIDO: 00:00:10,320",
    "",
    "RESUMEN",
    "Total de escenas: 2"
  ].join("\n");
  assert.deepEqual(parseSceneText(source),[
    "Primera frase de la narración.",
    "Segunda frase de la narración."
  ]);
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

test("conserva los tiempos explícitos del TXT y excluye el reencuadre",()=>{
  const source=[
    "ESCENA 1 | 00:00:00,000 – 00:00:07,044 | Duración: 7,044 s",
    "IMAGEN: 1",
    'VOZ: "Primera frase de prueba."',
    "",
    "ESCENA 2 | 00:00:07,044 – 00:00:15,289 | Duración: 8,245 s",
    "IMAGEN: 2",
    'VOZ: "Segunda frase de prueba."',
    "REENCUADRE SUGERIDO: 00:00:10,320",
    "",
    "RESUMEN"
  ].join("\n");
  const scenes=parseSceneDocument(source);
  assert.equal(scenes.length,2);
  assert.deepEqual(scenes.map(x=>x.text),["Primera frase de prueba.","Segunda frase de prueba."]);
  assert.deepEqual(scenes.map(x=>[x.start,x.end]),[[0,7.044],[7.044,15.289]]);
});
