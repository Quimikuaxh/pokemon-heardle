# Script de catálogo

Genera `catalog.json` y UN clip de 16 s por canción (MP3 CBR 128 kbps, sin metadatos, sin bit reservoir; el backend sirve el prefijo de cada intento, DEC-44) a partir de una playlist de YouTube y los sube al bucket. Todo lo generado vive en `scripts/catalog/data/` (ignorado en git); los originales nunca se suben.

## Requisitos (no están instalados por defecto)

- Node (el del proyecto) y `npm install` en esta carpeta.
- `yt-dlp`: `pipx install yt-dlp` o el binario oficial. YouTube cambia a menudo; si `fetch` falla, actualizarlo.
- `ffmpeg` y `ffprobe`: `sudo apt install ffmpeg`.
- Para `upload`: copiar `.env.example` a `.env` y rellenarlo (claves S3 de Supabase, no la `service_role`).

## Flujo

Desde esta carpeta, con `npm run cli -- <subcomando>` (todos aceptan `--data-dir <ruta>`; por defecto `data/`):

1. `fetch <url>` lista la playlist (`data/work/playlist.json`) y descarga el audio nuevo a `data/work/` (no repite descargas). Admite también la URL de un vídeo suelto, que cuenta como una lista de un vídeo. Descarga audio m4a si existe (YouTube responde 403 a parte de las descargas webm) y si no el mejor disponible.
2. `draft` mide con `ffmpeg silencedetect` el **silencio inicial** de las fuentes (`source.leadingSilenceSec`; -50 dB, 0,1 s, primeros 10 s) y fija `startSec` en `silencio - 0,05 s` para que el clip empiece donde arranca la música (DEC-47). Un `startSec` puesto a mano se respeta: añade `"startSecManual": true` a la canción (sin marca, `startSec` 0 pasa a automático y distinto de 0 se considera manual). Se mide una vez; para repetir la detección de una canción borra su `source.leadingSilenceSec` en `data/catalog.json`. Además mide con `ffprobe` la duración de las fuentes descargadas que aún no la tienen (`source.durationSec`) y desactiva las **cortas** (duran menos de `startSec` + 16 s + 0,1 s; no hace fallar el flujo). Además añade a `data/catalog.json` los vídeos nuevos, derivando juego y título del título del vídeo. Formatos reconocidos: `Juego - Canción` y `Canción - Pokémon Juego Soundtrack` (o `OST`); el sufijo `Soundtrack`/`OST` se quita del nombre del juego. Nunca pisa entradas existentes: para regenerar un borrador sin revisar, borra `data/catalog.json` antes.
3. **Revisión** con el admin local (`npm run cli -- admin [--port 5180]`, abajo) o a mano en `data/catalog.json`: títulos, juegos, `enabled`. Un "juego" es un grupo de versiones con la misma banda sonora ("Ruby/Sapphire/Emerald" es uno). Las canciones sin juego reconocible quedan con `games: []` y hay que asignarlas a mano: hasta entonces `build`, `validate` y `upload` rechazan el catálogo.
4. `build` mide SIEMPRE la duración de las fuentes activas (desactiva y avisa de las cortas con el `startSec` efectivo, sin fallar), mide el silencio inicial de las que no lo tengan y recompila las que cambien de `startSec`; y genera `data/out/clips/<clipKey>.mp3` (un fichero por canción) solo para canciones nuevas o cambiadas (`startSec` o fuente) y copia el catálogo a `data/out/catalog/catalog.json`, que es lo que lee el backend con `STORAGE_DRIVER=fs`.
5. `validate` comprueba que hay un `<clipKey>.mp3` por canción activa con el formato de DEC-44 (256.626 bytes, 614 tramas MPEG-1 Layer III 128 kbps 44,1 kHz estéreo, sin ID3/Xing, `main_data_begin` = 0 y los offsets de los intentos en límite de trama), duración de 16 s (de -30 ms a +60 ms: sin cabecera Xing, ffprobe mide ~40-50 ms de más; la cabecera Xing no se reactiva porque sería una huella por canción), ausencia de metadatos. Falla si hay una canción corta activada (p. ej. reactivada a mano en el JSON).
6. `upload [--prune]` valida, sube solo los clips nuevos o distintos (por md5) y por último `catalog.json`. `--prune` borra del bucket los clips que ya no pertenecen a una canción activa: ejecútalo **después** de reiniciar el backend en Render (mientras siga con el catálogo viejo en memoria, serviría clips ya borrados). Sin `--prune`, reinicia el backend tras subir.

## Migración del layout antiguo (6 ficheros por canción) al clip único

Orden obligatorio (el detalle y los motivos están en DEC-44, `ARQUITECTURA.md`):

1. `build`: genera `out/clips/<clipKey>.mp3` y borra la carpeta antigua `out/clips/<clipKey>/` de esa canción solo después de generar la nueva. Las canciones con layout antiguo y sin fichero nuevo cuentan como no compiladas aunque el manifest esté al día.
2. `validate`.
3. `upload` SIN `--prune`: sube los ficheros nuevos y el catálogo; el backend antiguo sigue funcionando con las claves antiguas.
4. Desplegar el backend nuevo (el merge a `main` va DESPUÉS del paso 3: un backend nuevo sin los ficheros nuevos daría `STORAGE_ERROR` en todos los clips) y reiniciarlo.
5. `upload --prune`: borra todo lo que hay bajo `clips/` y no es `clips/<clipKey>.mp3` de una canción activa, carpetas antiguas incluidas.

## Admin local del catálogo

`npm run cli -- admin [--port 5180] [--data-dir <ruta>]` (o `npm run admin` desde la raíz) compila la UI (`admin-ui`, React + Vite) y sirve en `http://127.0.0.1:<puerto>` una página para:

- ver todas las canciones, con filtros por juego, activadas/desactivadas, revisadas/pendientes, cortas, con errores y búsqueda de texto;
- escuchar el tema COMPLETO descargado (`data/work`) con barra para moverse, sin necesidad de `build`;
- activar/desactivar, editar el título, asignar varios juegos, crear y renombrar juegos y marcar revisada. Una canción corta se ve como "Demasiado corta (7,4 s)" y no se puede activar. `startSec` no se edita aquí.

Solo escucha en `127.0.0.1`, sin login, con un token de sesión y comprobación de `Host`. Cada cambio lee y reescribe `data/catalog.json` de forma atómica; la primera escritura de cada arranque guarda `data/catalog.json.bak`. Se puede dejar abierto mientras se ejecuta `build`: no se pisan los cambios. Si faltan las dependencias de la UI, el comando indica `npm --prefix scripts/catalog/admin-ui install`. Para desarrollar la UI con recarga: `npm --prefix scripts/catalog/admin-ui run dev` (proxy a un admin ya arrancado en 5180).

`npm test` ejecuta los tests sin red (la validación contra ffmpeg real se omite si no está instalado). `npm run typecheck` comprueba tipos.
