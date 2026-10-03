# Pokemon Heardle - Arquitectura

Estado: arquitectura definida, sin codigo ni git init. Requisitos en `REQUISITOS.md` (las decisiones de su seccion 9 no se reabren aqui).
Sin preguntas abiertas: P1 (credencial del bucket) y P2 (buscador y "juego acertado") confirmadas por el usuario el 2026-10-03.

## 1. Vision general

```
 Navegador (Vercel)                 Backend (Render free)                    Supabase (proyecto de claude-test)
 React + Vite + TS                  Node + TS + Express 5                    Storage, bucket PRIVADO `heardle-audio`
 ┌──────────────────┐  HTTPS/JSON   ┌─────────────────────────────┐  S3 API  ┌──────────────────────────────┐
 │ UI juego         │ ────────────▶ │ /api/games  (token cifrado) │ ───────▶ │ catalog/catalog.json         │
 │ localStorage:    │               │ /api/clips/:ticket (audio)  │          │ clips/<clipKey>/<1..6>.mp3   │
 │ filtro, token,   │ ◀──────────── │ catalogo en memoria         │          └──────────────────────────────┘
 │ estadisticas     │  audio/mpeg   │ cache LRU de clips          │                         ▲
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
    src/ api/ (cliente + reintentos), game/ (estado, share), storage/ (localStorage), components/, hooks/
  scripts/catalog/
    package.json README.md (instalacion de yt-dlp y ffmpeg, flujo completo)
    src/ cli.ts fetch.ts draft.ts build.ts validate.ts upload.ts parseTitle.ts ffmpegArgs.ts
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

DEC-17: **Buscador**: cada opcion es una cancion y muestra sus juegos. El texto busca por coincidencia en el titulo de la cancion O en el nombre de cualquiera de sus juegos (sin distinguir mayusculas ni acentos). Muestra SIEMPRE el catalogo completo, independientemente del filtro y de si ya se acerto el juego. Confirmado por el usuario.
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

DEC-27: **Texto de compartir**: una fila de 6 emojis consecutivos sin espacios (resultados + ⬜ por intento no usado); la cabecera (modo, fecha en diario y marcador `3/6` o `X/6`) es texto libre que fija el desarrollador y nunca incluye la cancion.

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
  solution?: { id, title, games: [{ id, name }] }   // solo si status != "playing"
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
      "source": { "youtubeId": "xxxxxxxxxxx", "videoTitle": "titulo original del video" }
    }
  ]
}
```

Reglas del validador (`shared/catalog.ts`, usado por script y backend): ids unicos con el formato de DEC-29; `clipKey` unico, 16 hex; todo juego referenciado existe; `games` no vacio (DEC-26); `startSec >= 0`. El backend solo usa canciones con `enabled: true`.

Script `scripts/catalog` (TS con `tsx`), subcomandos idempotentes:

1. `fetch <playlistUrl>`: `yt-dlp --flat-playlist -J` para listar; descarga `bestaudio` a `data/work/<youtubeId>.*` con `--download-archive` (no repite descargas).
2. `draft`: fusiona en `catalog.json` los videos nuevos (por `youtubeId`), con titulo/juego derivados del titulo del video (`parseTitle.ts`), `startSec: 0`, `reviewed: false`, `clipKey` aleatorio; si el titulo no permite deducir el juego, `games: []` (DEC-26). **Nunca sobrescribe entradas existentes** (conserva la revision manual).
3. Revision manual de `catalog.json` (titulos, juegos, `startSec`, `enabled`).
4. `build`: por cancion activa, `ffmpeg -ss startSec -t 16` -> `loudnorm` -> master de 16 s; de el, 6 clips `0..N` s con fundido de salida de 50 ms, MP3 CBR 128k estereo (`-b:a 128k`), `-map_metadata -1 -id3v2_version 0 -write_xing 0 -fflags +bitexact`, salida a `data/out/clips/<clipKey>/<n>.mp3`. Solo recompila si cambian `startSec` o el fuente.
5. `validate`: esquema; 6 clips por cancion; duracion por `ffprobe` dentro de ±30 ms de la esperada; tamano en bytes identico entre canciones para cada intento (DEC-06); sin etiquetas de metadatos (`ffprobe -show_format`). Falla con codigo != 0.
6. `upload`: ejecuta `validate`, sube clips nuevos/cambiados (por md5, DEC-23) (nunca los originales de `data/work/`) y por ultimo `catalog.json` (asi el catalogo nunca apunta a clips no subidos). `--prune` borra clips huerfanos. Tras subir, reiniciar el backend en Render para recargar el catalogo.

`README` del script: instalacion de yt-dlp (`pipx install yt-dlp` o binario oficial) y ffmpeg (`apt install ffmpeg`), y el flujo completo.

## 7. Frontend (lo que condiciona la arquitectura)

- Al abrir: `GET /health` (DEC-14) -> `GET /catalog`. Estados de UI: despertando / listo / error con boton de reintento.
- Filtro: SOLO en modo ilimitado. Ids de juego en `localStorage`; filtro vacio deshabilita "Empezar" en ilimitado. Un cambio de filtro con partida ilimitada en curso solo aplica a la siguiente. El modo diario no muestra filtro.
- `localStorage` (prefijo `heardle:`): `filter`; `daily:<date>` -> `DailyRecord = { token, finished, view? }`, donde `view` es la `GameView` final (con `solution` y `results`), para mostrar un diario terminado sin llamar a la API; `unlimited` -> partida en curso; `stats:daily` (una sola racha actual y maxima y una distribucion 1..6 + X; como hay una partida diaria por dia no hay ambiguedad) y `stats:unlimited` (distribucion, sin racha). Durante la partida solo hay token cifrado y las jugadas propias.
- Apertura del modo diario, sin crear partidas innecesarias en servidor:
  1. El cliente calcula la fecha de hoy en Europe/Madrid con `Intl` (misma funcion que el servidor, en `shared/`).
  2. Si existe `daily:<fecha>` terminada -> muestra el resultado, sin boton de jugar, y no llama a la API.
  3. Si existe en curso -> `POST /games/state` con su token.
  4. Si no existe -> `POST /games { mode: "daily" }`. Si la `date` devuelta por el servidor difiere de la calculada (reloj del cliente desviado o cambio de dia en ese instante), manda la del servidor: si esa fecha ya esta terminada en `localStorage` se muestra el resultado y se descarta el token nuevo (crear partida no deja estado en servidor).
- Recarga: `POST /games/state` con el token guardado; `TOKEN_INVALID` -> partida nueva.
- Buscador: deshabilita los `guesses` de la `GameView` (DEC-18); si aun asi llega `ALREADY_GUESSED`, se muestra aviso y se mantiene el intento.
- Compartir: texto generado solo a partir de `results`: `H` 🟩, `G` 🟨, `M` 🟥, `S` ⬛, intentos no usados ⬜, en una fila de 6 sin espacios (DEC-27), mas modo y fecha. Nunca incluye la cancion.
- Buscador segun DEC-17, filtrado en cliente sobre `/catalog`.
- Tailwind 4, modo oscuro por `prefers-color-scheme`, responsive. Interfaz en espanol sin i18n (un solo idioma).

## 8. Seguridad

- Ningun dato de la cancion objetivo sale del servidor antes de terminar: token y tickets cifrados con longitud fija; rutas opacas; sin ETag; clips CBR de tamano fijo por intento; sin metadatos en el MP3.
- Secretos solo en variables de entorno; `config.ts` aborta el arranque si faltan o son cortos (`GAME_TOKEN_SECRET` >= 32 bytes en base64).
- Bucket privado; credenciales de solo backend/script, nunca en el frontend.
- Entrada validada en cada endpoint; tamano de cuerpo limitado (`express.json({ limit: '4kb' })`).
- `trust proxy` = 1 (Render pone un proxy delante) para que el rate-limit use la IP real; configurable por env por portabilidad.
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
- `shared/catalog`: validador con casos invalidos (ids duplicados, juego inexistente, `clipKey` mal formado).

Integracion backend (vitest, `createApp` + `app.listen(0)` + `fetch`, como claude-test; `FsClipStore` con catalogo y clips de prueba):
- Flujo completo ganar/perder/skip; recuperacion con `/games/state`; errores de la tabla de la seccion 5; 429 con `Retry-After`.
- **Prueba de fuga**: durante una partida completa, se serializan todas las respuestas (cuerpo y cabeceras) antes del final y se comprueba que no aparecen id, titulo, `clipKey` ni nombre de fichero de la cancion objetivo.
- Cabeceras de `/clips`: sin ETag, con `no-store`; segunda peticion al mismo ticket -> 410.

Frontend (vitest + Testing Library + jsdom):
- Generador de texto de compartir; estadisticas y racha (dias consecutivos en fecha Madrid devuelta por el servidor); filtro solo visible en ilimitado y vacio deshabilita empezar; apertura del diario sin llamada a la API si ya esta terminado; buscador deshabilita canciones ya intentadas; hook de arranque en frio con temporizadores falsos; recuperacion con `TOKEN_INVALID`.

Script (vitest): `parseTitle`, fusion de `draft` (no pisa entradas revisadas), construccion de argumentos de ffmpeg (funciones puras). `validate` se ejecuta contra fixtures si ffmpeg esta instalado; si no, se marca omitido.

E2E (Playwright en `e2e/`, backend con driver `fs` y fixtures de tonos senoidales generados con ffmpeg y versionados, sin copyright):
- Partida ganada, perdida y con skips; feedback de juego acertado/fallado; revelacion final y bloqueo posterior.
- Recarga en mitad de partida; diario ya jugado (sin `POST /games`); diario igual en dos navegadores; ilimitado: filtro vacio, pool de una cancion, cambio de filtro a mitad; cancion ya intentada no seleccionable.
- Fuga: recoger todas las respuestas de red y el `localStorage` antes de terminar y buscar el titulo/id objetivo (criterio 1).
- Arranque en frio simulado (`page.route` devuelve 503 / retrasa `/health`): la UI muestra carga y se recupera (criterio 8).
- Viewport movil (iPhone, WebKit) y `colorScheme: 'dark'`.

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
- **Tickets usados en memoria**: tras un reinicio un ticket aun no caducado (<= 60 s) podria reutilizarse una vez mas; impacto nulo (mismo clip del mismo intento).

## 14. Fuera de alcance tecnico

Cuentas de usuario, base de datos, ranking global, sincronizacion de estadisticas entre dispositivos, anti-trampas mas alla del rate-limit, CDN para el audio, recorte en servidor, keep-alive, i18n, PWA/offline.

## Preguntas abiertas

Ninguna.
