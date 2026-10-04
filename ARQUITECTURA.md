# Pokemon Heardle - Arquitectura

Estado: version inicial implementada (main). Iteracion `feature/admin-catalogo` (DEC-36 a DEC-43, seccion 6.1; DEC-27 retirada) definida; sin preguntas abiertas. Requisitos en `REQUISITOS.md` (las decisiones de su seccion 9 no se reabren aqui).
Las preguntas de la version inicial (credencial del bucket; buscador y "juego acertado") se confirmaron el 2026-10-03.

## 1. Vision general

```
 Navegador (Vercel)                 Backend (Render free)                    Supabase (proyecto de claude-test)
 React + Vite + TS                  Node + TS + Express 5                    Storage, bucket PRIVADO `heardle-audio`
 ┌──────────────────┐  HTTPS/JSON   ┌─────────────────────────────┐  S3 API  ┌──────────────────────────────┐
 │ UI juego         │ ────────────▶ │ /api/games  (token cifrado) │ ───────▶ │ catalog/catalog.json         │
 │ localStorage:    │               │ /api/clips/:ticket (audio)  │          │ clips/<clipKey>/<1..6>.mp3   │
 │ filtro, token,   │ ◀──────────── │ catalogo en memoria         │          └──────────────────────────────┘
 │ partida diaria   │  audio/mpeg   │ cache LRU de clips          │                         ▲
 └──────────────────┘               └─────────────────────────────┘                         │ upload
                                                                       scripts/catalog (maquina del usuario)
                                                                       yt-dlp + ffmpeg -> clips + catalog.json
```

- Sin base de datos. El estado de cada partida viaja en un **token cifrado y autenticado** (AES-256-GCM) que solo el servidor puede leer.
- El audio se precorta offline (6 clips por cancion) y se sirve solo a traves del backend, con URL de un solo uso.
- El backend carga `catalog.json` del bucket al arrancar y lo mantiene en memoria.

## 2. Estructura del repositorio (monorepo, sin workspaces, como claude-test)

```
pokemon-heardle/
  README.md  REQUISITOS.md  ARQUITECTURA.md  DESARROLLO.md (guia local + despliegue)
  .gitignore  render.yaml  package.json (scripts raiz: install:all, dev con concurrently, e2e)
  shared/                     TS puro sin dependencias, importado por ruta relativa
    api.ts                    DTOs de la API (peticiones, respuestas, codigos de error)
    catalog.ts                tipos de catalog.json + validador (lo usan backend y script)
    rules.ts                  constantes de juego: CLIP_SECONDS = [1,2,4,7,11,16], MAX_ATTEMPTS = 6
    date.ts                   fecha de hoy en Europe/Madrid (la usan backend y frontend, DEC-09 y AR 7)
  backend/
    package.json tsconfig.json vitest.config.ts Dockerfile (opcional, portabilidad)
    src/
      index.ts                arranque: config, carga de catalogo, listen
      app.ts                  createApp(deps) -> Express (inyectable en tests)
      config.ts               lectura y validacion de env (falla al arrancar si falta un secreto)
      catalog/                carga, indice por id, pool del filtro (solo ilimitado)
      game/                   daily.ts (seleccion), token.ts (cifrado), tickets.ts (clips), engine.ts (reglas)
      storage/                ClipStore (interfaz), FsClipStore, S3ClipStore, LruCache
      http/                   routes.ts, errors.ts, rateLimit.ts, validate.ts
  frontend/
    package.json vite.config.ts vercel.json index.html
    src/ api/ (cliente + reintentos), game/ (estado), storage/ (localStorage), components/, hooks/
  scripts/catalog/
    package.json README.md (instalacion de yt-dlp y ffmpeg, flujo completo)
    src/ cli.ts fetch.ts draft.ts build.ts validate.ts upload.ts parseTitle.ts ffmpegArgs.ts
         catalogStore.ts      lectura tolerante y escritura atomica de catalog.json (DEC-37)
         duration.ts          medicion de la fuente y regla de cancion corta (DEC-40)
         admin/               servidor local del admin (server.ts, handlers.ts, range.ts) (DEC-36, 6.1)
    admin-ui/                 UI del admin: paquete React + Vite propio (package.json, vite.config.ts, src/, dist/ ignorado) (DEC-38)
    data/                     IGNORADO: catalog.json, work/ (descargas), out/ (clips)
    catalog.example.json      ejemplo versionado sin datos reales
  e2e/
    package.json playwright.config.ts tests/ fixtures/ (catalogo y clips sinteticos de tonos senoidales)
```

## 3. Decisiones de diseno

DEC-01: **Express 5** como framework backend.
Alternativas: Fastify.
Justificacion: es el que usa claude-test (mismas versiones, mismo patron `app.listen(0)` + `fetch` en tests de integracion). Fastify aporta rendimiento y validacion por esquema que aqui no compensan: el trafico es bajo y la API tiene 6 endpoints.

DEC-02: **Estado de partida stateless en token cifrado AES-256-GCM** (`node:crypto`, sin dependencias).
Alternativas: (a) estado en memoria del servidor; (b) JWT firmado.
Justificacion: (a) Render free duerme y reinicia, se perderian las partidas en curso y el requisito de recuperar tras recarga. (b) un JWT solo firma, el payload es base64 legible y contendria la cancion objetivo (incumple el requisito 2). GCM cifra y autentica: el cliente no puede leerlo ni alterarlo.

DEC-03: **El texto plano del token se rellena (padding) a longitud fija antes de cifrar.**
Alternativa descartada: cifrar el JSON tal cual.
Justificacion: GCM es un cifrado de flujo, la longitud del cifrado = longitud del texto. Comprobado: dos tokens con ids de cancion de 13 y 22 caracteres dan 66 y 78 caracteres de token. El cliente conoce sus propias jugadas, asi que podria deducir la longitud del id objetivo y acotar candidatos. Todo token (y todo ticket de clip) tiene la misma longitud independientemente de la cancion. Ademas el token guarda `clipKey`/id, nunca el titulo.

DEC-04: **URL de clip de un solo uso mediante ticket cifrado + registro en memoria de tickets usados.**
Alternativa: enviar el token en un POST y devolver el audio (sin URL de un solo uso).
Justificacion: cumple literalmente el requisito 2. El ticket (cifrado, padding fijo, TTL 60 s) contiene `clipKey`, numero de intento y nonce. El nonce usado se guarda en memoria hasta su expiracion; si Render reinicia se pierde, pero el TTL acota la ventana. El cliente pide un ticket nuevo via `POST /api/games/state` si lo necesita.

DEC-05: **El frontend descarga el clip con `fetch` a un Blob y lo reproduce desde `URL.createObjectURL`.**
Alternativa: `<audio src="/api/clips/...">` directo.
Justificacion: Safari iOS hace varias peticiones Range sobre un `<audio src>`, lo que rompe una URL de un solo uso. Con Blob hay una sola peticion, se puede repetir el clip sin red y se muestra un indicador de carga. El clip se precarga en cuanto empieza el intento, de modo que `audio.play()` se llama sincronamente dentro del gesto del usuario (requisito de autoplay en iOS).

DEC-06: **Clips MP3 CBR 128 kbps estereo, 44.1 kHz, sin ID3 ni cabecera Xing/LAME, normalizados con `loudnorm`.**
Alternativas: Opus/WebM (sin soporte en iOS antiguos), AAC/M4A (contenedor con mas metadatos), MP3 VBR.
Justificacion: MP3 es universal. CBR hace que el tamano del clip dependa solo de su duracion, no de la cancion; con VBR el `Content-Length` seria una huella por cancion. El script **verifica** que todos los clips de un mismo intento tienen exactamente el mismo tamano en bytes y falla si no. Presupuesto: ~660 KB por cancion (ver DEC-16). Descartado: 64 kbps mono (~330 KB/cancion): el usuario prioriza la calidad del audio sobre el espacio.

DEC-07: **Nombres en el bucket opacos**: `clips/<clipKey>/<n>.mp3`, con `clipKey` = 16 hex aleatorios generados una vez por cancion y fijos en `catalog.json`.
Justificacion: el cliente nunca ve rutas, pero si el bucket se hiciera publico por error los nombres no delatarian la cancion. Bucket dedicado `heardle-audio` dentro del proyecto Supabase de claude-test (decision cerrada en REQUISITOS 9).

DEC-08: **Acceso al bucket con claves S3 de Supabase Storage** (protocolo S3-compatible de Supabase; cliente `@aws-sdk/client-s3` apuntando al endpoint de Supabase, sin cuenta ni servicios de AWS). Bucket privado `heardle-audio` en el MISMO proyecto Supabase del Team Builder (claude-test). Confirmado por el usuario.
Alternativas descartadas: (a) `service_role` key: da acceso total al proyecto, incluida la BD del Team Builder; su fuga desde Render comprometeria el otro proyecto. (b) Proyecto Supabase nuevo: el plan free lo pausa tras 1 semana de inactividad.
Justificacion: las claves S3 solo dan acceso a Storage. Se generan en el panel de Supabase: proyecto -> Storage -> S3 Access Keys (alli se ven tambien el endpoint y la region). El secreto solo se muestra al crearlo. El acceso queda detras de la interfaz `ClipStore`.

DEC-09: **Diario sin filtro: una unica cancion por dia, la misma para todas las personas, elegida de todo el catalogo.** `idx = HMAC-SHA256(DAILY_SEED, "daily|v1|" + fecha).readUIntBE(0, 6) % songs.length` (primeros 6 bytes, big-endian; 48 bits caben exactos en un `number`, sesgo de modulo despreciable)`, con `songs` = canciones `enabled` del catalogo ordenadas por `song.id`. El filtro no interviene en el calculo, ni en el token, ni en la API de creacion de la partida diaria.
Alternativa descartada: filtro en ambos modos con una cancion del dia por combinacion de filtro (decision previa, revertida por el usuario el 2026-10-03): el usuario quiere un diario comun y comparable entre jugadores; con filtros, dos personas no jugaban la misma cancion ni sus resultados eran comparables.
- `fecha` = `YYYY-MM-DD` en Europe/Madrid via `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })` (ICU completo viene en Node). Comprobado: 2026-07-01T22:00Z -> 2026-07-02 (CEST) y 2026-12-01T23:00Z -> 2026-12-02 (CET). La zona es constante en codigo, no variable de entorno (decision cerrada).
- La fecha la fija el servidor al crear la partida y queda en el token; el cliente no envia fecha (no puede jugar dias futuros).
- Consecuencias aceptadas: la cancion puede repetirse en dias cercanos (es lo que especifica REQUISITOS 3); cambiar el catalogo en mitad del dia puede cambiar la cancion del dia para partidas nuevas (las ya empezadas no, el token guarda la cancion). Publicar cambios de catalogo cerca de las 00:00 de Madrid.

DEC-10: **Ilimitado (unico modo con filtro)**: `pool` = canciones `enabled` con algun juego del filtro; seleccion `crypto.randomInt(pool.length)` en servidor. El filtro solo se usa al crear la partida y no se guarda en el token.

DEC-11: **Catalogo publico separado del interno**. `GET /api/catalog` devuelve solo `id`, `title` y `games` de las canciones activas y la lista de juegos; nunca `clipKey`, `startSec` ni datos de YouTube.

DEC-12: **Tipos y validador del catalogo en `shared/`**, importados por ruta relativa desde backend, frontend y script.
Alternativa: copiar tipos en cada paquete, o npm workspaces.
Justificacion: el formato del catalogo lo producen el script y lo consume el backend, y los DTOs los usan front y back; copiarlos haria que divergieran. Workspaces anade complejidad que claude-test no tiene. Riesgo de despliegue anotado en seccion 12.

DEC-13: **Rate-limit en memoria con limitador propio de ventana fija de 60 s y reloj inyectable**, por IP (global, creacion de partida, acciones guess+skip, clips) y por partida (clave = nonce del token). Por partida cuentan `state`, `guess` y `skip`, incluidos los rechazos `ALREADY_GUESSED`; crear partida y `/clips` no cuentan por partida. Sin Redis: una sola instancia y perder contadores al reiniciar es aceptable.
Alternativa descartada: `express-rate-limit`, porque usa temporizadores reales y no se pueden probar las ventanas con reloj simulado.

DEC-14: **Arranque en frio sin keep-alive**. Al abrir la web el frontend llama una vez a `GET /api/health` (trafico real, permitido) y muestra "Despertando el servidor..." con reintentos con backoff hasta ~90 s. Prohibido cualquier ping periodico (REQUISITOS 9).

DEC-15: **Validacion de entrada manual** en `http/validate.ts` (como claude-test, sin zod): payloads pequenos y fijos.

DEC-16: **Originales y clips viven en local; al bucket solo van los clips** (y `catalog.json`, que el backend necesita para arrancar).
Carpeta local ignorada en git: `scripts/catalog/data/` (`work/` originales descargados, `out/clips/` clips generados, `catalog.json`). Los originales nunca se suben.
Estimacion: 6 clips = 41 s a 128 kbps = ~660 KB por cancion. 500 canciones = ~330 MB. El 1 GB de Storage del plan free se comparte con el Team Builder (que hoy no usa Storage; su BD tiene cuota aparte), asi que el techo practico es ~1500 canciones.
Egress de Supabase (plan free, ~5 GB/mes, verificar en el panel): solo se consume cuando el backend lee un clip que no esta en su cache LRU (arranques en frio y canciones del modo ilimitado). Peor caso ~660 KB por partida sin cache = ~7.500 partidas/mes sin cache antes de agotarlo. El trafico backend -> navegador cuenta contra el ancho de banda de Render (100 GB/mes en free), no contra Supabase.

DEC-17: **Buscador**: cada opcion es una cancion y muestra sus juegos. El texto se parte en palabras y CADA palabra debe aparecer en el titulo de la cancion o en el nombre de alguno de sus juegos (sin distinguir mayusculas ni acentos, texto literal): "ruby battle" encuentra los combates de Ruby/Sapphire/Emerald. Implementado una sola vez en `shared/search.ts` (`matchesAllWords`) y usado por el juego y por el admin (que ademas busca en el titulo del video). Descartado: buscar la consulta completa como una subcadena, porque no permite combinar juego y titulo ("ruby battle" no encontraba nada; peticion del usuario 2026-10-04). Muestra SIEMPRE el catalogo completo, independientemente del filtro y de si ya se acerto el juego. Confirmado por el usuario.
Alternativas descartadas: una opcion por par (cancion, juego) enviando `gameId`; limitar al pool del filtro (con un solo juego filtrado el feedback de juego seria siempre "acertado" y la lista daria pistas).
Busqueda en cliente sobre `GET /catalog` (ya cargado); el servidor solo recibe `songId`.

DEC-18: **Intento repetido NO permitido.** El buscador marca las canciones ya intentadas en la partida y no deja elegirlas; el servidor rechaza un `songId` ya intentado con `409 ALREADY_GUESSED` sin consumir intento ni emitir token nuevo. Para poder validarlo sin estado, el token guarda los `clipKey` de las canciones ya intentadas (campo `q`, longitud fija por elemento, compatible con DEC-03).
Alternativa descartada: aceptar la repeticion consumiendo intento (castiga un error de pulsacion y no aporta informacion nueva).

DEC-19: **Almacenamiento definitivo en Supabase Storage** (bucket privado en el proyecto del Team Builder, DEC-08).
Alternativas descartadas: Backblaze B2 (egress gratuito limitado a ~3x lo almacenado, ~1 GB/mes con este volumen, y 2.500 descargas/dia en free); Google Drive (mas configuracion y mas latencia).

DEC-20: **Pool ilimitado = canciones `enabled` del filtro ordenadas por `id`; `pickRandom(pool) = pool[crypto.randomInt(pool.length)]`.**
Justificacion: el mismo orden canonico que el diario hace los tests deterministas (con `randomInt` inyectado) y el resultado no depende del orden de carga del catalogo.

DEC-21: **Tipos del token**: `iat` y `exp` en segundos epoch (enteros); `r` y `q` son arrays de strings. Un `q` mal formado (no array, elemento que no es `clipKey` de 16 hex, longitud > `r.length`) o con un `clipKey` que ya no esta en el catalogo -> `TOKEN_INVALID`.
Justificacion: segundos bastan para caducidades de horas y acortan el payload; tratar igual `k` y `q` frente a canciones retiradas evita estados a medias en `ALREADY_GUESSED`.

DEC-22: **Fallo del almacen al servir un clip: el ticket NO queda consumido.** El nonce se marca como usado solo despues de obtener los bytes del clip (cache o bucket); si falla, `502 STORAGE_ERROR` y el cliente reintenta con el mismo ticket mientras no caduque.
Alternativa descartada: consumir el ticket al recibir la peticion (un fallo transitorio de Supabase obligaria a pedir ticket nuevo via `/games/state` sin motivo).

DEC-23: **`upload` incremental por md5.** `ObjectStore.list(prefix)` devuelve `{ key, md5 }` por objeto; un clip se sube si no existe o si su md5 local difiere.
Justificacion: el tamano no sirve (CBR: todos los clips de un intento pesan igual, DEC-06). En S3 el `ETag` es el md5 solo en subidas de una parte; los clips (<300 KB) se suben siempre con un `PutObject` simple. Riesgo: verificar en el primer `upload` real que el `ETag` de Supabase S3 coincide con el md5 local; si no, `upload` subiria todo cada vez (correcto pero lento).

DEC-24: **Rutas del script**: `outDir` de `build`, `validate`, `upload` y `clipOutputPath` = `scripts/catalog/data/out/clips` (`<outDir>/<clipKey>/<n>.mp3`). En local, `STORAGE_DIR` del backend apunta a `scripts/catalog/data/out`.

DEC-25: **Definicion de "juego" en el catalogo** (decision de producto del usuario): un juego es el grupo de versiones que comparten banda sonora ("Ruby / Sapphire / Emerald" es UN juego); un remake con banda sonora distinta es un juego aparte ("Omega Ruby / Alpha Sapphire"). Cada cancion lista todos los juegos en los que aparece.
Alternativas descartadas: cada version por separado (inflaria el filtro y el feedback de juego fallaria entre versiones con la misma OST); agrupar por generacion (mezcla bandas sonoras distintas).

DEC-26: **Cancion sin juego reconocible en el titulo del video**: `draft` deja `games: []` y `validate` falla, forzando la revision manual en `catalog.json`. No existe juego comodin "unknown".
Justificacion: un juego comodin pasaria la validacion y llegaria a produccion con feedback de juego erroneo.

DEC-27: **RETIRADA** (iteracion admin-catalogo, decision del usuario: no quiere compartir resultado). Definia el texto de compartir (fila de 6 emojis y cabecera con modo, fecha y marcador). Se elimina `game/share.ts` y el boton "Compartir resultado" de `ResultPanel`; `results` sigue en `GameView` porque lo usa la lista de intentos.

DEC-28: **Avisos de UI** (los tests los referencian por nombre).
- `notice.kind` del controlador de juego: `already-guessed`, `rate-limited`, `invalid-token`, `empty-filter`, `unknown-game`, `network`, `server-error` (cualquier 5xx).
- Filtro vacio, dos niveles: en `FilterPanel`, sin juegos marcados, boton "Empezar" deshabilitado y `role="alert"` con "Elige al menos un juego para poder empezar."; si el servidor responde `EMPTY_FILTER` (juegos marcados pero sin canciones activas), `notice.kind = 'empty-filter'` con "El filtro no tiene canciones disponibles. Elige otros juegos."

DEC-29: **Formato de ids**: juego `[A-Za-z0-9-]+` (admite mayusculas); cancion `[a-z0-9-]+`.

DEC-30: **Caducidades**: `exp` del token es exclusivo (en el segundo `exp` ya no vale), en segundos epoch; el ticket de clip usa milisegundos. Ticket caducado -> `410 CLIP_TICKET_USED` (mismo codigo que usado: para el cliente la accion es la misma, pedir ticket nuevo).

DEC-31: **Robustez de la API**: los campos extra en los cuerpos JSON se ignoran (p. ej. `date` en `POST /games` no permite elegir dia). Prioridad de errores en acciones: `TOKEN_INVALID` > `GAME_OVER` > `UNKNOWN_SONG` > `ALREADY_GUESSED`. Cuerpo > 4 KB -> `413 VALIDATION_ERROR`. Ruta inexistente -> `404 NOT_FOUND` generico.
Justificacion: ignorar campos extra evita romper clientes antiguos sin abrir ninguna via (el servidor nunca lee campos no definidos); la prioridad hace que primero se valide la partida y luego la jugada.

DEC-32: **`GET /catalog` lista solo los juegos con alguna cancion habilitada**, para que el filtro no ofrezca juegos que darian `EMPTY_FILTER`.

DEC-33: **Frontend sin `StrictMode`**: en desarrollo duplicaria la llamada de calentamiento a `/health` (DEC-14).

DEC-34: **`.env.example` por paquete** (`backend/`, `scripts/catalog/`, `frontend/`) en lugar de uno en la raiz: cada paquete se despliega o ejecuta por separado con sus propias variables.

DEC-35: **`tsx` es dependency (no devDependency) y `render.yaml` instala con `npm ci`**: `npm start` usa `tsx` y Render instala con `NODE_ENV=production`, que omite devDependencies. Descartado `npm ci --include=dev`: instalaba todas las devDependencies en produccion solo por `tsx`. Sin probar aun en Render.

DEC-36: **Admin del catalogo local en `scripts/catalog`, servidor `node:http` en `127.0.0.1`, sin login, con token de sesion y comprobacion de `Host`** (iteracion admin-catalogo, decision del usuario).
Alternativa descartada: admin en la web desplegada con login (mas superficie de ataque y complejidad). Express: no hace falta para 6 rutas locales y el paquete de scripts no lo tiene.
Justificacion del token y del `Host`: "sin login" no puede significar "cualquier pagina web abierta en el navegador puede escribir el catalogo"; el token aleatorio incrustado en la pagina servida bloquea peticiones de otros origenes y el `Host` bloquea DNS rebinding.

DEC-37: **Escritura de `catalog.json` atomica y por lectura-modificacion-escritura**: `catalogStore.update(mutator)` lee el fichero en ese momento, aplica el cambio, escribe en `catalog.json.tmp-<pid>` del mismo directorio, hace `fsync` y `rename`. Dentro de un proceso las operaciones se encolan. La primera escritura de cada arranque del admin copia el original a `catalog.json.bak`. Lo usan `draft`, `build` y el admin.
Alternativa descartada: que cada proceso cargue el catalogo al inicio y lo reescriba entero al final (un `build` lanzado con el admin abierto pisaria las ediciones hechas mientras tanto).
Riesgo aceptado: dos procesos escribiendo en el mismo milisegundo; no hay bloqueo entre procesos.

DEC-38: **UI del admin con React + Vite, en el paquete `scripts/catalog/admin-ui/`** (decision del usuario). Mismas versiones y convenciones que `frontend/` (React 19, Vite 8, TypeScript ~5.9, Tailwind 4, vitest + Testing Library + jsdom). Paquete aparte para que nada del admin pueda acabar en el build de Vercel ni en el backend.
- Arranque: `npm run cli -- admin` ejecuta `vite build` de `admin-ui` (segundos; asi `dist/` nunca esta desfasado) y sirve `admin-ui/dist` como estaticos desde el mismo servidor `node:http` que la API. Si faltan las dependencias de `admin-ui`, termina con un mensaje que indica `npm --prefix scripts/catalog/admin-ui install` (se anade a `install:all`, `test` y `typecheck` de la raiz).
- Desarrollo de la UI: `npm --prefix scripts/catalog/admin-ui run dev` con proxy de Vite `/api` -> servidor del admin (`changeOrigin` para que el `Host` pase la comprobacion de DEC-36).
- Token de sesion: la UI lo obtiene con `GET /api/session` (mismo origen, sin cabeceras CORS: otra web no puede leer la respuesta; el `Host` bloquea DNS rebinding). Funciona igual con `dist` servido y con el proxy de Vite, sin inyectar nada en el HTML.
Alternativas descartadas: TS sin framework empaquetado con `esbuild` (el usuario prefiere la misma pila que el frontend); Vite en modo middleware dentro del CLI (convierte Vite y React en dependencias de ejecucion del CLI, arranque mas lento y mas acoplamiento, sin ventaja para una herramienta local).
Justificacion: misma pila y convenciones que `frontend/`; la logica de filtrado vive en un modulo puro (`filters.ts`) testeable con vitest.

DEC-39: **Ids inmutables en el admin**: editar el titulo no cambia el id de la cancion; renombrar un juego solo cambia `name`. Crear juego genera id con el mismo `slugify`/`uniqueId` que `draft` (se extraen a un modulo comun del script).
Justificacion: los ids de juego estan en el filtro guardado en `localStorage` de los jugadores y los de cancion en `/catalog` y en las jugadas guardadas; cambiarlos romperia filtros y partidas en curso. Borrar o fusionar juegos queda fuera de alcance; un juego sin canciones activas no aparece en `/catalog` (DEC-32).

DEC-40: **Canciones demasiado cortas: deteccion con `ffprobe` sobre la fuente descargada, desactivacion automatica y marca derivada.**
- Se guarda la duracion medida en `source.durationSec` (dato de la fuente, nunca expuesto por el backend). `tooShort = durationSec < startSec + 16 + 0.1` (margen para el recorte y el `loudnorm`); se calcula, no se guarda como flag, asi no puede desincronizarse.
- `draft` mide las fuentes sin `durationSec`; `build` mide siempre antes de cortar (es la medida que cuenta). Si una cancion activa es corta: `enabled: false` via `catalogStore.update`, aviso en consola y se continua sin error. Nunca se activa nada automaticamente.
- `validate` falla si una cancion `enabled` es corta (cubre la reactivacion a mano en el JSON). El admin muestra la marca "Demasiado corta (7,4 s)" y bloquea activarla (`409 TOO_SHORT`).
- Datos actuales: 82 de las 293 fuentes descargadas duran menos de 16 s (sintonias); en el catalogo actual (109 canciones) afecta a 3, ya desactivadas a mano.
Alternativas descartadas: duracion de `yt-dlp --flat-playlist` (redondeada y no siempre presente; mide el video, no el fichero que se corta); que `validate` falle por canciones cortas DESACTIVADAS (decision del usuario; `validate` si falla con una corta ACTIVADA, que es un estado invalido); un flag `tooShort` persistido (se desincroniza al cambiar `startSec`).

DEC-41: **Cancion completa al terminar: embed `youtube-nocookie` con el `youtubeId` dentro de `solution`.** `SolutionView` gana `youtubeId`; el backend solo lo anade cuando la partida ha terminado (mismo punto donde hoy se construye `solution`). Nunca en `/catalog`, ni en `GameView` en curso, ni en cabeceras. El iframe solo existe en el arbol de React cuando `status !== 'playing'`, asi que no puede cargarse antes. URL: `https://www.youtube-nocookie.com/embed/<youtubeId>`. Carga del iframe: SOLO al pulsar el boton "Escuchar la cancion completa"; antes no hay iframe ni peticion a YouTube (decision del usuario). Descartado: cargarlo automaticamente al terminar (peticiones a YouTube cada vez que se reabre un diario terminado y mas datos en movil).
Alternativa descartada: servir el tema completo o un fragmento largo propio (~1,5 GB para 500 canciones, supera el 1 GB gratis de Supabase).
Justificacion de `youtube-nocookie`: no deja cookies de YouTube hasta que se reproduce.

DEC-42: **Barra de reproduccion sobre la escala fija de 16 s**, con marcas en 1/2/4/7/11 s y fin en 16; zona `0..clipSeconds[attempt]` desbloqueada y el resto bloqueada (estilo distinto); cabezal = `audio.currentTime` limitado a la zona desbloqueada (el retardo del codificador MP3 puede dar unos ms de mas). Accesible como `role="progressbar"` con `aria-valuemax` = segundos desbloqueados.
Justificacion: solo usa datos publicos (`clipSeconds`, `attempt`), no revela nada. Escala lineal como en Heardle: el segmento de 1 s ocupa ~6 % del ancho.
Decisiones de implementacion (la opcion mas simple): con la partida terminada la barra NO se muestra (FE-BAR-11); en pausa o al terminar el clip (`playing=false`) el cabezal queda en la ultima posicion (FE-BAR-08) y vuelve a 0 al cargar el clip del intento siguiente. `ClipPlayer.subscribe` emite `{ playing, positionSec }` con un `requestAnimationFrame` por frame solo mientras suena; `GameBoard` se suscribe al montar y se desuscribe (y cancela el frame) al desmontar.

DEC-43: **Sin estadisticas** (iteracion admin-catalogo, decision del usuario: no las quiere). Se eliminan `game/stats.ts`, `StatsPanel` y las claves `heardle:stats:daily` y `heardle:stats:unlimited`; al arrancar, el frontend borra esas claves si existen (limpieza idempotente de datos que ya nadie lee). Se mantiene `daily:<date>` (`DailyRecord`), necesario para no repetir el diario.
Alternativa descartada: mantener racha y distribucion.

## 4. Modelo de partida

Payload del token (JSON compacto, padding a 384 bytes, `v` para versionar):

| Campo | Contenido |
|---|---|
| `v` | version del formato (1) |
| `n` | nonce de partida, 16 hex aleatorios (clave del rate-limit por partida) |
| `m` | `d` (diario) o `u` (ilimitado) |
| `d` | fecha Madrid (solo diario) |
| `k` | `clipKey` de la cancion objetivo (longitud fija) |
| `r` | resultados por intento: `S` skip, `M` fallo, `G` juego acertado, `H` acierto |
| `q` | `clipKey` de las canciones ya intentadas (DEC-18) |
| `iat` / `exp` | emision y caducidad en segundos epoch (diario: fin del dia Madrid + 6 h; ilimitado: 24 h) (DEC-21) |

Formato en la red: `base64url(iv[12] || ciphertext || tag[16])`. Clave: HKDF-SHA256 de `GAME_TOKEN_SECRET` con etiqueta `token`; los tickets de clip usan la etiqueta `ticket` (un token no sirve como ticket ni al reves).

- Cada accion devuelve un token nuevo; el cliente guarda siempre el ultimo.
- Estado derivado: `attempt = r.length`; `won` si el ultimo es `H`; `lost` si `r.length == 6` sin `H`; si no, `playing`.
- Token que no descifra, con version distinta, caducado o cuyo `clipKey` ya no existe en el catalogo -> `TOKEN_INVALID`; el frontend descarta y ofrece partida nueva.

Evaluacion de un intento (`engine.ts`, funcion pura):
- `songId == objetivo` -> `H`, partida ganada.
- si no, si `games(elegida) ∩ games(objetivo) ≠ ∅` -> `G` (la elegida comparte algun juego con la objetivo); si no -> `M` (DEC-17).
- Skip -> `S`.
- `songId` ya intentado en la partida -> `ALREADY_GUESSED`, sin cambiar el estado (DEC-18).
- Tras el 6.o intento sin acierto -> perdida. Cualquier accion sobre una partida terminada -> `GAME_OVER`.

Ticket de clip: `{ k: clipKey, a: indice 0..5, n: nonce, exp: ahora+CLIP_TICKET_TTL_SEC }`, mismo cifrado y padding fijo. Solo se emite para el intento actual (`a = r.length`) de una partida en curso.

## 5. Contrato de la API

Base `/api`. JSON salvo el audio. El token va siempre en el cuerpo, nunca en la URL (evita logs). Errores: `{ "error": { "code": "...", "message": "texto en espanol" } }`.

| Metodo y ruta | Peticion | Respuesta 2xx |
|---|---|---|
| `GET /health` | - | `{ ok: true, catalog: true }` (503 `CATALOG_UNAVAILABLE` si no cargo) |
| `GET /catalog` | - | `{ version, games: [{ id, name }], songs: [{ id, title, games: [id] }] }` (solo juegos con canciones habilitadas, DEC-32) |
| `POST /games` | `{ mode: "daily" }` o `{ mode: "unlimited", games: [gameId] }` (`games` en diario -> `VALIDATION_ERROR`) | `GameView` |
| `POST /games/state` | `{ token }` | `GameView` (con `clipUrl` nuevo si sigue en juego) |
| `POST /games/guess` | `{ token, songId }` | `GameView` |
| `POST /games/skip` | `{ token }` | `GameView` |
| `GET /clips/:ticket` | - | `audio/mpeg` (bytes del clip del intento actual) |

```
GameView = {
  token: string,
  mode: "daily" | "unlimited",
  date?: "YYYY-MM-DD",            // solo diario; clave para "ya jugado hoy" en el cliente
  status: "playing" | "won" | "lost",
  attempt: number,                // 0..6, intentos consumidos
  maxAttempts: 6,
  clipSeconds: [1,2,4,7,11,16],
  results: ("skip" | "miss" | "game" | "hit")[],
  guesses: string[],              // songId ya intentados (propios del jugador); el buscador los deshabilita
  clipUrl?: string,               // solo si status == "playing": "/api/clips/<ticket>"
  solution?: { id, title, games: [{ id, name }], youtubeId }   // solo si status != "playing"; youtubeId para el embed (DEC-41)
}
```

Errores:

| HTTP | code | Cuando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | cuerpo mal formado, tipos incorrectos, `mode` desconocido |
| 400 | `EMPTY_FILTER` | ilimitado: `games` vacio o sin canciones activas en el pool |
| 400 | `UNKNOWN_GAME` | ilimitado: algun id de juego no existe |
| 400 | `UNKNOWN_SONG` | `songId` no existe |
| 401 | `TOKEN_INVALID` | no descifra, version distinta, caducado, cancion retirada |
| 409 | `GAME_OVER` | accion sobre partida terminada |
| 409 | `ALREADY_GUESSED` | `songId` ya intentado en esta partida; no consume intento |
| 410 | `CLIP_TICKET_USED` | ticket ya usado o caducado (DEC-30) |
| 404 | `CLIP_TICKET_INVALID` | ticket que no descifra |
| 429 | `RATE_LIMITED` | limite superado (cabecera `Retry-After`) |
| 502 | `STORAGE_ERROR` | fallo leyendo el bucket |
| 503 | `CATALOG_UNAVAILABLE` | catalogo no cargado |
| 413 | `VALIDATION_ERROR` | cuerpo > 4 KB (DEC-31) |
| 404 | `NOT_FOUND` | ruta inexistente |

Respuestas de `/clips`:
- Cabeceras: `Content-Type: audio/mpeg`, `Content-Length`, `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`. Sin `ETag`, `Last-Modified`, `Content-Disposition` ni `Accept-Ranges`.
- `app.set('etag', false)` y `app.disable('x-powered-by')` en toda la app: comprobado que Express 5 anade por defecto `ETag: W/"<hash del cuerpo>"` a un Buffer, lo que seria una huella del clip.
- Respuestas JSON de `/games/*` tambien con `Cache-Control: no-store`.
- CORS: solo `ALLOWED_ORIGIN`, sin `exposedHeaders`.

## 6. Catalogo y script

`catalog.json` (fuente de verdad interna; ignorado en git y subido al bucket en `catalog/catalog.json`):

```json
{
  "version": 1,
  "generatedAt": "2026-10-03T12:00:00Z",
  "games": [
    { "id": "rse", "name": "Pokemon Ruby / Sapphire / Emerald" }
  ],
  "songs": [
    {
      "id": "rse-littleroot-town",
      "title": "Littleroot Town",
      "games": ["rse"],
      "clipKey": "9f3a1c0e5b7d2a46",
      "startSec": 0,
      "enabled": true,
      "reviewed": false,
      "source": { "youtubeId": "xxxxxxxxxxx", "videoTitle": "titulo original del video", "durationSec": 183.42 }
    }
  ]
}
```

Reglas del validador (`shared/catalog.ts`, usado por script y backend): ids unicos con el formato de DEC-29; `clipKey` unico, 16 hex; todo juego referenciado existe; `games` no vacio (DEC-26); `startSec >= 0`; `source.youtubeId` con formato `[A-Za-z0-9_-]{11}` (DEC-41); `source.durationSec` opcional, numero finito > 0 (DEC-40); cancion `enabled` y corta (DEC-40) -> error. El backend solo usa canciones con `enabled: true`.

Script `scripts/catalog` (TS con `tsx`), subcomandos idempotentes:

1. `fetch <playlistUrl>`: `yt-dlp --flat-playlist -J` para listar; descarga `bestaudio` a `data/work/<youtubeId>.*` con `--download-archive` (no repite descargas).
2. `draft`: mide con `ffprobe` la duracion de las fuentes descargadas que aun no tienen `source.durationSec` y desactiva las cortas (DEC-40); fusiona en `catalog.json` los videos nuevos (por `youtubeId`), con titulo/juego derivados del titulo del video (`parseTitle.ts`), `startSec: 0`, `reviewed: false`, `clipKey` aleatorio; si el titulo no permite deducir el juego, `games: []` (DEC-26). **Nunca sobrescribe entradas existentes** (conserva la revision manual).
3. Revision en el admin local (`npm run cli -- admin`, seccion 6.1) o a mano en `catalog.json`.
4. `build`: por cancion activa, `ffmpeg -ss startSec -t 16` -> `loudnorm` -> master de 16 s; de el, 6 clips `0..N` s con fundido de salida de 50 ms, MP3 CBR 128k estereo (`-b:a 128k`), `-map_metadata -1 -id3v2_version 0 -write_xing 0 -fflags +bitexact`, salida a `data/out/clips/<clipKey>/<n>.mp3`. Solo recompila si cambian `startSec` o el fuente. Antes de cortar mide la fuente; si es corta la desactiva, la registra en el catalogo y sigue con las demas sin fallar (DEC-40).
5. `validate`: esquema; 6 clips por cancion; duracion por `ffprobe` entre −30 ms y +60 ms de la esperada (sin cabecera Xing ffprobe mide ~40-50 ms de mas); tamano en bytes identico entre canciones para cada intento (DEC-06); sin etiquetas de metadatos (`ffprobe -show_format`). Falla con codigo != 0.
6. `upload`: ejecuta `validate`, sube clips nuevos/cambiados (por md5, DEC-23) (nunca los originales de `data/work/`) y por ultimo `catalog.json` (asi el catalogo nunca apunta a clips no subidos). `--prune` borra clips huerfanos. Tras subir, reiniciar el backend en Render para recargar el catalogo.

Toda escritura de `catalog.json` (draft, build, admin) pasa por `catalogStore.update` (DEC-37).

`README` del script: instalacion de yt-dlp (`pipx install yt-dlp` o binario oficial) y ffmpeg (`apt install ffmpeg`), y el flujo completo.

## 6.1 Admin local del catalogo (`npm run cli -- admin`)

```
 navegador (localhost)            scripts/catalog (node:http, 127.0.0.1)          disco (data/, ignorado)
 ┌──────────────────────┐  JSON  ┌──────────────────────────────────┐  update()  ┌───────────────────────┐
 │ UI admin (React +    │ ─────▶ │ admin/handlers.ts                │ ─────────▶ │ catalog.json (atomico)│
 │ Vite): lista,        │        │  - Host + X-Admin-Token          │            │ work/<youtubeId>.*    │
 │ filtros, edicion,    │ ◀───── │ admin/range.ts (audio con Range) │ ◀───────── │ (fuentes completas)   │
 │ <audio> con seek     │  audio └──────────────────────────────────┘   lectura  └───────────────────────┘
 └──────────────────────┘
```

- Arranque: `npm run cli -- admin [--port 5180] [--data-dir <ruta>]`. Escucha SOLO en `127.0.0.1`, imprime la URL y no abre nada en red. `--data-dir` (por defecto `scripts/catalog/data`) existe para que los tests apunten a un directorio temporal y nunca toquen el real (DEC-36).
- UI: paquete React + Vite `scripts/catalog/admin-ui`, compilado al arrancar y servido por el mismo servidor (DEC-38).
- `startSec` NO se edita en el admin: las canciones empiezan siempre en el segundo 0 salvo edicion manual de `catalog.json` (decision del usuario; descartado el campo con boton "usar posicion actual"). El reproductor del tema completo sirve para revisar, no para elegir el inicio.
- Estado: el servidor no cachea el catalogo; cada operacion lee el fichero, aplica el cambio y escribe de forma atomica (DEC-37). La UI recarga la lista tras cada cambio y al recuperar el foco.
- El catalogo puede ser invalido (p. ej. `games: []` tras `draft`): el admin lo carga igualmente con lectura tolerante y muestra los errores de `validateCatalog` por cancion; precisamente sirve para corregirlos.

Contrato local (prefijo `/api`, JSON; mutaciones con cabecera `X-Admin-Token`):

| Metodo y ruta | Peticion | Respuesta |
|---|---|---|
| `GET /`, `GET /assets/*` | - | estaticos de `admin-ui/dist` |
| `GET /api/session` | - | `{ token }` (aleatorio por arranque) |
| `GET /api/catalog` | - | `{ games: [{ id, name, songCount }], songs: [AdminSong] }` |
| `PATCH /api/songs/:id` | `{ title?, games?, enabled?, reviewed? }` (`startSec` no es editable) | `AdminSong` |
| `POST /api/games` | `{ name }` | `{ id, name }` (id = slug unico del nombre, como en `draft`) |
| `PATCH /api/games/:id` | `{ name }` | `{ id, name }` (solo cambia el nombre, DEC-39) |
| `GET /api/songs/:id/audio` | cabecera `Range` opcional | fuente completa de `data/work`, `200`/`206`/`416` |

```
AdminSong = Song & {
  durationSec?: number,      // de source.durationSec
  tooShort: boolean,         // derivado: durationSec < startSec + 16 + margen (DEC-40)
  hasSource: boolean,        // existe data/work/<youtubeId>.*
  errors: string[]           // errores de validateCatalog que mencionan esta cancion
}
```

Reglas fijadas en la implementacion del admin:
- `PATCH /api/songs/:id` acepta solo `title`, `games`, `enabled` y `reviewed`; cualquier otra clave (`startSec` incluido, DEC-38), un cuerpo vacio, `games: []` o activar una cancion sin juegos -> `400 VALIDATION_ERROR`. Todo o nada: si falla una regla (p. ej. `409 TOO_SHORT`) no se guarda ningun campo.
- `songCount` = canciones que listan el juego, activas o no. Nombres de juego duplicados se detectan sin distinguir mayusculas, acentos ni espacios repetidos. Dos nombres con el mismo slug -> el segundo recibe id con sufijo (`-2`, igual que `draft`).
- Audio: un `Range` mal formado o de varios tramos se ignora (`200` completo); fuera del fichero -> `416` con `Content-Range: bytes */N`. La autorizacion del audio es solo el `Host` (un `<audio>` no envia cabeceras).
- Host duplicado o ausente -> `403`.

Errores locales: `400 VALIDATION_ERROR` (titulo vacio, juego inexistente o repetido, nombre de juego vacio o duplicado), `403 FORBIDDEN` (Host o token incorrectos), `404 NOT_FOUND`, `409 TOO_SHORT` (activar una cancion corta), `416` (Range fuera del fichero).

Filtros y busqueda en la UI (en cliente, sobre `/api/catalog`): juego, activadas/desactivadas, revisadas/pendientes, cortas, con errores, y texto sobre titulo, nombre de juego y titulo del video (sin distinguir mayusculas ni acentos, como DEC-17).

## 7. Frontend (lo que condiciona la arquitectura)

- Al abrir: `GET /health` (DEC-14) -> `GET /catalog`. Estados de UI: despertando / listo / error con boton de reintento.
- Filtro: SOLO en modo ilimitado. Ids de juego en `localStorage`; filtro vacio deshabilita "Empezar" en ilimitado. Un cambio de filtro con partida ilimitada en curso solo aplica a la siguiente. El modo diario no muestra filtro.
- `localStorage` (prefijo `heardle:`): `filter`; `daily:<date>` -> `DailyRecord = { token, finished, view? }`, donde `view` es la `GameView` final (con `solution` y `results`), para mostrar un diario terminado sin llamar a la API; `unlimited` -> partida en curso. (RETIRADAS: `stats:daily` y `stats:unlimited`, DEC-43.) Durante la partida solo hay token cifrado y las jugadas propias.
- Apertura del modo diario, sin crear partidas innecesarias en servidor:
  1. El cliente calcula la fecha de hoy en Europe/Madrid con `Intl` (misma funcion que el servidor, en `shared/`).
  2. Si existe `daily:<fecha>` terminada -> muestra el resultado, sin boton de jugar, y no llama a la API.
  3. Si existe en curso -> `POST /games/state` con su token.
  4. Si no existe -> `POST /games { mode: "daily" }`. Si la `date` devuelta por el servidor difiere de la calculada (reloj del cliente desviado o cambio de dia en ese instante), manda la del servidor: si esa fecha ya esta terminada en `localStorage` se muestra el resultado y se descarta el token nuevo (crear partida no deja estado en servidor).
- Recarga: `POST /games/state` con el token guardado; `TOKEN_INVALID` -> partida nueva.
- Buscador: deshabilita los `guesses` de la `GameView` (DEC-18); si aun asi llega `ALREADY_GUESSED`, se muestra aviso y se mantiene el intento.
- (RETIRADO: compartir resultado, DEC-27; estadisticas, DEC-43.) `ResultPanel` muestra la solucion y el boton de la cancion completa (DEC-41).
- Buscador segun DEC-17, filtrado en cliente sobre `/catalog`.
- Tailwind 4, modo oscuro por `prefers-color-scheme`, responsive. Interfaz en espanol sin i18n (un solo idioma).
- Barra de reproduccion (DEC-42): `ClipProgressBar({ clipSeconds, unlockedSec, positionSec, playing })`. `ClipPlayer` amplia su interfaz con `subscribe(listener) -> unsubscribe`, que emite `{ playing, positionSec }` con `requestAnimationFrame` mientras suena y al parar/terminar.
- Cancion completa al terminar (DEC-41): componente `FullSongEmbed({ youtubeId })` dentro de `ResultPanel`, renderizado solo cuando `status !== 'playing'` y existe `solution`. Muestra el boton "Escuchar la cancion completa"; el iframe se crea al pulsarlo y en ese momento se para el clip.

## 8. Seguridad

- Ningun dato de la cancion objetivo sale del servidor antes de terminar: token y tickets cifrados con longitud fija; rutas opacas; sin ETag; clips CBR de tamano fijo por intento; sin metadatos en el MP3.
- Secretos solo en variables de entorno; `config.ts` aborta el arranque si faltan o son cortos (`GAME_TOKEN_SECRET` >= 32 bytes en base64).
- Bucket privado; credenciales de solo backend/script, nunca en el frontend.
- Entrada validada en cada endpoint; tamano de cuerpo limitado (`express.json({ limit: '4kb' })`).
- `trust proxy` = 1 (Render pone un proxy delante) para que el rate-limit use la IP real; configurable por env por portabilidad.
- Embed de YouTube (DEC-41): `youtubeId` validado con `[A-Za-z0-9_-]{11}` en `shared/catalog.ts` y codificado al construir la URL; `vercel.json` anade `Content-Security-Policy: frame-src https://www.youtube-nocookie.com` (solo restringe iframes; no hay CSP global hoy). El iframe usa `referrerpolicy="strict-origin-when-cross-origin"` (YouTube rechaza embeds sin `Referer`) y `allow="encrypted-media; picture-in-picture; fullscreen"`.
- Admin local (DEC-36): solo `127.0.0.1`; rechaza `Host` distinto de `127.0.0.1:<puerto>` / `localhost:<puerto>` (defensa ante DNS rebinding); mutaciones con `X-Admin-Token` aleatorio por arranque (una web cualquiera abierta en el navegador no puede hacer POST/PATCH al admin); solo `Content-Type: application/json`, cuerpo <= 16 KB. El audio se localiza por id de cancion via el catalogo, nunca con rutas del cliente (sin path traversal).
- Rutas para ffmpeg/ffprobe siempre absolutas: 6 de los 291 `youtubeId` actuales empiezan por `-` y, con ruta relativa, ffprobe los interpreta como opcion (comprobado: `ffprobe -BRQ_XVwg-M.webm` -> "Missing argument for option"). El codigo actual ya usa rutas absolutas; `duration.ts` y el admin deben mantenerlo.
- Limitaciones aceptadas (no se mitigan, se documentan): Shazam/grabacion; un cliente puede reutilizar un token antiguo o abrir partidas diarias nuevas en otro navegador para probar canciones por fuerza bruta (sin BD no hay forma de impedirlo; el rate-limit lo encarece); un atacante paciente puede construir una tabla hash(clip 1) -> cancion jugando en ilimitado (equivale a reconocer el audio).

Rate-limit (valores por defecto, ajustables por env):

| Ambito | Limite |
|---|---|
| IP, todo `/api` | 120 / min |
| IP, `POST /games` | 20 / min |
| IP, `/games/guess` + `/games/skip` | 40 / min |
| IP, `/clips` | 30 / min |
| Partida (nonce), acciones | 12 / min |

## 9. Rendimiento

- Catalogo en memoria (indice por id y por juego); seleccion diaria O(pool).
- Cache LRU de clips en memoria limitada por bytes (`CLIP_CACHE_MB`, defecto 32): los clips de la cancion del dia se piden muchas veces. Render free tiene 512 MB.
- Clips pequenos (16-260 KB); sin transcodificacion en servidor (decision cerrada).
- Arranque: descarga de `catalog.json` antes de `listen`; si falla, se escucha igualmente, `/health` devuelve 503 y se reintenta en segundo plano con backoff.

## 10. Variables de entorno

Backend:

| Variable | Ejemplo / defecto | Uso |
|---|---|---|
| `PORT` | 3002 | puerto (Render lo inyecta) |
| `NODE_ENV` | production | |
| `ALLOWED_ORIGIN` | https://pokemon-heardle.vercel.app | CORS |
| `GAME_TOKEN_SECRET` | 32+ bytes base64 | clave maestra de tokens y tickets |
| `DAILY_SEED` | cadena aleatoria larga | semilla de la cancion diaria; cambiarla cambia todas las canciones del dia |
| `STORAGE_DRIVER` | `s3` (prod) / `fs` (local, tests) | |
| `STORAGE_DIR` | ../scripts/catalog/data/out | raiz local con `catalog/` y `clips/` (driver fs) |
| `STORAGE_BUCKET` | heardle-audio | driver s3 |
| `STORAGE_S3_ENDPOINT` | https://<ref>.supabase.co/storage/v1/s3 | driver s3 |
| `STORAGE_S3_REGION` | region del proyecto | driver s3 |
| `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | | driver s3; se generan en Storage -> S3 Access Keys (DEC-08) |
| `CLIP_TICKET_TTL_SEC` | 60 | |
| `CLIP_CACHE_MB` | 32 | |
| `TRUST_PROXY` | 1 | |
| `RATE_LIMIT_GLOBAL` | 120 | por IP, todo `/api`, peticiones/min |
| `RATE_LIMIT_CREATE_GAME` | 20 | por IP, `POST /games` |
| `RATE_LIMIT_ACTION` | 40 | por IP, `/games/guess` + `/games/skip` |
| `RATE_LIMIT_CLIPS` | 30 | por IP, `/clips` |
| `RATE_LIMIT_PER_GAME` | 12 | por partida (nonce), acciones |

Frontend: `VITE_API_URL` (URL del backend en Render; en local Vite proxifica `/api`, como claude-test).
Script: mismas `STORAGE_*` que el backend (en `scripts/catalog/.env`, ignorado).

## 11. Estrategia de tests

Versiones alineadas con claude-test: vitest 4, TypeScript (backend ^6, frontend ~5.9), React 19, Vite 8, Tailwind 4, Playwright para E2E.

Unitarios backend (vitest):
- `daily`: mismo dia -> misma cancion independientemente de cualquier filtro; seleccion sobre todo el catalogo `enabled`; catalogo de 1 cancion; cambio de dia en Madrid en horario de verano (22:00Z) e invierno (23:00Z) y en los dias de cambio de hora. `POST /games` diario con `games` -> `VALIDATION_ERROR`.
- `catalog` (ilimitado): pool por filtro, filtro vacio, juego inexistente, pool de 1.
- `token`: ida y vuelta; un byte alterado -> invalido; caducado -> invalido; **longitud identica para ids de cancion de distinta longitud y para 0..6 resultados**; el token no contiene en claro id, titulo ni `clipKey`; token no valido como ticket y viceversa.
- `engine`: H/G/M/S; cancion en varios juegos (interseccion); 6.o fallo -> perdida; accion tras fin -> `GAME_OVER`; cancion repetida -> `ALREADY_GUESSED` sin consumir intento ni cambiar el token.
- `tickets`: un solo uso; caducidad; el indice corresponde al intento actual; la duracion servida para el intento N es `CLIP_SECONDS[N]`.
- `shared/catalog`: validador con casos invalidos (ids duplicados, juego inexistente, `clipKey` mal formado, `youtubeId` fuera de formato, `durationSec` invalido, cancion activa y corta).
- `engine`/vista: `solution.youtubeId` presente al ganar y al perder, ausente en partidas en curso.

Integracion backend (vitest, `createApp` + `app.listen(0)` + `fetch`, como claude-test; `FsClipStore` con catalogo y clips de prueba):
- Flujo completo ganar/perder/skip; recuperacion con `/games/state`; errores de la tabla de la seccion 5; 429 con `Retry-After`.
- **Prueba de fuga**: durante una partida completa, se serializan todas las respuestas (cuerpo y cabeceras) antes del final y se comprueba que no aparecen id, titulo, `clipKey`, `youtubeId` ni nombre de fichero de la cancion objetivo. Tras terminar, `youtubeId` aparece SOLO dentro de `solution`; `/catalog` no lo contiene nunca.
- Cabeceras de `/clips`: sin ETag, con `no-store`; segunda peticion al mismo ticket -> 410.

Frontend (vitest + Testing Library + jsdom):
- Sin compartir ni estadisticas (DEC-27, DEC-43): limpieza de las claves `stats:*` antiguas; filtro solo visible en ilimitado y vacio deshabilita empezar; apertura del diario sin llamada a la API si ya esta terminado; buscador deshabilita canciones ya intentadas; hook de arranque en frio con temporizadores falsos; recuperacion con `TOKEN_INVALID`; `ClipProgressBar` (posicion de marcas, zona desbloqueada por intento, limite del cabezal); `ClipPlayer.subscribe` con un audio falso; `FullSongEmbed` ausente en juego; al terminar, boton sin iframe hasta pulsarlo; tras pulsar, URL `youtube-nocookie` y `referrerpolicy`.

Script (vitest): `parseTitle`, fusion de `draft` (no pisa entradas revisadas), construccion de argumentos de ffmpeg (funciones puras). Iteracion admin-catalogo, siempre con `--data-dir` en un directorio temporal:
- `catalogStore`: escritura atomica (un fallo a mitad deja el original intacto), operaciones encoladas, `.bak` solo en la primera escritura.
- Regla de cancion corta en el limite exacto (`startSec + 16 + 0.1`), desactivacion en `draft`/`build` sin tocar otros campos ni activar nada, `validate` con cancion activa y corta.
- Handlers del admin: `PATCH` de cada campo, `TOO_SHORT`, juego inexistente o duplicado, crear/renombrar juego sin cambiar id, `403` sin token y con `Host` ajeno, audio por id (no por ruta), `Range` (`bytes=0-`, `bytes=a-b`, sufijo, fuera de rango -> 416), `youtubeId` con `-` inicial.
- `admin-ui` (vitest + Testing Library): modulo puro de filtros/busqueda, edicion de titulo y juegos, bloqueo de activar cancion corta, obtencion del token via `/api/session`; `PATCH` con `startSec` -> ignorado/rechazado. `validate` se ejecuta contra fixtures si ffmpeg esta instalado; si no, se marca omitido.

E2E (Playwright en `e2e/`, backend con driver `fs` y fixtures de tonos senoidales generados con ffmpeg y versionados, sin copyright):
- Partida ganada, perdida y con skips; feedback de juego acertado/fallado; revelacion final y bloqueo posterior.
- Recarga en mitad de partida; diario ya jugado (sin `POST /games`); diario igual en dos navegadores; ilimitado: filtro vacio, pool de una cancion, cambio de filtro a mitad; cancion ya intentada no seleccionable.
- Fuga: recoger todas las respuestas de red y el `localStorage` antes de terminar y buscar el titulo/id objetivo (criterio 1).
- Arranque en frio simulado (`page.route` devuelve 503 / retrasa `/health`): la UI muestra carga y se recupera (criterio 8).
- Viewport movil (iPhone, WebKit) y `colorScheme: 'dark'`.
- Barra de reproduccion visible al reproducir, con la zona desbloqueada creciendo con cada intento.
- Al terminar (ganar y perder) aparece el boton y el iframe solo tras pulsarlo; antes de pulsar no hay iframe ni peticiones a `youtube-nocookie.com` (interceptadas con `page.route` para no depender de YouTube).
- Admin (opcional, Playwright contra `npm run cli -- admin --data-dir <tmp>`): editar, filtrar y oir con seek.

## 12. Despliegue

- Repo GitHub privado (cerrado). `.gitignore`: `node_modules`, `dist`, `.env*` (salvo `.env.example`), `scripts/catalog/data/`, `e2e/test-results`, `*.mp3` fuera de `e2e/fixtures`.
- Backend: `render.yaml` en la raiz (servicio `pokemon-heardle-backend`, `rootDir: backend`, `npm ci` (DEC-35), `npm start` con `tsx` como claude-test), plan free, sin health-check periodico propio ni cron. `Dockerfile` opcional para migrar.
- Frontend: Vercel con raiz `frontend`, `vercel.json` con rewrite a `index.html`, `VITE_API_URL`.
- Storage: crear bucket privado `heardle-audio` en el proyecto Supabase de claude-test y claves en Storage -> S3 Access Keys (DEC-08).
- Orden de puesta en marcha: bucket -> script (`fetch`, `draft`, revision, `build`, `upload`) -> backend -> frontend.
- `DESARROLLO.md` documentara entorno local (driver `fs`, sin Supabase) y despliegue.

## 13. Riesgos tecnicos

- **`shared/` fuera de las raices de despliegue**: Render (`rootDir: backend`) y Vercel (raiz `frontend`) deben ver `../shared`. Render clona el repo completo; Vercel lo permite con "Include files outside the Root Directory" (activo por defecto). Verificar en el primer despliegue; plan B: compilar `shared` dentro de cada paquete en el build.
- **Horas de Render compartidas con el Team Builder** (cerrado en REQUISITOS 9): sin keep-alive; vigilar consumo mensual.
- **Arranque en frio** de 30-60 s: mitigado solo en UI.
- **yt-dlp** cambia a menudo por cambios de YouTube: fijar version en el README y actualizar cuando falle.
- **`trust proxy`** mal configurado haria que todas las peticiones compartan IP en el rate-limit o permitiria falsear la IP; probar en Render con `X-Forwarded-For`.
- **Cambio de catalogo a mitad de dia** cambia la cancion diaria de partidas nuevas (DEC-09); ahora afecta a cualquier alta o baja en el catalogo, no solo a un juego concreto.
- **Embed de YouTube**: videos retirados, privados o con el embed desactivado muestran el error de YouTube; no se detecta de antemano (fuera de alcance comprobarlo en `validate`, requiere red).
- **Escritura concurrente del catalogo entre procesos** (admin + `draft`/`build`): ventana de milisegundos sin bloqueo (DEC-37).
- **Tickets usados en memoria**: tras un reinicio un ticket aun no caducado (<= 60 s) podria reutilizarse una vez mas; impacto nulo (mismo clip del mismo intento).

## 14. Fuera de alcance tecnico

Admin desplegado o con login, borrado y fusion de juegos en el admin, oir los 6 fragmentos en el admin, editar `startSec` en el admin, comprobar en `validate` que los videos siguen siendo embebibles, CSP global del frontend, cuentas de usuario, base de datos, ranking global, sincronizacion de estadisticas entre dispositivos, anti-trampas mas alla del rate-limit, CDN para el audio, recorte en servidor, keep-alive, i18n, PWA/offline.

## Preguntas abiertas

Ninguna. Las de la iteracion admin-catalogo se cerraron el 2026-10-04: `startSec` no editable en el admin (6.1), embed al pulsar (DEC-41), UI del admin con React + Vite (DEC-38).
