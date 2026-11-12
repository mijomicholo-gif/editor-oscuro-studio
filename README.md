# EDITOR OSCURO STUDIO

Editor de vídeo en el navegador, preparado para GitHub Pages. No requiere instalar Python ni FFmpeg en Windows.

## Publicación automática con GitHub Actions

1. Abre **Settings → Pages** en este repositorio.
2. En **Build and deployment → Source**, selecciona **GitHub Actions**.
3. Cada push a `main` ejecutará `.github/workflows/deploy.yml` y publicará el sitio.
4. Consulta **Actions** para ver el resultado de cada despliegue.

URL esperada: https://mijomicholo-gif.github.io/editor-oscuro-studio/

## Funciones disponibles en esta versión

- Importación de imágenes, GIF y clips de vídeo; orden numérico de archivos.
- Carga de narración, música de fondo, TXT y SRT.
- Modo manual, distribución automática ponderada por palabras y sincronización por coincidencia de texto con marcas SRT.
- Vista previa de escenas, selector de escenas y controles de reproducción.
- Pistas visuales, voz, música y subtítulos en una línea de tiempo inicial con control de posición.
- Música en reproducción y exportación, control de volumen y repetición.
- Movimientos globales tipo zoom y desplazamiento.
- Subtítulos SRT con estilos básicos y palabra activa en previsualización.
- Formatos 16:9 y 9:16; exportación 720p/1080p y opción 4K experimental.
- Exportación mediante MediaRecorder y conversión con FFmpeg.wasm cuando sea necesaria.

## Limitaciones conocidas

Esta versión es una base mejorada, no un editor profesional terminado. La sincronización SRT intenta emparejar cada línea TXT con secuencias de palabras de los subtítulos; si no hay coincidencia, distribuye las escenas proporcionalmente. La edición multipista todavía no permite arrastrar y recortar clips con handles, los movimientos se aplican globalmente y no hay keyframes individuales ni transiciones completas. El guardado persistente del proyecto está pendiente.

La exportación MP4 depende de los códecs disponibles en el navegador; si MediaRecorder no genera MP4 nativo, se usa FFmpeg.wasm para convertir WebM a MP4. Los proyectos largos y 4K pueden superar la memoria disponible. Conserva los originales.

## Desarrollo

La aplicación actual es estática y usa HTML, CSS y JavaScript ES modules. Para probarla localmente, sirve la carpeta con un servidor estático (por ejemplo, Live Server). No abras `index.html` directamente como archivo, porque los módulos JavaScript y la carga de FFmpeg.wasm necesitan un origen HTTP/HTTPS.
