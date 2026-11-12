# EDITOR OSCURO STUDIO

Editor de vídeo en el navegador, preparado para GitHub Pages. No requiere instalar Python ni FFmpeg en Windows.

## Publicación automática con GitHub Actions

1. Abre **Settings → Pages** en este repositorio.
2. En **Build and deployment → Source**, selecciona **GitHub Actions**.
3. Cada push a `main` ejecutará `.github/workflows/deploy.yml` y publicará el sitio.
4. Consulta **Actions** para ver el resultado de cada despliegue.

URL esperada: https://mijomicholo-gif.github.io/editor-oscuro-studio/

## Funciones y flujo de trabajo

- Importación por carpeta o archivos sueltos; orden natural de nombres y prevención de duplicados.
- Carga de narración MP3/WAV/M4A y sincronización de escenas con TXT + SRT.
- El TXT puede contener una frase por línea o bloques con etiquetas de escena y voz.
- El SRT admite marcas de tiempo con coma o punto decimal, subtítulos multilínea y etiquetas.
- La sincronización compara texto normalizado (acentos, mayúsculas y puntuación) y valida coincidencias; no sustituye silenciosamente una sincronización exacta por tiempos inventados.
- Vista previa, navegación por tiempo, pistas de escenas/voz/música/subtítulos.
- Música y subtítulos son opcionales y solo se incluyen si se activan.
- Formatos 16:9 y 9:16, movimientos de cámara y transiciones disponibles.
- Exportación MP4 mediante MediaRecorder y conversión con FFmpeg.wasm cuando el navegador no genera MP4 nativo.

## Calidad y límites técnicos

La sincronización por TXT + SRT solo puede ser tan precisa como las marcas de tiempo del SRT. Si un SRT no contiene el texto o no coincide con el guion, el editor muestra un error y no inventa tiempos. La exportación de videos largos o 4K depende de la memoria disponible del navegador y del códec soportado; para proyectos extensos se recomienda cerrar otras pestañas y exportar en 1080p.

El repositorio ejecuta pruebas automáticas de regresión de lectura SRT y correspondencia de escenas antes de publicar. Esto reduce errores de código, pero no sustituye una prueba visual en el navegador con cada combinación de archivos y códecs.

## Desarrollo

La aplicación actual es estática y usa HTML, CSS y JavaScript ES modules. Para probarla localmente, sirve la carpeta con un servidor estático (por ejemplo, Live Server). No abras `index.html` directamente como archivo, porque los módulos JavaScript y la carga de FFmpeg.wasm necesitan un origen HTTP/HTTPS.
