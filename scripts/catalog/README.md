# Script de catálogo

Genera `catalog.json` y los 6 clips por canción (MP3 CBR 128 kbps, sin metadatos) a partir de una playlist de YouTube y los sube al bucket. Todo lo generado vive en `scripts/catalog/data/` (ignorado en git); los originales nunca se suben.

## Requisitos (no están instalados por defecto)

- Node (el del proyecto) y `npm install` en esta carpeta.
- `yt-dlp`: `pipx install yt-dlp` o el binario oficial. YouTube cambia a menudo; si `fetch` falla, actualizarlo.
- `ffmpeg` y `ffprobe`: `sudo apt install ffmpeg`.
- Para `upload`: copiar `.env.example` a `.env` y rellenarlo (claves S3 de Supabase, no la `service_role`).

## Flujo

Desde esta carpeta, con `npm run cli -- <subcomando>`:

1. `fetch <playlistUrl>` lista la playlist (`data/work/playlist.json`) y descarga el audio nuevo a `data/work/` (no repite descargas).
2. `draft` añade a `data/catalog.json` los vídeos nuevos, derivando juego y título del título del vídeo. Nunca pisa entradas existentes.
3. **Revisión manual** de `data/catalog.json`: títulos, juegos, `startSec` (dónde empieza el fragmento), `enabled`. Un "juego" es un grupo de versiones con la misma banda sonora ("Ruby/Sapphire/Emerald" es uno). Las canciones sin juego reconocible quedan con `games: []` y hay que asignarlas a mano: hasta entonces `build`, `validate` y `upload` rechazan el catálogo.
4. `build` genera `data/out/clips/<clipKey>/<1..6>.mp3` solo para canciones nuevas o cambiadas (`startSec` o fuente) y copia el catálogo a `data/out/catalog/catalog.json`, que es lo que lee el backend con `STORAGE_DRIVER=fs`.
5. `validate` comprueba que hay 6 clips por canción activa, duraciones (de -30 ms a +60 ms sobre lo esperado: sin cabecera Xing, ffprobe mide ~40-50 ms de más; la cabecera Xing no se reactiva porque sería una huella por canción), ausencia de metadatos y que el tamaño en bytes coincide entre canciones para cada intento.
6. `upload [--prune]` valida, sube solo los clips nuevos o distintos (por md5) y por último `catalog.json`. `--prune` borra del bucket los clips que ya no pertenecen a una canción activa: ejecútalo **después** de reiniciar el backend en Render (mientras siga con el catálogo viejo en memoria, serviría clips ya borrados). Sin `--prune`, reinicia el backend tras subir.

`npm test` ejecuta los tests sin red (la validación contra ffmpeg real se omite si no está instalado). `npm run typecheck` comprueba tipos.
