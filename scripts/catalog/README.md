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
3. **Revisión** con el admin local (`npm run cli -- admin [--port 5180]`, abajo) o a mano en `data/catalog.json`: títulos, juegos, `enabled`. Un "juego" es un grupo de versiones con la misma banda sonora ("Ruby/Sapphire/Emerald" es uno). Las canciones sin juego reconocible quedan con `games: []` y hay que asignarlas a mano: hasta entonces `build`, `validate` y `upload` rechazan el catálogo. Cada canción pertenece a **exactamente un juego** (DEC-53). El orden de la lista `games` de `catalog.json` es el orden de salida: es el orden en que el juego y el admin muestran los juegos y el que usa la pista de fecha (DEC-48, DEC-50); Red/Blue/Yellow va primero.

### Juego nuevo: orden, consolas, serie y grupo de selección

`draft` añade los juegos nuevos **al final** de `games` y **sin consolas**. Hay que completarlos a mano; no hay tabla por defecto:

1. **Mover el juego nuevo a su sitio en `games`**, por fecha de salida, editando `data/catalog.json` (el admin no reordena).
2. **Asignar las consolas** (`consoles`, DEC-51): en el admin (casillas "Consolas del juego" + "Guardar consolas") o a mano. Valores: `GB`, `GBC`, `GBA`, `GC` (GameCube), `DS`, `3DS`, `Switch`, `Switch 2`, en ese orden canónico y sin repetir (Legends Z-A: `["Switch", "Switch 2"]`). `validate` y `upload` rechazan un juego con canciones activas sin consolas; el admin lo marca con "Sin consola".
3. **Serie** (DEC-60): un spin-off (Mundo Misterioso, Ranger, Colosseum, XD…) lleva `"series": "spinoff"`, o se elige "Spin-off" en el desplegable "Serie" del admin. Sin el campo, el juego es de la serie principal. Solo los juegos `spinoff` entran en el diario de spin-offs y solo los principales en el diario normal; añadir spin-offs no cambia la canción del día principal. Cada spin-off con banda sonora distinta es un juego aparte (DEC-25). Un grupo de selección no puede mezclar series.
4. **Grupo de selección** (opcional, DEC-54): por defecto cada juego es su propio grupo y todos los grupos son equiprobables al elegir canción. Para que dos juegos con la misma banda sonora pesen como uno (p. ej. Black/White y Black 2/White 2), pon en el segundo `"selectionGroup": "<id del primero>"`, o elígelo en el desplegable "Grupo de selección" del admin. El destino debe ser un juego que no esté él mismo en otro grupo (sin cadenas ni ciclos); "Su propio grupo" lo quita. No cambia el filtro del modo libre ni el orden de `games`.
5. `build` mide SIEMPRE la duración de las fuentes activas (desactiva y avisa de las cortas con el `startSec` efectivo, sin fallar), mide el silencio inicial de las que no lo tengan y recompila las que cambien de `startSec`; y genera `data/out/clips/<clipKey>.mp3` (un fichero por canción) solo para canciones nuevas o cambiadas (`startSec` o fuente) y copia el catálogo a `data/out/catalog/catalog.json`, que es lo que lee el backend con `STORAGE_DRIVER=fs`.
6. `validate` comprueba que hay un `<clipKey>.mp3` por canción activa con el formato de DEC-44 (256.626 bytes, 614 tramas MPEG-1 Layer III 128 kbps 44,1 kHz estéreo, sin ID3/Xing, `main_data_begin` = 0 y los offsets de los intentos en límite de trama), duración de 16 s (de -30 ms a +60 ms: sin cabecera Xing, ffprobe mide ~40-50 ms de más; la cabecera Xing no se reactiva porque sería una huella por canción), ausencia de metadatos. Falla si hay una canción corta activada (p. ej. reactivada a mano en el JSON).
7. `upload [--prune | --clips-only]` valida, sube solo los clips nuevos o distintos (por md5) y por último `catalog.json`. Con `--clips-only` sube solo los clips y no toca el catálogo publicado: sirve para adelantar la parte lenta cuando el catálogo nuevo necesita antes desplegar la función (por ejemplo, una consola nueva). No se combina con `--prune`. `--prune` borra del bucket los clips que ya no pertenecen a una canción activa: ejecútalo **después** de volver a desplegar la función (`npm run deploy:edge`; mientras siga con el catálogo viejo en memoria, serviría clips ya borrados). Sin `--prune`, vuelve a desplegar la función tras subir.

### Duplicados y reversiones por audio: `similar`

`npm run cli -- similar <juegoId> [--threshold 0.8] [--all]` compara entre sí las canciones de un juego que tienen el audio descargado en `data/work/` y lista las parejas que suenan igual, de mayor a menor similitud. Analiza 90 s de cada fuente desde su `startSec` y no modifica nada. Por defecto solo mira las activas; `--all` incluye las desactivadas, marcadas `[desactivada]`. Tarda ~1 min con 130 canciones.

Úsalo después de `draft` cuando un juego mezcla fuentes (dos playlists, o una playlist añadida sobre otra), porque la misma pista suele llegar con títulos distintos según el canal ("Hurry Along" / "Follow me!"). De cada pareja deja activa una (la base, si es una reversión) y desactiva la otra. Referencia del umbral (DEC-56): la misma pista da 0,82-0,98; pistas distintas del mismo juego, 0,79 como mucho. Entre 0,75 y 0,85 compruébalo de oído. Los audios de menos de 3 s no se comparan.

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
- activar/desactivar, editar el título, asignar el juego de la canción (uno solo), crear y renombrar juegos, editar sus consolas, su serie (principal o spin-off) y su grupo de selección y marcar revisada. Una canción corta se ve como "Demasiado corta (7,4 s)" y no se puede activar. `startSec` no se edita aquí.

Solo escucha en `127.0.0.1`, sin login, con un token de sesión y comprobación de `Host`. Cada cambio lee y reescribe `data/catalog.json` de forma atómica; la primera escritura de cada arranque guarda `data/catalog.json.bak`. Se puede dejar abierto mientras se ejecuta `build`: no se pisan los cambios. Si faltan las dependencias de la UI, el comando indica `npm --prefix scripts/catalog/admin-ui install`. Para desarrollar la UI con recarga: `npm --prefix scripts/catalog/admin-ui run dev` (proxy a un admin ya arrancado en 5180).

`npm test` ejecuta los tests sin red (la validación contra ffmpeg real se omite si no está instalado). `npm run typecheck` comprueba tipos.
