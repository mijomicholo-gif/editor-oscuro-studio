# EDITOR OSCURO STUDIO

Editor de vídeo cinematográfico en el navegador, preparado para GitHub Pages. No requiere instalar Python ni FFmpeg en Windows.

## Requisitos
- Node.js 20 o superior para desarrollo y compilación.
- Navegador moderno con soporte de Canvas, Web Audio y WebAssembly.
- Conexión a internet durante la primera carga del motor FFmpeg.wasm.

## Desarrollo local
```bash
npm install
npm run dev
```

## Publicación en GitHub Pages
1. Sube el contenido del repositorio a la rama `main`.
2. Abre **Settings → Pages** y selecciona **GitHub Actions** como fuente.
3. El workflow `.github/workflows/deploy.yml` instalará dependencias, compilará con Vite y publicará `dist/`.
4. Revisa **Actions** para comprobar el resultado del despliegue.

URL esperada: https://mijomicholo-gif.github.io/editor-oscuro-studio/

## Funciones iniciales
- Importación de imágenes, vídeos, narración, música, TXT y SRT.
- Orden numérico de escenas.
- Sincronización por marcas de tiempo SRT y distribución automática cuando no hay SRT.
- Previsualización, línea de tiempo, controles de voz y música.
- Formatos 16:9 y 9:16; opciones 1080p y 4K experimental.
- Motor de exportación FFmpeg.wasm bajo demanda.

## Limitaciones de esta versión
Esta es una base funcional inicial, no un editor de producción terminado. La exportación larga y 4K depende de la memoria y compatibilidad del navegador. Algunas opciones visuales y transiciones aún requieren implementación y pruebas. Conserva copias de tus medios originales.

## Estructura
- `src/main.jsx`: interfaz y lógica de la aplicación.
- `src/style.css`: estilos.
- `vite.config.js`: ruta base de GitHub Pages.
- `.github/workflows/deploy.yml`: compilación y despliegue automático.
