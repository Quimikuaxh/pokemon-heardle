# Pokemon Heardle - Arquitectura

Estado: version inicial implementada (main). Iteracion `feature/admin-catalogo` (DEC-36 a DEC-43, seccion 6.1; DEC-27 retirada) definida. Cambio "un solo clip por cancion" (DEC-44) y fundido en el navegador (DEC-45) definidos. Iteracion `feature/pistas-y-filtro-juego` (DEC-49 a DEC-53) definida; sin preguntas abiertas. Control de volumen comun (DEC-55) implementado. Migracion a GitHub Pages + Edge Function (DEC-57) en `feature/github-pages`. Requisitos en `REQUISITOS.md` (las decisiones de su seccion 9 no se reabren aqui).
Las preguntas de la version inicial (credencial del bucket; buscador y "juego acertado") se confirmaron el 2026-10-03.

## 1. Vision general

```
 Navegador (GitHub Pages)           Edge Function `heardle` (Deno)           Supabase (proyecto compartido)
 React + Vite + TS                  manejador Request/Response (DEC-57)     Storage, bucket PRIVADO `heardle-audio`
 ┌──────────────────┐  HTTPS/JSON   ┌─────────────────────────────┐  REST    ┌──────────────────────────────┐
 │ UI juego         │ ────────────▶ │ /api/games  (token cifrado) │ ───────▶ │ catalog/catalog.json         │
 │ localStorage:    │               │ /api/clips/:ticket (audio)  │          │ clips/<clipKey>.mp3          │
 │ filtro, token,   │ ◀──────────── │ catalogo y LRU por instancia│ ───────▶ │ Postgres: heardle.rate_limits│
 │ partida diaria   │  audio/mpeg   │ tickets usados por instancia│  RPC     └──────────────────────────────┘
 └──────────────────┘               └─────────────────────────────┘                         ▲
                                                                                            │ upload (S3)
                                                                       scripts/catalog (maquina del usuario)
                                                                       yt-dlp + ffmpeg -> clips + catalog.json
```

En local y en e2e el mismo manejador lo sirve Node (`backend/src/node/server.ts`) con driver `fs` y rate-limit en memoria.

- Sin base de datos para las partidas (Postgres solo guarda contadores de rate-limit, DEC-57). El estado de cada partida viaja en un **token cifrado y autenticado** (AES-256-GCM) que solo el servidor puede leer.
- El audio se precorta offline (un clip de 16 s por cancion, servido por prefijos, DEC-44) y se sirve solo a traves del backend, con URL de un solo uso.
- La API carga `catalog.json` del bucket al arrancar cada instancia y lo mantiene en memoria.

## 2. Estructura del repositorio (monorepo, sin workspaces, como claude-test)

```
pokemon-heardle/
  README.md  REQUISITOS.md  ARQUITECTURA.md  DESARROLLO.md (guia local + despliegue)
  .gitignore  package.json (scripts raiz: install:all, dev con concurrently, e2e, build:edge, deploy:edge)
  shared/                     TS puro sin dependencias, importado por ruta relativa
    api.ts                    DTOs de la API (peticiones, respuestas, codigos de error)
    catalog.ts                tipos de catalog.json + validador (lo usan backend y script)
    rules.ts                  constantes de juego: CLIP_SECONDS = [1,2,4,7,11,16], MAX_ATTEMPTS = 6, y del formato del clip unico: CLIP_FRAME_COUNTS, CLIP_BYTE_OFFSETS, CLIP_TOTAL_BYTES (DEC-44)
    date.ts                   fecha de hoy en Europe/Madrid (la usan backend y frontend, DEC-09 y AR 7)
  backend/
    package.json tsconfig.json vitest.config.ts
    src/
      index.ts                arranque Node: config, carga de catalogo, listen (desarrollo local y e2e, driver fs)
      app.ts                  createApp(deps) -> { handle, catalogReady } (inyectable en tests)
      node/server.ts          servidor node:http para el manejador estandar (IP con la regla de TRUST_PROXY)
      edge/main.ts            entrada de la Edge Function (Deno), empaquetada con esbuild (DEC-57)
      config.ts               lectura y validacion de env (falla al arrancar si falta un secreto)
      catalog/                carga, indice por id, pool del filtro (solo ilimitado)
      game/                   daily.ts (seleccion), token.ts (cifrado), tickets.ts (clips), engine.ts (reglas)
      storage/                ClipStore (interfaz), FsClipStore, SupabaseClipStore, CachedClipStore, LruCache
      http/                   handler.ts (rutas con Request/Response), errors.ts, rateLimit.ts (memoria), postgresRateLimiter.ts, validate.ts
    scripts/build-edge.mjs    bundle de la Edge Function -> supabase/functions/heardle/index.js (ignorado)
  supabase/                   config.toml (funcion `heardle`, Supabase local en 553xx), migrations/ (rate-limit, DEC-57)
  .github/workflows/deploy.yml  tests + build del frontend + GitHub Pages
  frontend/
    package.json vite.config.ts index.html (con la CSP en <meta>)
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
Justificacion: cumple literalmente el requisito 2. El ticket (cifrado, padding fijo, TTL 60 s) contiene `clipKey`, numero de intento y nonce; el numero de intento decide que prefijo del clip unico se sirve (DEC-44). El nonce usado se guarda en memoria hasta su expiracion; si Render reinicia se pierde, pero el TTL acota la ventana. El cliente pide un ticket nuevo via `POST /api/games/state` si lo necesita.

DEC-05: **El frontend descarga el clip con `fetch` a un Blob y lo reproduce desde `URL.createObjectURL`.**
Alternativa: `<audio src="/api/clips/...">` directo.
Justificacion: Safari iOS hace varias peticiones Range sobre un `<audio src>`, lo que rompe una URL de un solo uso. Con Blob hay una sola peticion, se puede repetir el clip sin red y se muestra un indicador de carga. El clip se precarga en cuanto empieza el intento, de modo que `audio.play()` se llama sincronamente dentro del gesto del usuario (requisito de autoplay en iOS).

DEC-06: **Un clip MP3 por cancion: 16 s, CBR 128 kbps estereo, 44.1 kHz, sin ID3 ni cabecera Xing/LAME, sin bit reservoir (`-reservoir 0`), normalizado con `loudnorm`; el intento N se sirve como prefijo del fichero (DEC-44).**
Alternativas: Opus/WebM (sin soporte en iOS antiguos), AAC/M4A (contenedor con mas metadatos), MP3 VBR.
Justificacion: MP3 es universal. CBR hace que el tamano dependa solo de la duracion, no de la cancion; con VBR el `Content-Length` seria una huella por cancion. Con el clip unico la garantia se mantiene por construccion: todos los ficheros miden `CLIP_TOTAL_BYTES` y cada intento se corta en el mismo offset (DEC-44); `validate` lo verifica. Presupuesto: ~250 KB por cancion (ver DEC-16). Descartado: 64 kbps mono (~330 KB/cancion): el usuario prioriza la calidad del audio sobre el espacio.

DEC-07: **Nombres en el bucket opacos**: `clips/<clipKey>.mp3` (antes `clips/<clipKey>/<n>.mp3`, DEC-44), con `clipKey` = 16 hex aleatorios generados una vez por cancion y fijos en `catalog.json`.
Justificacion: el cliente nunca ve rutas, pero si el bucket se hiciera publico por error los nombres no delatarian la cancion. Bucket dedicado `heardle-audio` dentro del proyecto Supabase de claude-test (decision cerrada en REQUISITOS 9).

DEC-08: **Acceso al bucket con claves S3 de Supabase Storage** (protocolo S3-compatible de Supabase; cliente `@aws-sdk/client-s3` apuntando al endpoint de Supabase, sin cuenta ni servicios de AWS). Bucket privado `heardle-audio` en el MISMO proyecto Supabase del Team Builder (claude-test). Confirmado por el usuario.
Alternativas descartadas: (a) `service_role` key: da acceso total al proyecto, incluida la BD del Team Builder; su fuga desde Render comprometeria el otro proyecto. (b) Proyecto Supabase nuevo: el plan free lo pausa tras 1 semana de inactividad.
Justificacion: las claves S3 solo dan acceso a Storage. Se generan en el panel de Supabase: proyecto -> Storage -> S3 Access Keys (alli se ven tambien el endpoint y la region). El secreto solo se muestra al crearlo. El acceso queda detras de la interfaz `ClipStore`.

DEC-09: **Diario sin filtro: una unica cancion por dia, la misma para todas las personas, elegida de todo el catalogo con el mismo peso para cada grupo de seleccion (DEC-54).** `h = HMAC-SHA256(DAILY_SEED, "daily|v2|" + fecha)`. Grupo: `h.readUIntBE(0, 6) % grupos.length`, donde `grupos` son los grupos de seleccion con alguna cancion `enabled`, ordenados por id del grupo (no por su posicion en `catalog.games`: asi insertar un juego nuevo en su sitio de `games` no cambia la cancion del dia; el orden de `games` solo gobierna la salida y la pista de fecha). Cancion: `h.readUIntBE(6, 6) % canciones.length`, donde `canciones` son las `enabled` de todos los juegos del grupo, ordenadas por `song.id`. Big-endian; 48 bits caben exactos en un `number` y el sesgo del modulo es despreciable. (Hasta la iteracion `feature/pistas-y-filtro-juego` se usaba `v1`: `readUIntBE(0, 6) % songs.length` sobre todas las canciones `enabled` ordenadas por id.) El filtro no interviene en el calculo, ni en el token, ni en la API de creacion de la partida diaria.
Alternativa descartada: filtro en ambos modos con una cancion del dia por combinacion de filtro (decision previa, revertida por el usuario el 2026-10-03): el usuario quiere un diario comun y comparable entre jugadores; con filtros, dos personas no jugaban la misma cancion ni sus resultados eran comparables.
- `fecha` = `YYYY-MM-DD` en Europe/Madrid via `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })` (ICU completo viene en Node). Comprobado: 2026-07-01T22:00Z -> 2026-07-02 (CEST) y 2026-12-01T23:00Z -> 2026-12-02 (CET). La zona es constante en codigo, no variable de entorno (decision cerrada).
- La fecha la fija el servidor al crear la partida y queda en el token; el cliente no envia fecha (no puede jugar dias futuros).
- Consecuencias aceptadas: la cancion puede repetirse en dias cercanos (es lo que especifica REQUISITOS 3); cambiar el catalogo en mitad del dia puede cambiar la cancion del dia para partidas nuevas (las ya empezadas no, el token guarda la cancion). Publicar cambios de catalogo cerca de las 00:00 de Madrid.

DEC-10: **Ilimitado (unico modo con filtro)**: seleccion en dos pasos con el mismo peso por grupo de seleccion (DEC-54). Primero se elige un grupo al azar con `crypto.randomInt`: cuenta un grupo si alguno de sus juegos esta en el filtro y tiene canciones `enabled`. Despues se elige una cancion al azar entre las `enabled` de los juegos del grupo que esten en el filtro. El filtro solo se usa al crear la partida y no se guarda en el token.

DEC-11: **Catalogo publico separado del interno**. `GET /api/catalog` devuelve solo `id`, `title` y `games` de las canciones activas y la lista de juegos; nunca `clipKey`, `startSec` ni datos de YouTube.

DEC-12: **Tipos y validador del catalogo en `shared/`**, importados por ruta relativa desde backend, frontend y script.
Alternativa: copiar tipos en cada paquete, o npm workspaces.
Justificacion: el formato del catalogo lo producen el script y lo consume el backend, y los DTOs los usan front y back; copiarlos haria que divergieran. Workspaces anade complejidad que claude-test no tiene. Riesgo de despliegue anotado en seccion 12.

DEC-13: **Rate-limit en memoria con limitador propio de ventana fija de 60 s y reloj inyectable**, por IP (global, creacion de partida, acciones guess+skip, clips) y por partida (clave = nonce del token). Por partida cuentan `state`, `guess` y `skip`, incluidos los rechazos `ALREADY_GUESSED`; crear partida y `/clips` no cuentan por partida. Sin Redis: una sola instancia y perder contadores al reiniciar es aceptable.
Alternativa descartada: `express-rate-limit`, porque usa temporizadores reales y no se pueden probar las ventanas con reloj simulado.

DEC-14: **Arranque en frio sin keep-alive**. Al abrir la web el frontend llama una vez a `GET /api/health` (trafico real, permitido) y muestra "Despertando el servidor..." con reintentos con backoff hasta ~90 s. Prohibido cualquier ping periodico (REQUISITOS 9). Desde DEC-57 (Edge Function, arranque de ~0,2-1 s) el aviso dice "Conectando con el servidor..." y los reintentos solo cubren fallos de red o del servicio.

DEC-15: **Validacion de entrada manual** en `http/validate.ts` (como claude-test, sin zod): payloads pequenos y fijos.

DEC-16: **Originales y clips viven en local; al bucket solo van los clips** (y `catalog.json`, que el backend necesita para arrancar).
Carpeta local ignorada en git: `scripts/catalog/data/` (`work/` originales descargados, `out/clips/<clipKey>.mp3` clips generados, `catalog.json`). Los originales nunca se suben.
Estimacion: un clip de 16 s a 128 kbps = 256.626 bytes (~250 KB) por cancion (DEC-44; antes 6 clips, ~645 KB). Hoy 268 canciones activas = ~67 MB (antes 169 MB); 500 canciones = ~125 MB. El 1 GB de Storage del plan free se comparte con el Team Builder (que hoy no usa Storage; su BD tiene cuota aparte), asi que el techo practico es ~4000 canciones.
Egress de Supabase (plan free, ~5 GB/mes, verificar en el panel): solo se consume cuando el backend lee un clip que no esta en su cache LRU (arranques en frio y canciones del modo ilimitado). Peor caso ~250 KB por partida sin cache (el backend descarga el fichero entero una vez y corta en memoria) = ~20.000 partidas/mes sin cache antes de agotarlo. El trafico backend -> navegador cuenta contra el ancho de banda de Render (100 GB/mes en free), no contra Supabase.

DEC-17: **Buscador**: cada opcion es una cancion y muestra sus juegos. El texto se parte en palabras y CADA palabra debe aparecer en el titulo de la cancion o en el nombre de alguno de sus juegos (sin distinguir mayusculas ni acentos, texto literal): "ruby battle" encuentra los combates de Ruby/Sapphire/Emerald. Implementado una sola vez en `shared/search.ts` (`matchesAllWords`) y usado por el juego y por el admin (que ademas busca en el titulo del video). Descartado: buscar la consulta completa como una subcadena, porque no permite combinar juego y titulo ("ruby battle" no encontraba nada; peticion del usuario 2026-10-04). Muestra SIEMPRE el catalogo completo, independientemente del filtro y de si ya se acerto el juego. Confirmado por el usuario. (Sustituido por DEC-60: el buscador muestra solo la serie del diario o los juegos de la partida libre.)

DEC-48: **Orden de los juegos y resultados del buscador** (decisión del usuario): los juegos se muestran en el orden de la lista `games` de `catalog.json`, que es el de salida; no hay campo de año (descartado: el usuario prefiere reordenar el JSON a mano al añadir un juego). El buscador muestra todos los resultados en una lista con scroll, sin límite ni aviso "y N más" (descartado: el límite de 50, que obligaba a afinar la búsqueda).
Alternativas descartadas: una opcion por par (cancion, juego) enviando `gameId`; limitar al pool del filtro (con un solo juego filtrado el feedback de juego seria siempre "acertado" y la lista daria pistas).
Busqueda en cliente sobre `GET /catalog` (ya cargado); el servidor solo recibe `songId`.

DEC-18: **Intento repetido NO permitido.** El buscador marca las canciones ya intentadas en la partida y no deja elegirlas; el servidor rechaza un `songId` ya intentado con `409 ALREADY_GUESSED` sin consumir intento ni emitir token nuevo. Para poder validarlo sin estado, el token guarda los `clipKey` de las canciones ya intentadas (campo `q`, longitud fija por elemento, compatible con DEC-03).
Alternativa descartada: aceptar la repeticion consumiendo intento (castiga un error de pulsacion y no aporta informacion nueva).

DEC-19: **Almacenamiento definitivo en Supabase Storage** (bucket privado en el proyecto del Team Builder, DEC-08).
Alternativas descartadas: Backblaze B2 (egress gratuito limitado a ~3x lo almacenado, ~1 GB/mes con este volumen, y 2.500 descargas/dia en free); Google Drive (mas configuracion y mas latencia).

DEC-20: **Orden canonico en ilimitado**: grupos ordenados por id del grupo (DEC-09, DEC-54); canciones del grupo, limitadas a los juegos filtrados, ordenadas por `id`. `pickRandom(list) = list[crypto.randomInt(list.length)]`, aplicado primero al grupo y luego a la cancion (DEC-54).
Justificacion: el mismo orden canonico que el diario hace los tests deterministas (con `randomInt` inyectado) y el resultado no depende del orden de carga del catalogo.

DEC-21: **Tipos del token**: `iat` y `exp` en segundos epoch (enteros); `r` y `q` son arrays de strings. Un `q` mal formado (no array, elemento que no es `clipKey` de 16 hex, longitud > `r.length`) o con un `clipKey` que ya no esta en el catalogo -> `TOKEN_INVALID`.
Justificacion: segundos bastan para caducidades de horas y acortan el payload; tratar igual `k` y `q` frente a canciones retiradas evita estados a medias en `ALREADY_GUESSED`.

DEC-22: **Fallo del almacen al servir un clip: el ticket NO queda consumido.** El nonce se marca como usado solo despues de obtener y comprobar los bytes del clip (cache o bucket; la comprobacion de formato de DEC-44 cuenta como fallo del almacen); si falla, `502 STORAGE_ERROR` y el cliente reintenta con el mismo ticket mientras no caduque.
Alternativa descartada: consumir el ticket al recibir la peticion (un fallo transitorio de Supabase obligaria a pedir ticket nuevo via `/games/state` sin motivo).

DEC-23: **`upload` incremental por md5.** `ObjectStore.list(prefix)` devuelve `{ key, md5 }` por objeto; un clip se sube si no existe o si su md5 local difiere.
Justificacion: el tamano no sirve (todos los clips miden `CLIP_TOTAL_BYTES`, DEC-44). Clave por cancion: `clips/<clipKey>.mp3`. En S3 el `ETag` es el md5 solo en subidas de una parte; los clips (<300 KB) se suben siempre con un `PutObject` simple. Riesgo: verificar en el primer `upload` real que el `ETag` de Supabase S3 coincide con el md5 local; si no, `upload` subiria todo cada vez (correcto pero lento).

DEC-24: **Rutas del script**: `outDir` de `build`, `validate`, `upload` y `clipOutputPath` = `scripts/catalog/data/out/clips` (`<outDir>/<clipKey>.mp3`, DEC-44). En local, `STORAGE_DIR` del backend apunta a `scripts/catalog/data/out`.

DEC-25: **Definicion de "juego" en el catalogo** (decision de producto del usuario): un juego es el grupo de versiones que comparten banda sonora ("Ruby / Sapphire / Emerald" es UN juego); un remake con banda sonora distinta es un juego aparte ("Omega Ruby / Alpha Sapphire"). ~~Cada cancion lista todos los juegos en los que aparece.~~ Sustituido por DEC-53: cada cancion pertenece a un solo juego.
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

DEC-35: **RETIRADA** (DEC-57: ya no hay despliegue en Render). Definia que `tsx` fuera dependency y que `render.yaml` instalara con `npm ci`.

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

DEC-41: **Cancion completa al terminar: embed `youtube-nocookie` con el `youtubeId` dentro de `solution`.** `SolutionView` gana `youtubeId`; el backend solo lo anade cuando la partida ha terminado (mismo punto donde hoy se construye `solution`). Nunca en `/catalog`, ni en `GameView` en curso, ni en cabeceras. El iframe solo existe en el arbol de React cuando `status !== 'playing'`, asi que no puede cargarse antes. URL: `https://www.youtube-nocookie.com/embed/<youtubeId>` (con `?enablejsapi=1` desde DEC-55). Carga del iframe: SOLO al pulsar el boton "Escuchar la cancion completa"; antes no hay iframe ni peticion a YouTube (decision del usuario). Descartado: cargarlo automaticamente al terminar (peticiones a YouTube cada vez que se reabre un diario terminado y mas datos en movil).
Alternativa descartada: servir el tema completo o un fragmento largo propio (~1,5 GB para 500 canciones, supera el 1 GB gratis de Supabase).
Justificacion de `youtube-nocookie`: no deja cookies de YouTube hasta que se reproduce.

DEC-42: **Barra de reproduccion sobre la escala fija de 16 s**, con marcas en 1/2/4/7/11 s y fin en 16; zona `0..clipSeconds[attempt]` desbloqueada y el resto bloqueada (estilo distinto); cabezal = `audio.currentTime` limitado a la zona desbloqueada (el retardo del codificador MP3 puede dar unos ms de mas). Accesible como `role="progressbar"` con `aria-valuemax` = segundos desbloqueados.
Justificacion: solo usa datos publicos (`clipSeconds`, `attempt`), no revela nada. Escala lineal como en Heardle: el segmento de 1 s ocupa ~6 % del ancho.
Decisiones de implementacion (la opcion mas simple): con la partida terminada la barra NO se muestra (FE-BAR-11); en pausa o al terminar el clip (`playing=false`) el cabezal queda en la ultima posicion (FE-BAR-08) y vuelve a 0 al cargar el clip del intento siguiente. `ClipPlayer.subscribe` emite `{ playing, positionSec }` con un `requestAnimationFrame` por frame solo mientras suena; `GameBoard` se suscribe al montar y se desuscribe (y cancela el frame) al desmontar.

DEC-43: **Sin estadisticas** (iteracion admin-catalogo, decision del usuario: no las quiere). Se eliminan `game/stats.ts`, `StatsPanel` y las claves `heardle:stats:daily` y `heardle:stats:unlimited`; al arrancar, el frontend borra esas claves si existen (limpieza idempotente de datos que ya nadie lee). Se mantiene `daily:<date>` (`DailyRecord`), necesario para no repetir el diario.
Alternativa descartada: mantener racha y distribucion.

DEC-44: **Un solo clip de 16 s por cancion; el backend sirve al intento N el prefijo del fichero, cortado en limite de trama en un offset constante.** (Decision del usuario para reducir almacenamiento: de ~645 KB a ~250 KB por cancion.)
- Formato: MPEG-1 Layer III, 128 kbps CBR, 44.1 kHz, estereo, sin ID3 ni trama Xing/Info, `-reservoir 0`. Cada trama codifica 1152 muestras y mide 417 o 418 bytes segun el bit de padding; el patron de padding de LAME depende solo del numero de trama, no del audio.
- Comprobado (2026-10-04) con 4 fuentes distintas (tono, ruido rosa, silencio, cancion real) y con los fixtures de lamejs: 614 tramas, 256.626 bytes y offsets de trama identicos byte a byte. `-reservoir 0` no cambia la disposicion de tramas.
- Retardo del codificador: el audio aparece desplazado 1105 muestras (576 + 529; medido por alineacion con la fuente). Por eso los clips actuales miden +40-50 ms.
- Corte: `frames(N) = floor((N * 44100 + 1105) / 1152)` para N < 16; para N = 16, el fichero entero (614 tramas; lo que pasa de 16 s es relleno del codificador, el master acaba en 16 s). Con `floor` el prefijo acaba hasta 24 ms por debajo de N (de ~1 a 24 segun el intento, ver la tabla), nunca por encima. `ceil` daria hasta 26 ms de audio real posterior.
  **Limitacion aceptada por el usuario**: el analisis hacia delante de LAME (psicoacustico y cambio de tipo de bloque) hace que la ultima o las dos ultimas tramas del prefijo dependan de audio posterior al corte; con un decodificador manipulado se pueden recuperar unos ~12 ms, y en reproduccion normal apenas son perceptibles. Alternativa descartada por el usuario: `frames(N) = floor((N*44100 - 576)/1152)`, que elimina esa fuga a costa de 40-59 ms menos de audio por intento. Se mantiene `CLIP_FRAME_COUNTS` tal cual. Tampoco es audio, pero conviene saberlo: el `loudnorm` dinamico de `masterArgs` hace que la ganancia dependa de ~3 s posteriores (una pista de sonoridad, no audio); ya ocurria con 6 clips.

| Intento | N s | Tramas | Bytes (prefijo) | Audio real |
|---|---|---|---|---|
| 1 | 1 | 39 | 16.300 | 993,7 ms |
| 2 | 2 | 77 | 32.182 | 1986,4 ms |
| 3 | 4 | 154 | 64.365 | 3997,8 ms |
| 4 | 7 | 268 | 112.013 | 6975,8 ms |
| 5 | 11 | 422 | 176.378 | 10998,6 ms |
| 6 | 16 | 614 | 256.626 | 16000 ms + relleno |

- Donde viven: constantes en `shared/rules.ts` (`CLIP_FRAME_COUNTS`, `CLIP_BYTE_OFFSETS`, `CLIP_TOTAL_BYTES`), junto a la formula y un test que las recalcula a partir del patron de tramas. `validate` las comprueba en cada fichero y el backend hace una comprobacion barata en tiempo de ejecucion.
  Descartadas: calcularlas en `build` y guardarlas en el catalogo (son iguales para todas las canciones; un valor por cancion invitaria a divergencias y, si difiriera, seria una huella); calcularlas en el backend parseando cada fichero (CPU en Render para un resultado constante).
- `-reservoir 0`: con el bit reservoir (por defecto en LAME) los datos de la trama k+1 empiezan hasta ~500 bytes antes, dentro de la trama k; medido: 613 de 614 tramas lo usan. Un prefijo llevaria trozos de audio posterior al corte. Sin reservoir cada trama es autocontenida. Coste medido en musica real: SNR 19,85 -> 19,83 dB (despreciable; en ruido rosa sintetico, -1,5 dB).
- Backend: `ClipStore.getClip(clipKey)` devuelve el fichero entero (`clips/<clipKey>.mp3`); la cache LRU guarda un fichero por cancion (`CLIP_CACHE_MB` = 32 da para ~130 canciones). Antes de servir comprueba `length === CLIP_TOTAL_BYTES` y que en TODOS los offsets intermedios (los de cualquier intento, no solo el del intento pedido; 5 comparaciones, coste constante) hay cabecera de trama (`0xFFFB`): un fichero con un offset roto es incorrecto sea cual sea el intento y falla pronto y entero (BE-CLP-03). La comprobacion va en la ruta `/clips`, no en los stores, y si la lectura es invalida, la ruta hace `store.evict(clipKey)` para que no quede en la cache (un fichero invalido cacheado se serviria como 502 para siempre y la cancion del dia no se expulsaria nunca) y la siguiente peticion vuelve a leer del almacen; si no, `STORAGE_ERROR` sin consumir el ticket (DEC-22). Responde `subarray(0, CLIP_BYTE_OFFSETS[attempt])`, con las mismas cabeceras de seccion 5 (`Content-Length` = offset, sin `ETag`, `no-store`, sin `Accept-Ranges`).
- Fundido de salida: el fichero solo lleva el fundido de 50 ms al final de los 16 s (master). El de cada intento lo hace el navegador (DEC-45).
- Alternativa descartada: mantener 6 ficheros por cancion (~645 KB/cancion, 169 MB hoy; 2,6 veces mas almacenamiento y egress por fallo de cache).
- Compatibilidad y despliegue: el formato de `catalog.json` no cambia, y los dos layouts del bucket conviven porque usan claves distintas. Por eso no hay codigo de compatibilidad y basta con este orden:
  1. `build`: genera `out/clips/<clipKey>.mp3` y borra el directorio antiguo `out/clips/<clipKey>/` de esa cancion.
  2. `upload` sin `--prune`: sube los ficheros nuevos y el catalogo. El backend antiguo sigue funcionando con las claves antiguas.
  3. Desplegar el backend nuevo. Render despliega solo al hacer push a `main`, asi que el merge va DESPUES del paso 2. Un backend nuevo sin los ficheros nuevos daria `STORAGE_ERROR` en todos los clips.
  4. `upload --prune`: borra todo lo que hay bajo `clips/` y no es `clips/<clipKey>.mp3` de una cancion activa, incluidas las carpetas antiguas.
  Descartado: un backend capaz de leer los dos layouts (codigo temporal que habria que retirar; el orden de despliegue ya lo hace innecesario).

DEC-45: **Fundido de salida de 50 ms en el navegador con Web Audio: `decodeAudioData` del Blob + `AudioBufferSourceNode` -> `GainNode` -> `destination`.** Se aplica a los 6 intentos por igual; en el de 16 s se suma al fundido que ya trae el fichero, que no hace dano y deja el codigo sin casos especiales. Decision del usuario: hacerlo ya, sin esperar a la prueba real.
Funcionamiento en `ClipPlayer` (la interfaz publica `prepare/play/stop/subscribe/dispose` no cambia):
- `prepare`: descarga el Blob una sola vez (DEC-05) y lo decodifica con `decodeAudioData` en un `AudioContext` unico por `ClipPlayer`, creado de forma perezosa. Fuera del gesto nace `suspended`, lo que esta permitido: decodificar no necesita un contexto activo. Solo se guarda el `AudioBuffer` del intento actual (16 s estereo float32 = ~5,6 MB como maximo) y el anterior se suelta.
- `play` (sincrono, dentro del gesto, como ya exige DEC-05):
  - Si el contexto no esta `running`, llama a `ctx.resume()`. En iOS desbloquea el audio si se llama dentro del gesto.
  - Crea un `AudioBufferSourceNode` nuevo (son de un solo uso) y un `GainNode`, con `t0 = ctx.currentTime` y `d = buffer.duration`.
  - Programa la ganancia: `setValueAtTime(1, t0)`, `setValueAtTime(1, t0 + d - 0.05)`, `linearRampToValueAtTime(0, t0 + d)`.
  - Llama a `source.start(t0)`. Reproducir otra vez antes de que acabe para la fuente anterior y empieza de cero, como hoy.
- Pausa y reanudacion (DEC-46): `pause()` hace una rampa de ganancia a 0 en 10 ms (`cancelScheduledValues`, `linearRampToValueAtTime(0, t + 0.01)`) y para la fuente en `t + 0.01` para evitar el chasquido del corte en seco (si ya esta en el fundido final, corta sin rampa nueva); la fuente que se apaga deja de ser la activa y su `ended` solo libera los nodos. Guarda `offset = min(offset_inicial + ctx.currentTime - t0, d)`; el siguiente `play()` crea una fuente nueva con `source.start(t0, offset)` y recalcula el fundido para el tramo que queda (`d - offset`: `setValueAtTime(1, t0 + (d-offset) - 0.05)` y rampa a 0 en `t0 + (d-offset)`). Si ya sonaba, `play()` reinicia desde 0. Al acabar el fragmento, al cambiar de intento (`prepare`), con `stop()` o si el offset deja menos de 50 ms, el siguiente `play()` empieza en 0. Una interrupcion del sistema (`statechange`) cuenta como pausa. En la ruta `<audio>`: `pause()`/`play()` sin tocar `currentTime`; un `pause` que no viene de `pause()` (p. ej. el fin del clip) no es reanudable. La barra y la onda reflejan la posicion pausada. Descartado: `AudioContext.suspend()`/`resume()` (pararia tambien el reloj, pero no sirve en el fallback y complica el cambio de intento) y reiniciar siempre desde 0 (decision del usuario: pausar de verdad).
- Progreso: `positionSec = min(offset + ctx.currentTime - t0, d)` en el bucle `requestAnimationFrame` que ya existe; `source.onended` emite `playing: false`. La barra (DEC-42) no cambia.
- Suspension e interrupciones: si el contexto deja de estar `running` mientras suena (iOS lo interrumpe por llamadas o al pasar a segundo plano), se escucha `statechange`, se emite `playing: false` y se para. El siguiente `play()` vuelve a llamar a `resume()` dentro del gesto. `stop()` (p. ej. al abrir la cancion completa) para la fuente. `dispose()` cierra el contexto.
- iOS y el interruptor de silencio: Web Audio en iOS respeta el interruptor y `<audio>` no. Para no quedar mudo con el interruptor activado, se fija `navigator.audioSession.type = 'playback'` donde exista (Safari 16.4 y posteriores). Hay que verificarlo a mano en un iPhone.
- Fallback: si no hay `AudioContext`/`webkitAudioContext` o `decodeAudioData` falla, ese clip se reproduce por la ruta actual (`<audio>` con objectURL, sin fundido, corte seco). Se decide en `prepare`, no en `play`, para no perder el gesto. Si `resume()` falla, se emite `playing: false`; la persona puede volver a pulsar.
- Inyeccion para tests: `ClipPlayerDeps.createAudioContext?: () => AudioContextLike | null` (`null` fuerza el fallback) junto al `createAudio` actual.
Alternativas descartadas:
- `MediaElementAudioSourceNode` sobre el `<audio>` actual: el fundido habria que programarlo estimando cuando acaba el `<audio>` con un reloj distinto (`currentTime` del elemento frente al del contexto). Eso da errores de decenas de ms, y Safari ha tenido fallos de silencio con `createMediaElementSource` sobre objectURL.
- Aceptar el corte seco: decision del usuario.
- Fundidos dentro del fichero antes de cada corte: meterian bajadas de volumen audibles a mitad de los intentos siguientes.
- Fundido cambiando `audio.volume`: en iOS `volume` es de solo lectura.

DEC-46: **Rediseno visual del frontend del juego (rama `feature/rediseno-ui`): lenguaje "Pokedex" con tokens de tema en CSS, Tailwind 4 y SVG en linea.** Decision del usuario sobre una maqueta aprobada; el comportamiento (flujos, API, estados, accesibilidad) no cambia.
- Tokens: variables CSS (`--paper`, `--ink`, `--edge`, `--muted`, `--shell`, `--field`, `--chip`, `--dim`, `--skipbg`, `--amber-text`) en `:root` y su version oscura bajo `prefers-color-scheme: dark`, expuestas a Tailwind con `@theme inline` (`bg-paper`, `text-ink`...). Los colores de la pantalla del reproductor y de los resultados son constantes (`@theme`: `screen`, `track`, `hit`, `near`, `miss`...). Ajustes de contraste AA respecto a la maqueta: `--dim` claro `#65666d` (la maqueta traia `#8e8f95`, 2,9:1; `#65666d` da 4,75:1 sobre `--paper` y 5,7:1 sobre `--field`) y oscuro `#8a8c93` (5,4:1), y placeholder `#6e6f76` (5,0:1).
- Tipografia: Rubik (UI), Space Mono (cifras y lecturas) y Lilita One (titulo en el resultado) **alojadas en el proyecto** con `@fontsource/*` (OFL; `src/fonts.ts`, subconjuntos `latin` y `latin-ext`), sin peticiones a Google Fonts (privacidad/RGPD: no se envia la IP de cada visitante a un tercero; si algun dia se anade una CSP global, las fuentes ya son del mismo origen). Logo "Pokémon Heardle" en una linea con **Pokemon Solid** (`src/assets/fonts/PokemonSolid.ttf`, `@font-face` local; tiene el glifo "é", comprobado en su `cmap`; amarillo `#FFCB05` con contorno `#2A75BB` en la clase global `.logo`). Origen y licencia de la fuente: dafont.com/pokemon.font (2007); autor y licencia no constan claramente, y se mantiene por decision del usuario en un proyecto de fans sin animo de lucro, bajo su responsabilidad (README). El logo es un unico componente (`Logo.tsx`), facil de sustituir.
- Reproductor (`Player.tsx`): carcasa con lente y tres luces, pantalla oscura con **forma de onda real**, `ClipProgressBar` (DEC-42) restilizada, lectura "INTENTO n/6" y "m:ss / m:ss", boton play/pausa rojo (nombre accesible "Reproducir N s" / "Pausar" / "Cargando audio...") y "Saltar +N s". El boton rojo **pausa y reanuda de verdad** (`ClipPlayer.pause()` / `play()`, DEC-45); antes pulsar durante la reproduccion la reiniciaba.
- Onda: `ClipPlayer` recibe `onDecoded({ attemptKey, buffer })` con el `AudioBuffer` YA decodificado del intento actual (null al soltarlo y en la ruta `<audio>`); `computePeaks` (`audio/waveform.ts`) calcula 48 picos sobre la escala de 16 s leyendo SOLO muestras con indice < `unlockedSec * sampleRate`; las barras posteriores valen null y se pintan planas. Nada de lo que se dibuja sale de audio que el jugador no tenga ya. Sin buffer (fallback `<audio>`) la onda es neutra (barras planas, `data-waveform="neutral"`), nunca inventada. La interfaz publica del player crece con `pause()` (`prepare/play/pause/stop/subscribe/dispose`).
- Boton rojo: nombre accesible "Pausar" mientras suena, "Reanudar" si esta en pausa a mitad de clip (posicion > 0 y a mas de 50 ms del final) y "Reproducir N s" en 0 o tras acabar el fragmento. Si se cambia de intento sonando, `prepare` emite `{ playing:false, positionSec:0 }` y cancela el rAF desde el primer momento (no queda "sonando" mientras se descarga el siguiente clip).
- Accesibilidad: el grupo Diario/Libre no usa `overflow-hidden` (recortaria el aro de foco, WCAG 2.4.7); los extremos se redondean en cada boton. `AttemptList` y `SongSearch` van en `memo` con los indices del catalogo en `useMemo`, porque el tablero se repinta en cada frame de la reproduccion.
- Resto: buscador con icono y sugerencias compactas (cuadradito de color del juego + titulo + juego; mismas reglas de DEC-17/18); historial 01-06 con icono por resultado (acierto verde, juego correcto ambar, fallo rojo, saltado gris; el nombre accesible sigue siendo `resultLabel`, en texto `sr-only`); resultado de acierto/derrota con fila de 6 marcas y el boton rojo de DEC-41; filtro del modo libre con contadores por juego; en escritorio (>= 1024 px) columna central e historial a la derecha (`lg:` de Tailwind), y desde 1280 px (`xl:`) además la leyenda a la izquierda: entre 1024 y 1279 px su columna se cede al historial, que con pistas activas truncaba los títulos; tactil >= 44 px.
- Colores por juego: un solo mapa por id (`game/gameColors.ts`); un juego nuevo recibe un color de una paleta de reserva elegido por hash del id (estable). Los nombres en listas se muestran sin el prefijo "Pokémon " (`shortGameName`); el resultado muestra el nombre completo.
- Descartado: Google Fonts en `index.html` (peticion a un tercero en cada visita); **shadcn/ui** (no aporta: la maqueta es propia, hay ~10 componentes y arrastraria Radix y su sistema de variables sin usar nada); **sprites de Pokemon** (derechos, y el usuario no los quiere); **estadisticas** (siguen retiradas, DEC-43) y **compartir** (DEC-27); **libreria de iconos** (SVG en linea: 7 iconos); onda inventada o precalculada en el servidor (mas datos que filtrar; la real sale del audio ya descargado).

DEC-47: **El clip empieza donde arranca la musica: silencio inicial medido con `ffmpeg silencedetect` y `startSec` automatico.** Problema real: casi todos los temas descargados empiezan con ~0,5 s de silencio (medido con -40 dB: 0,46-0,62 s tipico, hasta 2,46 s) y el intento de 1 s apenas sonaba.
- Medicion (`scripts/catalog/src/silence.ts`): `ffmpeg -t 10 -i <fuente> -af silencedetect=noise=-50dB:d=0.1 -f null /dev/null` sobre los primeros 10 s; constantes `SILENCE_NOISE_DB = -50`, `SILENCE_MIN_SECONDS = 0.1`, `SILENCE_ANALYZED_SECONDS = 10`. El silencio inicial es el `silence_end` del primer silencio si empieza al principio (<= 0,05 s; ffmpeg a veces da -0,001); si no empieza al principio vale 0 y si no termina en los 10 s vale 10. Ruta absoluta y argv como array (ids que empiezan por "-"). Resultado en `source.leadingSilenceSec`. Validado con fuentes reales en un directorio temporal: 0 / 0,12 / 0,25 / 0,46 s en cuatro temas distintos. Con -50 dB salen silencios mas cortos que con los -40 dB de la medida manual: es la propuesta aprobada (no recorta ataques suaves).
- `startSec` automatico = `floor(leadingSilenceSec * 100) / 100 - 0,05`, nunca negativo (`START_MARGIN_SECONDS`, margen para no comer el ataque). Se escribe en `startSec`, asi que el resto del flujo (build, manifest, validate, regla de cancion corta de DEC-40) no cambia y la regla de "corta" usa el `startSec` efectivo.
- Automatico o manual: `startSecManual: true` (campo opcional de la cancion) protege un `startSec` puesto a mano, incluso 0. Compatibilidad con catalogos existentes: sin marca, `startSec = 0` pasa a automatico y `startSec != 0` se considera puesto a mano y no se toca. Se aplica UNA vez, al guardar la medida: con `leadingSilenceSec` ya presente no se vuelve a medir ni a mover `startSec`. Para repetir la deteccion de una cancion se borra `source.leadingSilenceSec` a mano en `catalog.json`.
- Cuando se mide: `draft` mide a las fuentes nuevas o sin medida (junto a la duracion); `build` mide las canciones activas sin medida (fuera del mutator de `catalogStore.update`, como `durationSec`), y las que cambian de `startSec` se recompilan por el manifest (DEC-44). Una fuente que ya es corta con el `startSec` actual no se mide. Un fallo de `silencedetect` avisa y deja `startSec` como estaba (no aborta draft ni build). Las canciones desactivadas no se miden en `build`.
- `validate`, `upload` y el formato del clip no cambian. El admin sigue sin editar `startSec` (DEC-38); una cancion activa que pase a ser corta por el nuevo `startSec` se desactiva igual que en DEC-40.
- Descartado: recortar el silencio en el navegador o en el backend (el clip serviria audio distinto del fichero y cambiaria CLIP_BYTE_OFFSETS por cancion); un umbral de -40 dB (come ataques suaves y entradas con fundido); aplicar un `startSec` global fijo (0,47 s mediano pero hasta 2,46 s); guardar solo `startSec` sin la medida (no se podria distinguir automatico de manual ni repetir la medicion).

DEC-49: **Buscador con filtro de juego en forma de burbuja** (iteracion `feature/pistas-y-filtro-juego`, decision del usuario). Solo frontend: `/catalog` ya trae los juegos.
- Resultados en dos grupos, en este orden: "Juegos" (los que cumplen `matchesAllWords(query, [game.name])`, en el orden de DEC-48) y "Canciones" (DEC-17). Elegir un juego vacia el texto, pone en la caja, antes del input, una burbuja con su nombre y un boton ×, y deja el foco en el input. Desde ese momento "Canciones" solo incluye las de ese juego; el texto sigue filtrando dentro, y con el texto vacio se listan todas las canciones del juego (lista con scroll, DEC-48). Elegir otro juego con una burbuja puesta la sustituye.
- Ambito: el filtro dura la partida y se borra al empezar otra. No se guarda en `localStorage`. No tiene relacion con el filtro del modo libre (`FilterPanel`, `heardle:filter`, pool del servidor): ni lo lee ni lo modifica, y ofrece cualquier juego del catalogo publico aunque este fuera del pool (DEC-17). Las canciones ya intentadas siguen deshabilitadas (DEC-18).
- Logica pura en `frontend/src/game/search.ts`: `searchCatalog(catalog, query, gameId | null) -> { games, songs }`. Sin chip y con texto vacio no muestra nada, como hoy.
- Accesibilidad (patron combobox de ARIA 1.2):
  - Input `role="combobox"` con `aria-expanded`, `aria-controls` y `aria-activedescendant`. El `listbox` lleva dos `role="group"` con `aria-labelledby` en su cabecera visible ("Juegos", "Canciones"); un grupo vacio no se pinta.
  - Las flechas recorren las opciones de ambos grupos como una sola lista. Enter elige: un juego pone la burbuja; una cancion envia el intento. Escape cierra la lista y, si ya esta cerrada, vacia el texto.
  - Backspace con el input vacio quita la burbuja.
  - La burbuja es un `<span>` con el nombre y un `<button aria-label="Quitar filtro de juego: <nombre>">`. Al quitarla, el foco vuelve al input.
  - El input lleva `aria-describedby` hacia un texto oculto "Filtrando por <juego>" mientras hay burbuja.
  - Una region `aria-live="polite"` anuncia "Filtro de juego: <nombre>" y "Filtro de juego quitado", ademas del numero de resultados.
Alternativas descartadas: un selector de juego aparte, fuera de la caja (decision del usuario: burbuja dentro del buscador); reutilizar el filtro del modo libre (es otro concepto: pool del servidor frente a ayuda de busqueda).

DEC-50: **Pistas de consola y de fecha calculadas en el servidor, enviadas siempre con cada fallo en `GameView.hints`; activarlas solo cambia lo que se pinta.**
- Contrato: `GameView.hints: Array<AttemptHint | null>`, alineado con `results` (misma longitud). Vale `null` en `skip` y en `hit`.
  `AttemptHint = { console: { label: ConsoleName, match: boolean } | null, order: 'earlier' | 'later' | null }`.
  `order` describe el juego de la cancion BUSCADA respecto al de la elegida: `earlier` = la buscada es de un juego anterior. Es `null` si es el mismo juego (ya existe el resultado `game`).
- Calculo en `buildGameView`, sin tocar el token: `q` guarda en orden los `clipKey` intentados, que se emparejan con las entradas no-skip de `r`. Las pistas se recalculan del catalogo en cada respuesta, asi que el token no crece ni cambia de formato (DEC-03).
- Consola: `match = consoles(elegida) ∩ consoles(buscada) ≠ ∅`. `label` = la primera consola comun en orden canonico si hay coincidencia; si no, la primera consola de la elegida. Esto cubre las reglas del usuario para Legends: Z-A (`['Switch', 'Switch 2']`):
  - Elegida Z-A y buscada de Switch -> "Switch" verde.
  - Elegida Z-A y buscada de Switch 2 -> "Switch 2" verde.
  - Elegida Z-A y buscada de otra consola -> "Switch" rojo.
  - Buscada Z-A y elegida de Switch o Switch 2 -> esa consola en verde.
  Si alguno de los dos juegos no tiene `consoles`, `console: null` y no se pinta nada.
- Fecha: indice del unico juego de cada cancion (DEC-53) en `catalog.games` (orden de salida, DEC-48).
- Que se filtra, por diseno: una pista verde revela una consola de la buscada; la flecha revela un lado del orden de juegos. Es exactamente lo decidido, y nunca va el id ni el nombre del juego buscado. Va SIEMPRE, este o no activada en el cliente (decision del usuario), asi que alguien con DevTools ve las pistas aunque las tenga desactivadas. Es una limitacion aceptada: son pistas, no la solucion.
- `shared/rules.ts`: `CONSOLES = ['GB', 'GBC', 'GBA', 'DS', '3DS', 'Switch', 'Switch 2']` (orden canonico) y el tipo `ConsoleName`. La funcion pura `computeHint(chosen, target, gameOrder, gamesById)` vive en el backend y se prueba aparte.
Alternativas descartadas: calcular las pistas en el cliente (exigiria conocer el juego buscado antes de terminar, contra el requisito 2); enviarlas solo si la persona las activa (decision del usuario: la informacion viene siempre y activar solo muestra; ademas, enviarlas a demanda obligaria a mandar los ajustes al servidor); guardarlas en el token (lo agranda sin necesidad, porque se pueden recalcular).

DEC-51: **Consola de cada juego en `catalog.json`: `Game.consoles?: ConsoleName[]`** (lista, porque Legends: Z-A es Switch y Switch 2).
- Asignacion:
  - GB: Red/Blue/Yellow.
  - GBC: Gold/Silver/Crystal.
  - GBA: RSE, FRLG.
  - DS: DPPt, HGSS, BW, B2W2.
  - 3DS: X/Y, ORAS, Sun/Moon, USUM.
  - Switch: Let's Go, Sword/Shield, BDSP, Legends: Arceus, Scarlet/Violet.
  - Switch y Switch 2: Legends: Z-A.
- Validacion: en `shared/catalog.ts` es opcional, pero si existe se valida (reglas del validador, seccion 6). El `validate` del script exige `consoles` en todo juego con canciones activas, asi que `upload` no sube un catalogo incompleto. El backend tolera su ausencia (`console: null`). Por eso subir el catalogo y desplegar el backend se pueden hacer en cualquier orden, sin la dependencia de DEC-44.
- Admin local: `PATCH /api/games/:id` acepta `consoles`. La UI muestra casillas con las 7 consolas en cada juego y guarda en orden canonico.
- Relleno: sin tabla por defecto en el script (decision del usuario). Las consolas se escriben en `catalog.json` al anadir cada juego nuevo: lo hace el asistente cuando el usuario pasa la playlist de un juego nuevo, y el admin permite corregirlas. Un juego sin consolas con canciones activas hace fallar `validate`/`upload`; el backend lo tolera sin pista. Descartado: tabla `knownConsoles.ts` aplicada por `draft`.
- Orden: X/Y entra entre Black 2/White 2 y Omega Ruby/Alpha Sapphire. Como el orden de `games` ahora alimenta la pista de fecha, un juego mal colocado da flechas erroneas. `draft` anade los juegos nuevos al final, asi que hay que moverlos a mano en el JSON (DEC-48); se anade un aviso en `DESARROLLO.md`/README del script.

DEC-52: **Panel de pistas (botón con engranaje y el texto "Pistas"; el diálogo se titula "Pistas") con dos interruptores independientes: "Pista de consola" y "Pista de fecha"**, guardados en `localStorage` `heardle:settings` y validos en diario y libre.
- Interfaz: dialogo `role="dialog"` con `aria-modal`, titulo, foco atrapado dentro, Escape cierra y el foco vuelve al engranaje. Cada interruptor es un `<button role="switch" aria-checked>` con etiqueta visible.
- Valor por defecto: ambas pistas DESACTIVADAS (decision del usuario; descartado: activadas por defecto). Si los datos guardados estan corruptos, se usa el valor por defecto.
- Al activar una pista se pinta en todos los fallos de la partida, tambien los anteriores, porque ya estan en `GameView.hints` (DEC-50). Tambien aplica al diario terminado guardado (`DailyRecord.view`).
- `AttemptList`: en cada fila de fallo, burbuja de consola (verde = coincide, roja = no) con un icono ✓/✗ ademas del color (no depender solo del color) y `aria-label` "Consola: GBA, coincide"/"no coincide". Flecha de fecha con `aria-label` "La cancion buscada es de un juego anterior/posterior".

DEC-53: **Cada cancion pertenece a un solo juego** (decision del usuario; los grupos como Red/Blue/Yellow cuentan como uno, DEC-25). El validador exige `games.length === 1`; el formato de `games` sigue siendo un array, asi que la API y el JSON no cambian. El catalogo real ya lo cumple (comprobado: 1705 canciones, ninguna con mas de un juego). La regla de "juego acertado" (DEC-17) da el mismo resultado: interseccion de un elemento = igualdad.
Alternativa descartada: varios juegos por cancion. La pista de fecha no tendria un juego unico con el que comparar.

DEC-54: **Cada grupo de seleccion tiene la misma probabilidad de salir, en diario y en libre, independientemente de cuantas canciones tenga** (decision del usuario, iteracion `feature/pistas-y-filtro-juego`). La seleccion es en dos pasos: primero un grupo equiprobable y despues una cancion uniforme entre las canciones activas del grupo (DEC-09 diario, determinista; DEC-10/DEC-20 libre, aleatorio). Los grupos se ordenan por su id, no por la posicion de sus juegos en `games`: se descarto el orden de primera aparicion porque mover o insertar un juego en `games` (necesario al anadir juegos por fecha de salida) cambiaria la cancion del dia de todo el catalogo.
- Grupo de seleccion: campo opcional `Game.selectionGroup` en `catalog.json`. Si falta, vale el id del propio juego, asi que cada juego es su propio grupo. Por decision del usuario, Black/White + Black 2/White 2 forman un grupo y Sun/Moon + Ultra Sun/Ultra Moon otro. Las asignaciones del catalogo real las hace el usuario.
  - Solo afecta a la probabilidad. Para el filtro, las pistas (DEC-50), el feedback de juego y la busqueda siguen siendo juegos separados.
  - Validacion (`shared/catalog.ts`): si existe, debe ser el id de un juego del catalogo cuyo propio grupo es el mismo, es decir, el juego "cabeza" del grupo, sin cadenas. Asi una errata no crea en silencio un grupo nuevo. Ejemplo: `pokemon-black2-white2.selectionGroup = "pokemon-black-white"`.
  - Admin local: `PATCH /api/games/:id` acepta `selectionGroup`; la UI ofrece un desplegable con "su propio grupo" o un juego cabeza. El servidor rechaza un valor que rompa la regla anterior (`400 VALIDATION_ERROR`).
  - El backend no lo expone en `/catalog` (no lo necesita el cliente).
- Motivo: la eleccion uniforme por cancion favorecia a los juegos con mas canciones. Por ejemplo, HeartGold/SoulSilver tiene ~140 canciones activas frente a 15 de Ultra Sun/Ultra Moon, asi que salia unas 9 veces mas. Cada cancion pasa a tener probabilidad `1 / (grupos * canciones_de_su_grupo)`. Agrupar BW con B2W2 y SM con USUM evita que dos entregas de la misma generacion y estilo sonoro pesen el doble que el resto.
- Alternativas descartadas: uniforme por cancion (la seleccion anterior); un juego por grupo sin excepciones (BW/B2W2 y SM/USUM pesarian el doble; decision del usuario).
- Despliegue: la etiqueta pasa de `daily|v1|` a `daily|v2|`, y la cancion del dia cambia desde el momento del despliegue. Quien ya tuviera la partida diaria empezada sigue con su cancion, porque el token la guarda; quien la empiece despues recibe otra. Hay que desplegar el backend cerca de las 00:00 de Madrid.
- Tests:
  - Diario con `DAILY_SEED` y fecha fijos: valor exacto, con los bytes 0-5 para el grupo y 6-11 para la cancion (`BE-DAY-05`). Los grupos van ordenados por id.
  - En 365 dias, cada grupo sale con frecuencia parecida aunque tenga 1 o 100 canciones. Un grupo de dos juegos reune sus canciones en un solo sorteo.
  - Un grupo sin canciones activas nunca sale. Un catalogo de un juego con una cancion sigue funcionando. Sin `selectionGroup`, cada juego es su propio grupo.
  - Libre con `randomInt` inyectado: solo cuentan los grupos con algun juego filtrado y con canciones activas. Con solo B2W2 filtrado, el grupo BW/B2W2 cuenta y solo aporta canciones de B2W2.
  - Validador y admin: `selectionGroup` que no existe, que apunta a un juego que no es cabeza, o en cadena -> error.

DEC-55: **Un solo volumen para el clip y para el video de la cancion completa** (decision del usuario), deslizador "Volumen" de 0 a 100 % en el reproductor y bajo el video abierto. Es el mismo valor en los dos sitios y en diario y libre; se guarda en `localStorage` `heardle:volume` (0..1, por defecto 1, acotado; si no se puede escribir, sigue en memoria).
- Clip: `ClipPlayer.setVolume(v)`. En Web Audio el volumen va en la ganancia de cada fuente (la misma que hace el fundido de DEC-45, cadena fuente -> ganancia -> destination sin nodo extra): arranca a `v`, el fundido final baja de `v` a 0 y la pausa funde desde `v`. Cambiarlo sonando cancela lo programado y lo rehace desde `currentTime`. En la ruta `<audio>` se asigna `audio.volume` (en iOS es de solo lectura y no tiene efecto; ahi suena por Web Audio).
- Video: el iframe lleva `?enablejsapi=1` y se le manda `{"event":"command","func":"setVolume","args":[0..100]}` por `postMessage`, siempre con destino `https://www.youtube-nocookie.com`. No se carga el script de la IFrame API (no hace falta tocar la CSP, que solo permite `frame-src`). El reproductor ignora ordenes hasta estar listo: al cargar el iframe se manda `{"event":"listening"}` y el volumen, y se repite el volumen con cada mensaje del reproductor (origen y `source` comprobados) hasta recibir `onReady`. Mover el volumen desde los controles de YouTube no actualiza el deslizador.
Alternativas descartadas: dos deslizadores independientes (decision del usuario); un nodo de ganancia maestro (cambiaria la cadena de DEC-45 sin ventaja); cargar `https://www.youtube.com/iframe_api` (obligaria a abrir `script-src` en la CSP).

DEC-56: **Duplicados entre fuentes por similitud de cromagrama** (subcomando `similar <juegoId>`, `scripts/catalog/src/similar.ts`). Cuando un juego mezcla playlists, la misma pista llega con titulos distintos y solo se detecta por audio. Se decodifican 90 s de cada fuente desde su `startSec` (ffmpeg, mono, 11.025 Hz). Se calcula la energia por clase de tono (12 semitonos, 60-4000 Hz, ventanas de 2048 muestras con salto de 1024, log, centrado y norma 1). Dos canciones puntuan la maxima media del coseno por ventana sobre todos los desfases con solape de 20 s, o del 70 % de la mas corta, y nunca menos de 3 s; la correlacion se hace con FFT. Umbral por defecto 0,8, calibrado con Sun/Moon y Legends Arceus: misma pista 0,82-0,98 (resubidas de otro canal, reversiones de otra duracion); pistas distintas del mismo juego, 0,79 como mucho. Solo informa, no cambia el catalogo.
Alternativas descartadas: script Python con numpy (anadia una dependencia fuera del proyecto TS y sin tests en vitest); `fpcalc`/Chromaprint (no esta instalado y su huella exige el mismo punto de inicio, y aqui cambia segun el canal); comparar titulos (los canales nombran distinto la misma pista).

DEC-57: **Frontend en GitHub Pages y API en una Supabase Edge Function (`heardle`) del mismo proyecto; Render y Vercel se retiran** (rama `feature/github-pages`, decision del usuario 2026-11-07). Motivo: el arranque en frio de Render free (hasta ~90 s, DEC-14) obligaba a esperar; una Edge Function arranca en ~0,2-1 s y GitHub Pages sirve la web sin espera.
- Se mantiene el antitrampas: token cifrado, ticket de clip de un solo uso, prefijo por intento, catalogo publico sin `clipKey`. Descartado: web 100 % estatica (catalogo, cancion del dia y clips publicos), porque la respuesta y los 16 s completos quedarian a la vista en las herramientas del navegador.
- Un solo manejador HTTP con `Request`/`Response` estandar (`backend/src/http/handler.ts`), con dos anfitriones: Node (`backend/src/index.ts`, desarrollo local y e2e) y Deno (`backend/src/edge/main.ts`, empaquetado con esbuild en `supabase/functions/heardle/`). Express se elimina. Descartado: reescribir la API para Deno aparte, porque duplicaria la logica y los tests.
- Tickets usados: en la memoria de cada instancia, como hoy (decision del usuario). Efecto aceptado: si una peticion cae en otra instancia, un ticket se puede canjear otra vez durante su TTL de 60 s; sigue dando solo el prefijo de ese intento.
- Rate-limit (DEC-13): en la Edge Function, en Postgres (tabla `heardle.rate_limits` y funcion `public.heardle_rate_limit_hit`, solo para `service_role`, llamada por PostgREST). Motivo: en memoria cada instancia cuenta por su lado y se recicla a menudo, asi que el limite no frenaria nada. En Node sigue en memoria. Una llamada por peticion con todas las comprobaciones (las claves, IP y nonce, van como hash: la tabla no guarda IP). Si la RPC falla, la peticion sigue (se registra el error): un fallo del contador no debe tumbar el juego. La limpieza de ventanas caducadas la hace la propia funcion de vez en cuando (1 %), sin `pg_cron`.
- Catalogo y clips: la funcion los lee de Storage (`heardle-audio`, sigue privado) con la API REST y la clave `service_role`, sin SDK de S3. Catalogo y cache LRU viven en la memoria de la instancia; una peticion que llega con el catalogo sin cargar lo espera (hasta 8 s) en lugar de responder 503.
- Medido en produccion (2026-11-07, desde Espana; funcion en eu-west-3, base de datos en eu-west-1): arranque en frio ~1,4 s en la primera peticion; en caliente ~150-200 ms de red mas ~30-150 ms de la RPC del rate-limit; primer clip ~1 s (lectura de Storage, despues queda en la cache de la instancia). IP del cliente: el proxy de Supabase reescribe `X-Forwarded-For`, asi que su primera entrada es fiable (una cabecera falsa no cambia la clave contada).
- Fin de Render y Vercel (hecho tras comprobar la web publicada en GitHub Pages, decision del usuario): se borran `render.yaml`, `frontend/vercel.json`, el driver S3 del backend (`S3ClipStore`, `@aws-sdk/client-s3`, variables `STORAGE_S3_*` del backend) y sus tests. El script de catalogo sigue subiendo por S3 (DEC-08). Los servicios de Render y Vercel los da de baja el usuario.
- Despues de la migracion, en la misma rama, se repasa la interfaz partiendo del estilo actual (DEC-46). La propuesta se ensena al usuario antes de implementarla.
- Orden de puesta en produccion (decision del usuario): primero el rediseno, despues el despliegue completo (secretos `HEARDLE_*` puestos por el usuario, funcion, Pages y merge). Estado a 2026-11-07: migracion del rate-limit aplicada y funcion desplegada sin secretos (responde 500, nadie la usa); queda un secreto `ALLOWED_ORIGIN` sin prefijo que no usa nadie, pendiente de borrar con confirmacion.

DEC-58: **Rediseno "Pokedex completa"** (rama `feature/github-pages`, decision del usuario 2026-11-07, sustituye la composicion de DEC-46 y mantiene sus tokens y su comportamiento). Motivo: con DEC-46 la pantalla se veia vacia y los elementos demasiado simples, sobre todo en escritorio.
- Escritorio: el juego es una Pokedex roja abierta que ocupa la pantalla. Hoja izquierda: lente, luces, logo y fecha; pantalla oscura del reproductor dentro de un marco claro; "Saltar", boton de reproducir azul, volumen y buscador. Bisagra en el centro. Hoja derecha: "Pistas" y Diario/Libre arriba; historial como pantalla de "entradas"; leyenda como teclas. Fondo oscuro con puntos.
- Movil: las dos hojas se apilan (bisagra horizontal); se ocultan los adornos que no caben (cruceta, rejilla del altavoz, leyenda).
- Descartadas (maquetas ensenadas al usuario): estilo de los menus de daily-pwt (placas con esquinas cortadas, fuente de pixel) y consola portatil apaisada (cruceta y botones A/B).
- Estados aprobados por el usuario sobre maqueta (2026-11-07): carga (pantallas "Conectando..." y controles apagados), buscador y desplegable como pantalla LCD verde (la de la maqueta de consola); el texto que se escribe usa la misma fuente que los titulos del desplegable (Rubik en negrita, decision del usuario), victoria/derrota con la lente en verde/rojo y el resultado en la pantalla, panel de pistas como mini-Pokedex, y modo libre con el numero de canciones en juego a la izquierda y los juegos en la pantalla derecha.
- El boton "Escuchar la cancion completa" es azul plano, sin degradado ni brillo (decision del usuario).
- El diario terminado muestra una cuenta atras hasta la siguiente cancion del dia (medianoche de Europe/Madrid), en lugar del texto "Vuelve manana..." (decision del usuario).
- El aspecto es el mismo en modo claro y oscuro: la Pokedex ya es roja sobre fondo oscuro (decision del usuario). Los tokens claros/oscuros de DEC-46 dejan de cambiar la pagina del juego.

DEC-59: **Reparto de la Pokedex: buscador en la hoja derecha, sin desplazar la pagina** (decision del usuario 2026-11-07, ajusta DEC-58). Motivo: en escritorio el desplegable del buscador quedaba bajo el borde inferior de la ventana y habia que hacer scroll para ver los resultados.
- Hoja izquierda: cabecera (lente, logo, fecha), controles (Pistas y Diario/Libre), reproductor o resultado, y la leyenda. Hoja derecha: historial arriba y, debajo, la pantalla LCD del buscador.
- La pantalla del buscador tiene un hueco de resultados de alto fijo (192 px en movil, 220 px en escritorio) con scroll propio; sin texto muestra "Escribe el nombre de una cancion o de un juego.". La lista no flota sobre la pagina. Su barra de scroll usa los colores de la pantalla (`.dex-lcd-scroll`: `scrollbar-color` y los pseudoelementos `::-webkit-scrollbar` para Safari). Descartado: lista que crece con los resultados (volveria a empujar la pagina).
- Movil: mismo orden que escritorio, apilado (decision del usuario).
- Fondo detras de la Pokedex: negro puro, sin trama de puntos (decision del usuario).
- Alto estable (peticion del usuario: la Pokedex cambiaba de tamano al cambiar de modo, al elegir juegos y con "Filtro para la proxima partida"): en escritorio un alto minimo comun a todos los estados, `min(860px, 100dvh - 24px)` (sin scroll del navegador desde ~890 px de alto de ventana); todas las filas del historial miden lo mismo (60 px), jugadas o pendientes, para que no crezca al saltar; la lista del buscador se estira para llenar la hoja derecha (minimo 140 px); el aviso "Elige al menos un juego" ocupa un hueco fijo este o no; tras una partida libre, "Empezar partida" y su resumen van en la hoja derecha (el aviso y el resumen comparten hueco) y la lista de juegos queda plegada bajo "Nueva partida". Solo crece si el usuario abre una lista (juegos, video de la cancion completa).
- "Filtro para la proxima partida" (en juego) y "Nueva partida" (al terminar), en el modo libre, son un boton (`aria-expanded`) que abre el selector de juegos con "Empezar partida" EN LUGAR del historial y del buscador (que se ocultan con el atributo `hidden`, sin desmontarse: no se pierde lo escrito) y al cerrarlo vuelven; se cierra solo al empezar otra partida. Peticion del usuario: el desplegable abierto debajo seguia estirando la Pokedex. Descartado: el `<details>` anterior.
- La lista de juegos del modo libre hace scroll dentro de su pantalla en escritorio, como la del buscador: con los spin-offs (27 juegos) estiraba la Pokedex.
- Metricas de la fuente del logo fijadas en el `@font-face` (`ascent-override`, `descent-override`, `line-gap-override` con los valores de hhea): Windows usaba las OS/2 win, mucho mas altas, y el logo pisaba la fecha.
- Lente como la de la Pokedex del anime (referencia del usuario): aro blanco, color de estado (azul profundo en juego, verde al acertar, rojo al perder), un unico brillo casi blanco de bordes nitidos arriba a la izquierda y una sombra suave abajo. Mientras suena el clip o se reproduce el vídeo de YouTube tras acertar, cambia de golpe a turquesa claro y vuelve, cada 0,3 s (solo cambia la opacidad de una capa; sin parpadeo con `prefers-reduced-motion`). Activa el parpadeo del vídeo solo en el estado de reproducción de YouTube y desactívalo al pausar, cargar, terminar, fallar o desmontar el reproductor. Filtra los mensajes por origen y por la ventana del iframe (DEC-55). Descartados por el usuario: destello con halo grande y estrella ("tiene forma"), brillo difuminado y dos brillos superpuestos.
- Favicon SVG (`frontend/public/favicon.svg`): Pokeball con una corchea amarilla, con contorno negro para leerse a 16 px sobre pestanas claras y oscuras.
- Cancion completa (DEC-41): al pulsar "Escuchar la cancion completa", el video va dentro de la pantalla del resultado, en el sitio del titulo grande (como mucho 360 px de ancho en escritorio), con la cancion y el juego en una linea encima (RQ 8: la solucion sigue a la vista) y el volumen en el hueco del boton; asi la Pokedex no crece al abrirlo (peticion del usuario). El hueco del video existe desde el principio (oculto): si apareciera al abrir, el iframe se crearia dos veces.
- Ajuste de DEC-58: la fecha bajo el logo lleva mas separacion (el logo la pisaba en algunos navegadores).

DEC-60: **Diario de spin-offs y juegos spin-off en el modo libre** (rama `feature/diario-spinoffs`, decision del usuario 2026-11-07). Spin-offs iniciales: Mundo Misterioso, Ranger, Colosseum y XD; se pueden anadir otros despues sin cambiar codigo.
- Catalogo: `Game.series?: 'main' | 'spinoff'` (ausente = `main`). Cada spin-off con banda sonora distinta es un juego aparte (DEC-25). Consola nueva `GC` (GameCube) en `CONSOLES`. El admin edita `series` igual que las consolas. `/catalog` publica la serie de cada juego.
- Seleccion: el diario principal solo elige entre juegos `main` con la misma semilla y etiqueta de siempre (`daily|v2|fecha`, DEC-09), asi que anadir spin-offs no cambia la cancion del dia principal. El diario spin-off elige entre juegos `spinoff` con `daily-spinoff|v1|fecha` y los mismos grupos equiprobables (DEC-54). Libre: cualquier juego del filtro, de cualquier serie (DEC-10).
- API: `POST /games` con `{ mode: 'daily', series?: 'main' | 'spinoff' }` (por defecto `main`). El token distingue el diario spin-off (`m: 's'`); `GameView` lleva `series` en los diarios. Sin canciones spin-off, `series: 'spinoff'` responde `400 EMPTY_FILTER`.
- Pistas (DEC-50): la de fecha compara por fecha de salida contra todos los juegos (orden de `catalog.games`, mezclando series); la de consola igual que siempre.
- Interfaz: dentro de Diario, un conmutador Principal / Spin-off; recuerda la ultima opcion (`localStorage` `heardle:dailySeries`) y solo aparece si el catalogo tiene juegos spin-off. Cada diario tiene su registro (`daily:<fecha>` y `daily-spinoff:<fecha>`), su cuenta atras y su subtitulo ("SPIN-OFF DEL DIA").
- Buscador por modo (sustituye la regla de DEC-17 de mostrar siempre el catalogo completo): diario principal, solo canciones y juegos `main`; diario spin-off, solo `spinoff`; libre, solo los juegos con los que empezo la partida (se guardan con la partida; cambiar el filtro a mitad no cambia el buscador hasta la siguiente).
- Filtro del modo libre: dos secciones, "Principales" y "Spin-offs", cada una con su "Todos"; los spin-offs no se marcan solos (ni en filtros guardados ni en el filtro por defecto, que son todos los principales).
- Orden de puesta en produccion: primero el codigo (merge) y la Edge Function desplegada, despues `upload` del catalogo con spin-offs. Motivo: la funcion anterior no conoce la consola `GC` ni el campo `series`; su validador rechazaria el catalogo nuevo y la API quedaria sin catalogo (`CATALOG_UNAVAILABLE`). La funcion nueva acepta el catalogo viejo, asi que al reves no hay problema.
- Descartados: tercer boton Diario / Spin-off / Libre (el usuario prefiere el conmutador dentro de Diario) y mezclar las series en una sola lista del filtro.

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
- Cuerpo: prefijo del clip unico hasta `CLIP_BYTE_OFFSETS[intento]` (DEC-44).
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

Reglas del validador (`shared/catalog.ts`, usado por script y backend): ids unicos con el formato de DEC-29; `clipKey` unico, 16 hex; todo juego referenciado existe; `games` con exactamente un juego (DEC-26, DEC-53); `games[].selectionGroup` opcional, id de un juego cabeza de grupo (DEC-54); `games[].consoles` opcional, y si existe, lista no vacia y sin repetidos de `CONSOLES`, en orden canonico (DEC-51); `startSec >= 0`; `source.youtubeId` con formato `[A-Za-z0-9_-]{11}` (DEC-41); `source.durationSec` opcional, numero finito > 0 (DEC-40); cancion `enabled` y corta (DEC-40) -> error. El backend solo usa canciones con `enabled: true`.

Script `scripts/catalog` (TS con `tsx`), subcomandos idempotentes:

1. `fetch <playlistUrl>`: `yt-dlp --flat-playlist -J` para listar; descarga `bestaudio` a `data/work/<youtubeId>.*` con `--download-archive` (no repite descargas).
2. `draft`: mide con `ffprobe` la duracion de las fuentes descargadas que aun no tienen `source.durationSec` y con `ffmpeg silencedetect` su silencio inicial (`source.leadingSilenceSec`, que fija `startSec`, DEC-47) y desactiva las cortas (DEC-40); fusiona en `catalog.json` los videos nuevos (por `youtubeId`), con titulo/juego derivados del titulo del video (`parseTitle.ts`), `startSec: 0`, `reviewed: false`, `clipKey` aleatorio; si el titulo no permite deducir el juego, `games: []` (DEC-26). **Nunca sobrescribe entradas existentes** (conserva la revision manual).
3. Revision en el admin local (`npm run cli -- admin`, seccion 6.1) o a mano en `catalog.json`.
4. `build`: por cancion activa, `ffmpeg -ss startSec -t 16` -> `loudnorm` -> master de 16 s; de el, UN clip de 16 s (MP3 CBR 128k estereo, `-reservoir 0`, `-map_metadata -1 -id3v2_version 0 -write_xing 0 -fflags +bitexact`, fundido de 50 ms al final de los 16 s) en `data/out/clips/<clipKey>.mp3`, y borra el directorio antiguo `data/out/clips/<clipKey>/` si existe (DEC-44). Solo recompila si cambian `startSec` o la fuente; un clip con el layout antiguo cuenta como no compilado. Antes de cortar mide la fuente; si es corta la desactiva, la registra en el catalogo y sigue con las demas sin fallar (DEC-40).
5. `validate`: esquema; un clip por cancion activa; tamano exacto `CLIP_TOTAL_BYTES`; recorrido de cabeceras de trama: 614 tramas, todas MPEG-1 L3 128k 44.1k estereo, la primera sin Xing/Info y sin ID3; cada offset de `CLIP_BYTE_OFFSETS` es limite de trama; `main_data_begin == 0` en todas las tramas (sin reservoir); duracion por `ffprobe` del fichero entero dentro de la tolerancia actual; sin etiquetas de metadatos. Asi la garantia "mismo tamano por intento entre canciones" se comprueba por construccion. Falla con codigo != 0.
6. `upload`: ejecuta `validate`, sube los clips nuevos o cambiados (`clips/<clipKey>.mp3`, por md5, DEC-23), nunca los originales de `data/work/`, y por ultimo `catalog.json`, para que el catalogo nunca apunte a clips no subidos. `--prune` borra todo lo que hay bajo `clips/` y no es el clip de una cancion activa (incluidas las carpetas `clips/<clipKey>/` antiguas); en la migracion se ejecuta despues de desplegar el backend nuevo (DEC-44). Tras subir, reiniciar el backend en Render para recargar el catalogo.

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
| `PATCH /api/games/:id` | `{ name?, consoles?, selectionGroup? }` | `{ id, name, consoles, selectionGroup }` (nunca cambia el id, DEC-39; consolas, DEC-51; grupo, DEC-54) |
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
- `localStorage` (prefijo `heardle:`): `filter`; `settings` (`{ consoleHint, dateHint }`, DEC-52); `volume` (numero de 0 a 1, DEC-55); `daily:<date>` -> `DailyRecord = { token, finished, view? }`, donde `view` es la `GameView` final (con `solution` y `results`), para mostrar un diario terminado sin llamar a la API; `unlimited` -> partida en curso. (RETIRADAS: `stats:daily` y `stats:unlimited`, DEC-43.) Durante la partida solo hay token cifrado y las jugadas propias.
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
- Buscador con burbuja de juego (DEC-49), panel de ajustes y pistas en `AttemptList` (DEC-50, DEC-52).
- Reproduccion con fundido de 50 ms via Web Audio y fallback a `<audio>` (DEC-45).
- Barra de reproduccion (DEC-42): `ClipProgressBar({ clipSeconds, unlockedSec, positionSec, playing })`. `ClipPlayer` amplia su interfaz con `subscribe(listener) -> unsubscribe`, que emite `{ playing, positionSec }` con `requestAnimationFrame` mientras suena y al parar/terminar.
- Cancion completa al terminar (DEC-41): componente `FullSongEmbed({ youtubeId })` dentro de `ResultPanel`, renderizado solo cuando `status !== 'playing'` y existe `solution`. Muestra el boton "Escuchar la cancion completa"; el iframe se crea al pulsarlo y en ese momento se para el clip.

## 8. Seguridad

- Ningun dato de la cancion objetivo sale del servidor antes de terminar: token y tickets cifrados con longitud fija; rutas opacas; sin ETag; clips CBR de tamano fijo por intento; sin metadatos en el MP3.
- Secretos solo en variables de entorno; `config.ts` aborta el arranque si faltan o son cortos (`GAME_TOKEN_SECRET` >= 32 bytes en base64).
- Bucket privado; credenciales de solo backend/script, nunca en el frontend.
- Entrada validada en cada endpoint; tamano de cuerpo limitado (`express.json({ limit: '4kb' })`).
- IP del cliente: en la Edge Function, primera entrada de `X-Forwarded-For` (el proxy de Supabase la reescribe, DEC-57); en el servidor Node local, `TRUST_PROXY` saltos de confianza.
- Embed de YouTube (DEC-41): `youtubeId` validado con `[A-Za-z0-9_-]{11}` en `shared/catalog.ts` y codificado al construir la URL; `frontend/index.html` lleva en una `<meta>` la `Content-Security-Policy: frame-src https://www.youtube-nocookie.com` (solo restringe iframes; no hay CSP global hoy). El iframe usa `referrerpolicy="strict-origin-when-cross-origin"` (YouTube rechaza embeds sin `Referer`) y `allow="encrypted-media; picture-in-picture; fullscreen"`.
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
- Cache LRU de clips en memoria limitada por bytes (`CLIP_CACHE_MB`, defecto 32): un fichero de ~250 KB por cancion (DEC-44); la cancion del dia se pide muchas veces. Cortar un prefijo es un `subarray`, sin copia ni CPU apreciable. Render free tiene 512 MB.
- Clips pequenos (16-260 KB); sin transcodificacion en servidor (decision cerrada).
- Arranque: descarga de `catalog.json` antes de `listen`; si falla, se escucha igualmente, `/health` devuelve 503 y se reintenta en segundo plano con backoff.

## 10. Variables de entorno

Backend:

| Variable | Ejemplo / defecto | Uso |
|---|---|---|
| `PORT` | 3002 | puerto del servidor Node |
| `NODE_ENV` | production | |
| `ALLOWED_ORIGIN` | https://quimikuaxh.github.io | CORS |
| `GAME_TOKEN_SECRET` | 32+ bytes base64 | clave maestra de tokens y tickets |
| `DAILY_SEED` | cadena aleatoria larga | semilla de la cancion diaria; cambiarla cambia todas las canciones del dia |
| `STORAGE_DRIVER` | `supabase` (Edge Function) / `fs` (local, tests) | |
| `STORAGE_DIR` | ../scripts/catalog/data/out | raiz local con `catalog/` y `clips/` (driver fs) |
| `STORAGE_BUCKET` | heardle-audio | driver supabase |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | los inyecta Supabase en la funcion | driver supabase y rate-limit postgres (DEC-57) |
| `RATE_LIMIT_STORE` | `memory` (Node) / `postgres` (Edge Function) | DEC-13, DEC-57 |
| `CATALOG_WAIT_MS` | 0 (Node) / 8000 (Edge Function) | espera del catalogo antes de responder 503 |
| `CLIP_TICKET_TTL_SEC` | 60 | |
| `CLIP_CACHE_MB` | 32 | |
| `TRUST_PROXY` | 1 | |
| `RATE_LIMIT_GLOBAL` | 120 | por IP, todo `/api`, peticiones/min |
| `RATE_LIMIT_CREATE_GAME` | 20 | por IP, `POST /games` |
| `RATE_LIMIT_ACTION` | 40 | por IP, `/games/guess` + `/games/skip` |
| `RATE_LIMIT_CLIPS` | 30 | por IP, `/clips` |
| `RATE_LIMIT_PER_GAME` | 12 | por partida (nonce), acciones |

Frontend: `VITE_API_URL` (URL de la Edge Function, `https://<ref>.supabase.co/functions/v1/heardle`; en local Vite proxifica `/api`, como claude-test).
Edge Function: los valores por defecto de `STORAGE_DRIVER`, `RATE_LIMIT_STORE`, `STORAGE_BUCKET` y `CATALOG_WAIT_MS` estan en `backend/src/edge/main.ts`; los secretos son `HEARDLE_GAME_TOKEN_SECRET`, `HEARDLE_DAILY_SEED` y `HEARDLE_ALLOWED_ORIGIN`: los secretos de Edge Functions son de todo el proyecto, compartido con daily-pwt, y el prefijo evita choques; `edge/main.ts` lo quita y solo lee sin prefijo `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
Script de catalogo (`scripts/catalog/.env`, ignorado): `STORAGE_BUCKET`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID` y `STORAGE_S3_SECRET_ACCESS_KEY` (claves S3 de Storage, DEC-08).

## 11. Estrategia de tests

Versiones alineadas con claude-test: vitest 4, TypeScript (backend ^6, frontend ~5.9), React 19, Vite 8, Tailwind 4, Playwright para E2E.

Unitarios backend (vitest):
- `daily`: mismo dia -> misma cancion independientemente de cualquier filtro; seleccion sobre todo el catalogo `enabled`; catalogo de 1 cancion; cambio de dia en Madrid en horario de verano (22:00Z) e invierno (23:00Z) y en los dias de cambio de hora. `POST /games` diario con `games` -> `VALIDATION_ERROR`.
- `catalog` (ilimitado): pool por filtro, filtro vacio, juego inexistente, pool de 1.
- `token`: ida y vuelta; un byte alterado -> invalido; caducado -> invalido; **longitud identica para ids de cancion de distinta longitud y para 0..6 resultados**; el token no contiene en claro id, titulo ni `clipKey`; token no valido como ticket y viceversa.
- `engine`: H/G/M/S; cancion en varios juegos (interseccion); 6.o fallo -> perdida; accion tras fin -> `GAME_OVER`; cancion repetida -> `ALREADY_GUESSED` sin consumir intento ni cambiar el token.
- `tickets`: un solo uso; caducidad; el indice corresponde al intento actual.
- Pistas (DEC-50), unitarios del backend con `computeHint`:
  - Consola: coincide y no coincide; las cuatro reglas de Z-A; juego sin `consoles` -> `null`.
  - Fecha: `earlier`, `later`, mismo juego -> `null`.
  - En `buildGameView`: `hints` alineado con `results`; `null` en skip y en hit; emparejamiento correcto con skips intercalados.
  - Prueba de fuga: con hints, las respuestas siguen sin contener id ni nombre del juego buscado.
- Catalogo (DEC-51, DEC-53): validador con `consoles` invalida, desordenada o repetida y con cancion de 0 o 2 juegos; `validate` del script exige consolas; admin `PATCH` de consolas.
- Frontend:
  - `searchCatalog`: dos grupos, burbuja, sustitucion, texto vacio con burbuja.
  - Teclado del buscador: flechas entre grupos, Enter, Escape, Backspace quita la burbuja; foco y `aria-*`.
  - Panel de ajustes: dialogo, foco, Escape, persistencia y datos corruptos.
  - `AttemptList` pinta u oculta cada pista segun los ajustes, tambien en fallos anteriores, con iconos y `aria-label`.
  - E2E: burbuja y busqueda; activar una pista a mitad de partida y verla en los fallos anteriores; ajustes tras recargar. Los fixtures `R`/`M` necesitan `consoles` y al menos dos juegos ordenados.
- Frontend `ClipPlayer` con `AudioContext` simulado (DEC-45): decodifica en `prepare` y no en `play`; `play` llama a `resume()` si esta suspendido y a `source.start` de forma sincrona; programacion exacta de la ganancia (1 hasta `d - 0.05`, rampa a 0 en `d`); fuente nueva en cada `play` y la anterior parada; posicion desde `ctx.currentTime` limitada a `d`; `onended` y `statechange` a `interrupted`/`suspended` emiten `playing: false`; `stop` y `dispose` (cierra el contexto); fallback a `<audio>` sin `AudioContext` o si `decodeAudioData` rechaza; `audioSession.type = 'playback'` cuando existe.
- Clip unico (DEC-44): `shared/rules` recalcula `CLIP_FRAME_COUNTS`/`CLIP_BYTE_OFFSETS` con la formula y el patron de tramas; el backend sirve exactamente `CLIP_BYTE_OFFSETS[i]` bytes por intento y que el cuerpo es prefijo del fichero; un fichero de tamano distinto o sin cabecera de trama en un offset -> `502 STORAGE_ERROR` sin consumir ticket; la cache guarda una entrada por cancion (clave `clipKey`) y la reutiliza en todos los intentos; `isValidClipLocation` sin numero de clip.
- `shared/catalog`: validador con casos invalidos (ids duplicados, juego inexistente, `clipKey` mal formado, `youtubeId` fuera de formato, `durationSec` invalido, cancion activa y corta).
- `engine`/vista: `solution.youtubeId` presente al ganar y al perder, ausente en partidas en curso.

Integracion backend (vitest, `createApp` + `app.listen(0)` + `fetch`, como claude-test; `FsClipStore` con catalogo y clips de prueba):
- Flujo completo ganar/perder/skip; recuperacion con `/games/state`; errores de la tabla de la seccion 5; 429 con `Retry-After`.
- **Prueba de fuga**: durante una partida completa, se serializan todas las respuestas (cuerpo y cabeceras) antes del final y se comprueba que no aparecen id, titulo, `clipKey`, `youtubeId` ni nombre de fichero de la cancion objetivo. Tras terminar, `youtubeId` aparece SOLO dentro de `solution`; `/catalog` no lo contiene nunca.
- Cabeceras de `/clips`: sin ETag, con `no-store`, `Content-Length` = offset del intento e igual entre canciones; segunda peticion al mismo ticket -> 410.

Frontend (vitest + Testing Library + jsdom):
- Sin compartir ni estadisticas (DEC-27, DEC-43): limpieza de las claves `stats:*` antiguas; filtro solo visible en ilimitado y vacio deshabilita empezar; apertura del diario sin llamada a la API si ya esta terminado; buscador deshabilita canciones ya intentadas; hook de arranque en frio con temporizadores falsos; recuperacion con `TOKEN_INVALID`; `ClipProgressBar` (posicion de marcas, zona desbloqueada por intento, limite del cabezal); `ClipPlayer.subscribe` con un audio falso; `FullSongEmbed` ausente en juego; al terminar, boton sin iframe hasta pulsarlo; tras pulsar, URL `youtube-nocookie` y `referrerpolicy`.

Script (vitest): clip unico (DEC-44): `clipArgs` con `-reservoir 0` y salida `<clipKey>.mp3`; `build` borra el layout antiguo; `validate` rechaza tamano distinto, offset que no es limite de trama, trama con `main_data_begin != 0`, primera trama Xing/Info, ID3; `upload --prune` borra las carpetas antiguas y no el clip nuevo. `parseTitle`, fusion de `draft` (no pisa entradas revisadas), construccion de argumentos de ffmpeg (funciones puras). Iteracion admin-catalogo, siempre con `--data-dir` en un directorio temporal:
- `catalogStore`: escritura atomica (un fallo a mitad deja el original intacto), operaciones encoladas, `.bak` solo en la primera escritura.
- Regla de cancion corta en el limite exacto (`startSec + 16 + 0.1`), desactivacion en `draft`/`build` sin tocar otros campos ni activar nada, `validate` con cancion activa y corta.
- Handlers del admin: `PATCH` de cada campo, `TOO_SHORT`, juego inexistente o duplicado, crear/renombrar juego sin cambiar id, `403` sin token y con `Host` ajeno, audio por id (no por ruta), `Range` (`bytes=0-`, `bytes=a-b`, sufijo, fuera de rango -> 416), `youtubeId` con `-` inicial.
- `admin-ui` (vitest + Testing Library): modulo puro de filtros/busqueda, edicion de titulo y juegos, bloqueo de activar cancion corta, obtencion del token via `/api/session`; `PATCH` con `startSec` -> ignorado/rechazado. `validate` se ejecuta contra fixtures si ffmpeg esta instalado; si no, se marca omitido.

E2E (Playwright en `e2e/`, backend con driver `fs` y fixtures de tonos senoidales versionados, sin copyright). Con DEC-44 `generate-fixtures.ts` (lamejs) genera un `clips/<clipKey>.mp3` de 16 s por cancion y comprueba que coincide con `CLIP_TOTAL_BYTES` y con los offsets (comprobado: lamejs produce la misma disposicion de tramas que ffmpeg/LAME). lamejs no permite desactivar el reservoir: los fixtures lo usan, y el chequeo `main_data_begin == 0` es solo de `validate` del script, no del backend. Duracion por intento en E2E (`HTMLMediaElement.duration`, incluye el retardo de 1105 muestras): 1,0188 / 2,0114 / 4,0229 / 7,0008 / 11,0237 / 16,0392 s, es decir, entre N y N + 40 ms. El audio real queda entre N - 24 ms y N:
- Partida ganada, perdida y con skips; feedback de juego acertado/fallado; revelacion final y bloqueo posterior.
- Recarga en mitad de partida; diario ya jugado (sin `POST /games`); diario igual en dos navegadores; ilimitado: filtro vacio, pool de una cancion, cambio de filtro a mitad; cancion ya intentada no seleccionable.
- Fuga: recoger todas las respuestas de red y el `localStorage` antes de terminar y buscar el titulo/id objetivo (criterio 1).
- Arranque en frio simulado (`page.route` devuelve 503 / retrasa `/health`): la UI muestra carga y se recupera (criterio 8).
- Viewport movil (iPhone, WebKit) y `colorScheme: 'dark'`.
- Barra de reproduccion visible al reproducir, con la zona desbloqueada creciendo con cada intento.
- Fundido (DEC-45): con un script de inicio que envuelve `GainNode.gain.linearRampToValueAtTime` y `decodeAudioData` se comprueba que cada `play` programa la rampa a 0 al final del buffer; las duraciones por intento se leen del `AudioBuffer` decodificado (ya no del `HTMLMediaElement`). El escaneo de fugas sigue cubriendo los bytes del clip por red. Una prueba con Web Audio deshabilitado (script de inicio que borra `AudioContext`) cubre el fallback. En WebKit/Linux el desbloqueo de iOS y el interruptor de silencio solo se aproximan: verificacion manual en iPhone.
- Al terminar (ganar y perder) aparece el boton y el iframe solo tras pulsarlo; antes de pulsar no hay iframe ni peticiones a `youtube-nocookie.com` (interceptadas con `page.route` para no depender de YouTube).
- Admin (opcional, Playwright contra `npm run cli -- admin --data-dir <tmp>`): editar, filtrar y oir con seek.

## 12. Despliegue

- Repo GitHub privado (cerrado). `.gitignore`: `node_modules`, `dist`, `.env*` (salvo `.env.example`), `scripts/catalog/data/`, `e2e/test-results`, `*.mp3` fuera de `e2e/fixtures`.
- Frontend en GitHub Pages (`.github/workflows/deploy.yml`, en cada push a `main`) y API en la Edge Function `heardle` (`npm run deploy:edge`); pasos en `DESARROLLO.md` (DEC-57).
- Storage: crear bucket privado `heardle-audio` en el proyecto Supabase de claude-test y claves en Storage -> S3 Access Keys (DEC-08).
- Orden de puesta en marcha: bucket -> script (`fetch`, `draft`, revision, `build`, `upload`) -> backend -> frontend.
- `DESARROLLO.md` documentara entorno local (driver `fs`, sin Supabase) y despliegue.

## 13. Riesgos tecnicos

- **Arranque en frio** de 30-60 s: mitigado solo en UI.
- **yt-dlp** cambia a menudo por cambios de YouTube: fijar version en el README y actualizar cuando falle.
- **Cambio de catalogo a mitad de dia** cambia la cancion diaria de partidas nuevas (DEC-09); ahora afecta a cualquier alta o baja en el catalogo, no solo a un juego concreto.
- **Clip unico (DEC-44)**: si un cambio de version de ffmpeg/LAME alterase el patron de tramas o el retardo, `validate` fallaria (tamano u offsets) antes de subir nada; habria que recalcular las constantes. El orden de despliegue de la migracion es obligatorio (backend nuevo antes de subir los ficheros nuevos -> todos los clips fallan).
- **Orden de juegos (DEC-48/DEC-51)**: ahora alimenta la pista de fecha; un juego nuevo anadido al final por `draft` da flechas erroneas hasta que se mueve a mano. `validate` no puede detectarlo.
- **Embed de YouTube**: videos retirados, privados o con el embed desactivado muestran el error de YouTube; no se detecta de antemano (fuera de alcance comprobarlo en `validate`, requiere red).
- **Escritura concurrente del catalogo entre procesos** (admin + `draft`/`build`): ventana de milisegundos sin bloqueo (DEC-37).
- **Tickets usados en memoria**: tras un reinicio un ticket aun no caducado (<= 60 s) podria reutilizarse una vez mas; impacto nulo (mismo clip del mismo intento).

## 14. Fuera de alcance tecnico

Admin desplegado o con login, borrado y fusion de juegos en el admin, oir los 6 fragmentos en el admin, editar `startSec` en el admin, comprobar en `validate` que los videos siguen siendo embebibles, CSP global del frontend, cuentas de usuario, base de datos, ranking global, sincronizacion de estadisticas entre dispositivos, anti-trampas mas alla del rate-limit, CDN para el audio, recorte en servidor, keep-alive, i18n, PWA/offline.

## Preguntas abiertas

Ninguna. Las de la iteracion `feature/pistas-y-filtro-juego` se cerraron el 2026-10-07: consolas escritas en `catalog.json` al anadir cada juego, sin tabla por defecto (DEC-51); pistas desactivadas por defecto (DEC-52).
