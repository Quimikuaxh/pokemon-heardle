# Plan de pruebas - Pokemon Heardle

Fuentes: REQUISITOS.md y ARQUITECTURA.md revisados tras el cambio del 2026-10-03 (diario común sin filtro, filtro solo en ilimitado, token sin `f` y con `q`, `GameView` con `guesses` y sin `filterKey`, `ALREADY_GUESSED`, apertura del diario sin `POST /games` innecesario).
Referencias: RQ §n = REQUISITOS, CA-n = criterio de aceptación, CL = casos límite (RQ §8), DEC-nn y AR §n = ARQUITECTURA.
Sin código ni tests previos, así que no hay "tests existentes afectados" en el sentido de la plantilla. Los cambios respecto a v1 se marcan en §0.

## 0. Cambios respecto a la versión anterior

- **Modificados** (mismo ID): BE-DAY-01..07, BE-DAY-17, BE-TOK-01/09/10, BE-CAT-01..05, BE-ENG-05..07, BE-ENG-16, BE-VAL-01, BE-LEAK-06, FE-GAM-10..13, FE-FIL-01..06, FE-STA-01..09, E2E-01..09, E2E-13..17, E2E-21. Además, por coherencia: BE-LEAK-05, BE-RL-10, FE-SRC-07, E2E-26 y E2E-44.
- **Retirados** (el ID no se reutiliza): BE-DAY-08 (`filterKey "all"`) y BE-DAY-09 (`filterKey` lista). Ya no existe `filterKey` en token, `GameView` ni API.
- **Nuevos**: BE-DAY-19..20, BE-TOK-16..18, BE-ENG-18..24, BE-LEAK-11..12, BE-VAL-07, BE-RL-11, SH-DAT-01..03, FE-GAM-15..19, FE-FIL-07, FE-SRC-12..15, FE-API-05, E2E-45..49.
- Eliminados de §8 (antes punto 10) los puntos ya resueltos por los requisitos: estadísticas con varios filtros el mismo día, guess repetido y "el cliente crea partida diaria al abrir".

## 1. Alcance

Dentro:
- Unitarios backend (vitest): `game/token`, `game/tickets`, `game/daily`, `game/engine`, `catalog/` (pool de ilimitado), `http/validate`, `http/rateLimit`, `config`, `storage/LruCache`.
- Integración backend con `createApp` + `listen(0)` + `fetch` y `FsClipStore`. Se usa para cabeceras, fuga, rate-limit y errores HTTP. Se marcan `unit (int)`.
- `shared/` (`catalog.ts`, `rules.ts`, `date.ts`).
- Scripts de catálogo, solo lo testeable sin red.
- Frontend (vitest + Testing Library + jsdom).
- E2E Playwright con backend en driver `fs` y fixtures de tonos senoidales.

Fuera:
- Descarga real con yt-dlp, subida real a Supabase S3 y despliegue en Render/Vercel.
- Shazam y grabación de audio (limitación aceptada, RQ §2).
- Calidad subjetiva del audio.
- Egress y horas de Render.
- Pruebas de carga.

Convenciones: nivel `unit` o `e2e`. Prioridad: A alta, M media, B baja.

## 2. Casos de prueba

### 2.1 Backend - token (`game/token.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-TOK-01 [MOD] | unit | Ida y vuelta: cifrar y descifrar payload con campos `v,n,m,d,k,r,q,iat,exp` (sin `f`) | `GAME_TOKEN_SECRET` válido | Payload idéntico; diario con `d`, ilimitado sin `d` | DEC-02, AR §4 | A |
| BE-TOK-02 | unit | Formato de red | - | base64url (sin `+ / =`), decodifica a iv(12)+ct+tag(16) | AR §4 | M |
| BE-TOK-03 | unit | Alterar 1 byte (iv, ct, tag; uno por vez) | Token válido | `TOKEN_INVALID` en los 3 casos | DEC-02 | A |
| BE-TOK-04 | unit | Token truncado, vacío, no base64, con caracteres extra | - | `TOKEN_INVALID`, sin excepción no controlada | AR §5 | A |
| BE-TOK-05 | unit | Caducado (`exp` pasado, reloj falso) | Reloj inyectable | `TOKEN_INVALID` | CL, AR §4 | A |
| BE-TOK-06 | unit | Frontera de `exp`: `exp-1s` válido; `exp` y `exp+1s` según regla elegida | Reloj falso | Consistente con la regla (documentar si `exp` es inclusivo) | AR §4 | M |
| BE-TOK-07 | unit | `v` distinta de 1 | Token cifrado con `v:2` | `TOKEN_INVALID` | AR §4 | M |
| BE-TOK-08 | unit | Longitud idéntica con ids de canción de 13 vs 22 caracteres y `clipKey` distintos | - | Misma longitud de token | DEC-03, CA-1 | A |
| BE-TOK-09 [MOD] | unit | Longitud idéntica variando 0..6 resultados en `r`, 0..6 `clipKey` en `q`, modo `d`/`u` | - | Misma longitud en todas las combinaciones | DEC-03, DEC-18 | A |
| BE-TOK-10 [MOD] | unit | Peor caso del payload (diario con `d`, `r` y `q` llenos con 6 elementos, nonce y fechas máximas) cabe en 384 bytes; si se excede, falla controlada al emitir | - | Cabe sin truncar; el exceso lanza error, nunca token de otra longitud | DEC-03 | A |
| BE-TOK-11 | unit | El token no contiene en claro `id`, `title`, `clipKey` (cadena y base64 decodificado) | Objetivo conocida | Sin coincidencias | CA-1, DEC-03 | A |
| BE-TOK-12 | unit | Aleatoriedad del iv: mismo payload dos veces | - | Tokens distintos | DEC-02 | M |
| BE-TOK-13 | unit | Separación HKDF: token usado como ticket y viceversa | - | Ambos rechazados | AR §4 | A |
| BE-TOK-14 | unit | Token cifrado con otro `GAME_TOKEN_SECRET` | 2 secretos | `TOKEN_INVALID` | DEC-02 | A |
| BE-TOK-15 | unit | `exp`: diario = fin del día Madrid + 6 h; ilimitado = 24 h, también en días de 23 h y 25 h | Reloj falso | `exp` correcto | AR §4 | M |
| BE-TOK-16 [NUEVO] | unit | El token ilimitado no almacena el filtro: payload descifrado no tiene campo `f` ni ids de juego del filtro; dos partidas con filtros distintos producen payloads con las mismas claves | Filtros {A} y {A,B} | Sin rastro del filtro | DEC-10, AR §4 | A |
| BE-TOK-17 [NUEVO] | unit | `q`: cada elemento es un `clipKey` de 16 hex; el padding mantiene longitud fija con distinto número de elementos | 0, 1, 6 elementos | Longitud fija, descifrado idéntico | DEC-18, DEC-03 | A |
| BE-TOK-18 [NUEVO] | unit | Token con `q` mal formado (no array, elementos no hex, duplicados, >6 elementos, `clipKey` inexistente) | Token cifrado a mano | `TOKEN_INVALID` (decisión a documentar para duplicados) | DEC-18 | M |

### 2.2 Backend - tickets de clip (`game/tickets.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-TKT-01 | unit | Emitir y canjear ticket | Partida en curso | `clipKey` e índice de intento correctos | DEC-04, CA-2 | A |
| BE-TKT-02 | unit | Un solo uso: canjear 2 veces | Ticket válido | 1.ª ok, 2.ª `CLIP_TICKET_USED` | DEC-04, RQ §2 | A |
| BE-TKT-03 | unit | Caducidad: canje con `now > exp` (TTL 60 s) | Reloj falso | `CLIP_TICKET_USED` (410) | DEC-04 | A |
| BE-TKT-04 | unit | Frontera TTL: `exp-1s` válido, `exp+1s` caducado | Reloj falso | Frontera correcta | DEC-04 | M |
| BE-TKT-05 | unit | `CLIP_TICKET_TTL_SEC` configurable (p. ej. 5) | Env | Se respeta | AR §10 | B |
| BE-TKT-06 | unit | Ticket manipulado, truncado o basura | - | `CLIP_TICKET_INVALID` (404) | AR §5 | A |
| BE-TKT-07 | unit | Longitud idéntica entre canciones e índices 0..5 | - | Misma longitud | DEC-03 | A |
| BE-TKT-08 | unit | El ticket no contiene en claro `clipKey`, id ni título | - | Sin coincidencia | CA-1 | A |
| BE-TKT-09 | unit | Solo se emite ticket con `a = r.length`; no hay forma de pedir un intento posterior | Partida con 2 resultados | `a=2` | CA-2 | A |
| BE-TKT-10 | unit | No se emite ticket en partida terminada | `won`/`lost` | `clipUrl` ausente | CA-7 | A |
| BE-TKT-11 | unit | Duración servida para el intento N = `CLIP_SECONDS[N]` | Clips sintéticos de 1/2/4/7/11/16 s | Los 6 intentos devuelven el clip `N+1` correcto | CA-2, RQ §3 | A |
| BE-TKT-12 | unit | Limpieza del registro de usados al expirar | Reloj falso, 1000 tickets | Memoria acotada | DEC-04 | B |
| BE-TKT-13 | unit | Dos canjes simultáneos del mismo ticket (`Promise.all`) | - | Exactamente uno ok | DEC-04 | M |
| BE-TKT-14 | unit | Reinicio simulado (registro vacío) con ticket no caducado | Simular reinicio | Reutilizable una vez dentro del TTL, mismo clip; solo documenta | AR §13 | B |

### 2.3 Backend - selección diaria e ilimitada (`game/daily.ts`, `catalog/`)

El diario es común y sin filtro: `idx = uint48(HMAC-SHA256(DAILY_SEED, "daily|v1|"+fecha)) mod songs.length`, con `songs` = canciones `enabled` de todo el catálogo ordenadas por `song.id`.

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-DAY-01 [MOD] | unit | Mismo día y misma semilla: misma canción (N llamadas), sin parámetro de filtro en la firma | Catálogo de 20 | Siempre el mismo idx | CA-4 | A |
| BE-DAY-02 [MOD] | unit (int) | `POST /games {mode:"daily", games:[...]}` (también `games:[]`) | - | 400 `VALIDATION_ERROR`; no se crea partida | AR §5 | A |
| BE-DAY-03 [MOD] | unit | La selección usa todo el catálogo `enabled`: con un catálogo con canciones de varios juegos, a lo largo de 60 fechas aparecen canciones de más de un juego; las `enabled:false` nunca salen | Catálogo con deshabilitadas | Cobertura multi-juego, ninguna deshabilitada | CA-4, DEC-09 | A |
| BE-DAY-04 | unit | Semillas distintas dan selecciones distintas | 2 semillas | Difieren en alguna fecha de 30 | DEC-09 | M |
| BE-DAY-05 [MOD] | unit | Cálculo exacto contra vector independiente: `HMAC(seed,"daily\|v1\|"+fecha)` sin filterKey en la cadena | Seed y fecha fijas | idx coincide con el vector | DEC-09 | A |
| BE-DAY-06 [MOD] | unit | `songs` ordenadas por `song.id`: el resultado no depende del orden de carga del catálogo | Catálogo barajado | Misma canción | DEC-09 | A |
| BE-DAY-07 [MOD] | unit | Catálogo con 1 sola canción `enabled` | - | Devuelve esa canción siempre | DEC-09 | A |
| BE-DAY-08 [RETIRADO] | - | (era `filterKey "all"`; ya no existe filtro en diario) | - | - | - | - |
| BE-DAY-09 [RETIRADO] | - | (era `filterKey` lista; ya no existe) | - | - | - | - |
| BE-DAY-10 | unit | Fecha Madrid verano: `2026-07-01T22:00:00Z` | - | `2026-07-02`; `21:59:59Z` -> `2026-07-01` | DEC-09, CL | A |
| BE-DAY-11 | unit | Fecha Madrid invierno: `2026-12-01T23:00:00Z` | - | `2026-12-02`; `22:59:59Z` -> `2026-12-01` | DEC-09, CL | A |
| BE-DAY-12 | unit | Cambio de hora primavera 2026-03-29 (23 h): `03-28T22:59:59Z`->03-28; `23:00:00Z`->03-29; `03-29T21:59:59Z`->03-29; `22:00:00Z`->03-30 | - | Fechas correctas | CL | A |
| BE-DAY-13 | unit | Cambio de hora otoño 2026-10-25 (25 h): `10-24T21:59:59Z`->10-24; `22:00:00Z`->10-25; `10-25T22:59:59Z`->10-25; `23:00:00Z`->10-26 | - | Fechas correctas | CL | A |
| BE-DAY-14 | unit | Fin de año `2026-12-31T23:00:00Z` | - | `2027-01-01` (formato `YYYY-MM-DD` con ceros) | CL | M |
| BE-DAY-15 | unit | Zona fija en código: `process.env.TZ` = UTC, America/New_York, Asia/Tokyo | TZ variable | Misma fecha | DEC-09 | M |
| BE-DAY-16 | unit (int) | La fecha sale del servidor: campo `date` extra en `POST /games` ignorado o rechazado | - | No se puede elegir día | DEC-09 | A |
| BE-DAY-17 [MOD] | unit | 365 días, catálogo de 10: todas las canciones aparecen al menos una vez; sin sesgo grave | - | Cobertura sobre todo el catálogo | RQ §3 | B |
| BE-DAY-18 | unit | Ilimitado: `randomInt(pool.length)` cubre todo el pool; pool de 1 devuelve siempre la misma | `randomInt` espiado | Índices en `[0,len)` | DEC-10 | M |
| BE-DAY-19 [NUEVO] | unit (int) | Dos `POST /games {mode:"daily"}` independientes el mismo día (reloj fijo) | Catálogo ≥3 | Mismo `date`; al terminar ambas (6 skips) la `solution` es la misma | CA-4 | A |
| BE-DAY-20 [NUEVO] | unit (int) | Daily el día D y el día D+1 (reloj falso): `date` distinto y el token de D sigue siendo válido tras medianoche hasta `exp` | Reloj falso | Partida de D continúa con su canción; nueva partida usa D+1 | CL, DEC-09 | M |

Pool de ilimitado (`catalog/`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-CAT-01 [MOD] | unit | Pool ilimitado = canciones `enabled:true` con algún juego del filtro | Deshabilitadas y multi-juego | Pool correcto | RQ §3, DEC-10 | A |
| BE-CAT-02 [MOD] | unit | Canción multi-juego aparece una sola vez en el pool (no sesga el azar) | Canción en 2 juegos, filtro con ambos | Sin duplicados | DEC-10 | A |
| BE-CAT-03 [MOD] | unit (int) | Ilimitado con `games:[]` | - | 400 `EMPTY_FILTER` | CA-5 | A |
| BE-CAT-04 [MOD] | unit (int) | Ilimitado con juego cuyas canciones están todas deshabilitadas | - | 400 `EMPTY_FILTER` | CA-5 | A |
| BE-CAT-05 [MOD] | unit (int) | Ilimitado con id de juego inexistente (y mezcla válido+inválido) | - | 400 `UNKNOWN_GAME` | AR §5 | A |
| BE-CAT-06 | unit | `GET /catalog` público: solo `id,title,games` y lista de juegos; sin `clipKey,startSec,source,enabled,reviewed`; sin canciones deshabilitadas | Catálogo completo | Cumple (comprobación recursiva) | DEC-11, CA-1 | A |
| BE-CAT-07 | unit (int) | Canción retirada del catálogo con partida en curso | Token con `clipKey` inexistente | `TOKEN_INVALID` | AR §4, CL | A |
| BE-CAT-08 | unit (int) | Catálogo no cargado: `/health` | Store que falla | 503 `CATALOG_UNAVAILABLE`; escucha igualmente; reintento con backoff (reloj falso) hasta recuperar | AR §9 | A |
| BE-CAT-09 | unit (int) | `/games` con catálogo no cargado | Idem | 503 `CATALOG_UNAVAILABLE` | AR §5 | M |

### 2.4 Backend - motor de reglas y respuesta (`game/engine.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-ENG-01 | unit | Acierto | Partida en curso | `H`; `won`; `results` termina en `hit` | RQ §3, CA-7 | A |
| BE-ENG-02 | unit | Fallo con juego distinto | Objetivo en A, elegida solo en B | `M` -> `miss` | CA-3 | A |
| BE-ENG-03 | unit | Fallo con juego correcto | Comparten un juego | `G` -> `game` | CA-3 | A |
| BE-ENG-04 | unit | Intersección parcial (objetivo {A,B}, elegida {B,C}) | - | `G` | RQ §3 | A |
| BE-ENG-05 [MOD] | unit | Objetivo multi-juego y elegida con juegos disjuntos | - | `M` | RQ §3, DEC-17 | M |
| BE-ENG-06 [MOD] | unit | Ilimitado con filtro {A}: se acepta una canción de B (válida en catálogo, fuera del pool). El filtro no se conserva en el token; en diario tampoco hay filtro | Filtro usado solo al crear | Se evalúa `M` o `G` según intersección | DEC-17, DEC-10 | A |
| BE-ENG-07 [MOD] | unit | Ilimitado con filtro de un solo juego A: elegir canción de A | - | Siempre `G` o `H`, nunca `M` (esperado, documentado) | DEC-17 | M |
| BE-ENG-08 | unit | Skip | En curso | `S`; `attempt`+1; `skip` | RQ §3 | A |
| BE-ENG-09 | unit | 6.º intento fallido (guess) -> `lost` | 5 resultados no `H` | `lost`; `attempt=6`; sin `clipUrl` | CA-7 | A |
| BE-ENG-10 | unit | 6.º intento con skip -> `lost` | 5 resultados | `lost` | CA-7 | A |
| BE-ENG-11 | unit | 6.º intento con acierto | 5 fallos | `won` en el intento 6 | RQ §3 | A |
| BE-ENG-12 | unit | Acierto en intento 1 | - | `won`, `attempt=1` | RQ §3 | M |
| BE-ENG-13 | unit | Guess o skip tras `won` y tras `lost` | Terminada | `GAME_OVER` (409), estado intacto | CA-7 | A |
| BE-ENG-14 | unit | Estado derivado `attempt=r.length`; `playing/won/lost` | Secuencias | Tabla AR §4 | AR §4 | M |
| BE-ENG-15 | unit | `songId` inexistente o deshabilitada | - | `UNKNOWN_SONG` (400) | AR §5 | A |
| BE-ENG-16 [MOD] | unit | Repetir la misma canción fallida (antes: "se acepta"): ahora se rechaza | Tras un `M` en canción X | 409 `ALREADY_GUESSED`; `attempt` y `results` sin cambio | DEC-18, RQ §3 | A |
| BE-ENG-17 | unit | Cada acción válida devuelve un token distinto; el anterior sigue descifrable y refleja el estado antiguo (limitación documentada) | - | Token nuevo != anterior | AR §4, §8 | M |
| BE-ENG-18 [NUEVO] | unit (int) | `ALREADY_GUESSED` no consume intento ni emite token: la respuesta es un error sin campo `token`; `/games/state` con el mismo token devuelve el mismo `attempt` | Un fallo previo | `attempt` igual antes y después; sin token nuevo | DEC-18, CL | A |
| BE-ENG-19 [NUEVO] | unit | Repetir canción que dio `G` (juego acertado) | Tras `G` en X | `ALREADY_GUESSED`; no cambia el estado | DEC-18 | A |
| BE-ENG-20 [NUEVO] | unit | Skip no añade a `q`; tras skip se puede elegir cualquier canción no intentada | Skip + guess | Aceptado | DEC-18 | M |
| BE-ENG-21 [NUEVO] | unit | Orden de validación: `TOKEN_INVALID` > `GAME_OVER` > `UNKNOWN_SONG` > `ALREADY_GUESSED`. Casos: repetir tras partida terminada -> `GAME_OVER`; `songId` inexistente -> `UNKNOWN_SONG` aunque haya repetidos | - | Códigos según prioridad (documentar la prioridad adoptada) | AR §5 | M |
| BE-ENG-22 [NUEVO] | unit | Tras 5 intentos distintos fallidos y un 6.º repetido: se rechaza sin perder; el 6.º distinto cierra la partida | 5 resultados | `ALREADY_GUESSED` mantiene `playing` con `attempt=5`; luego una distinta -> `lost`/`won` | DEC-18, CA-7 | A |
| BE-ENG-23 [NUEVO] | unit | `guesses` en `GameView`: lista de `songId` en orden de jugada, solo canciones intentadas, sin skips | 3 guesses y 1 skip | `guesses.length==3`, orden correcto; se recupera igual tras `/games/state` | DEC-18, AR §5 | A |
| BE-ENG-24 [NUEVO] | unit | Los `guesses` de una partida ganada incluyen el acierto; de una perdida incluyen solo intentos propios (no la objetivo, salvo que la hubiese elegido) | - | Correcto | DEC-18, CA-1 | A |

### 2.5 Backend - revelado de solución y fuga (integración)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-LEAK-01 | unit (int) | `solution` ausente mientras `playing` | En curso | La clave no existe en ninguna respuesta | CA-1, CA-7 | A |
| BE-LEAK-02 | unit (int) | `solution` al ganar (id, title, games con nombre) | Acierto | Correcta | CA-7 | A |
| BE-LEAK-03 | unit (int) | `solution` al perder | 6 fallos | Correcta | CA-7 | A |
| BE-LEAK-04 | unit (int) | `clipUrl` ausente al terminar | Terminada | Sin `clipUrl` | CA-7 | A |
| BE-LEAK-05 [MOD] | unit (int) | Fuga: partida completa (5 fallos/skips distintos); serializar cuerpo y cabeceras de TODAS las respuestas previas al final, incluidos los errores `ALREADY_GUESSED`, y buscar id, título, `clipKey`, fichero, `startSec`, `youtubeId`, `videoTitle` de la objetivo (y subcadenas de ≥4 caracteres y base64) | Objetivo conocida | Cero coincidencias | CA-1, RQ §2 | A |
| BE-LEAK-06 [MOD] | unit (int) | Misma prueba con partidas diarias (dos fechas distintas) e ilimitadas con dos objetivos; además la `GameView` tiene solo las claves permitidas (whitelist: `token,mode,date?,status,attempt,maxAttempts,clipSeconds,results,guesses,clipUrl?,solution?`), sin `filterKey` | - | Cero coincidencias y claves exactas | CA-1, AR §5 | A |
| BE-LEAK-07 | unit (int) | Errores 4xx/5xx de `/games/*` no filtran datos de la objetivo (mensaje ni stack) | - | Sin datos | CA-1, AR §8 | A |
| BE-LEAK-08 | unit (int) | `Content-Length` de clips y tamaño de JSON de `GameView` iguales entre dos objetivos distintas para el mismo intento | Clips CBR sintéticos | Iguales | DEC-03, DEC-06 | A |
| BE-LEAK-09 | unit (int) | `clipUrl` opaca (`/api/clips/<ticket>`), sin `clipKey` ni id | - | Cumple | RQ §2 | A |
| BE-LEAK-10 | unit (int) | Revelar `solution` no incluye `clipKey`, `startSec`, `source` | Terminada | Solo `id,title,games` | DEC-11 | M |
| BE-LEAK-11 [NUEVO] | unit (int) | `guesses` y la respuesta `ALREADY_GUESSED` no revelan la objetivo: el servidor responde igual (código y cuerpo) con independencia de la objetivo (mismo input contra dos objetivos distintas) | Misma secuencia, objetivos distintas | Cuerpos de error idénticos | CA-1, DEC-18 | A |
| BE-LEAK-12 [NUEVO] | unit (int) | Campo `q` no accesible: el token se mantiene cifrado y el `GameView` no incluye `clipKey` de ninguna canción intentada (solo `songId`) | Partida con intentos | Sin `clipKey` en respuestas | CA-1, DEC-18 | A |

### 2.6 Backend - cabeceras y clips (integración)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-HDR-01 | unit (int) | `GET /clips/:ticket` cabeceras | Ticket válido | `Content-Type: audio/mpeg`, `Content-Length` real, `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff` | AR §5 | A |
| BE-HDR-02 | unit (int) | Sin `ETag`, `Last-Modified`, `Content-Disposition`, `Accept-Ranges` en `/clips` | - | Ninguna | AR §5, CA-1 | A |
| BE-HDR-03 | unit (int) | Sin `ETag` en ninguna ruta (`/health`, `/catalog`, `/games*`, 404, errores) | `etag=false` | Ninguna lleva `ETag` | AR §5 | A |
| BE-HDR-04 | unit (int) | Sin `X-Powered-By` | - | Ausente | AR §5 | M |
| BE-HDR-05 | unit (int) | `Cache-Control: no-store` en JSON de `/games/*` (incluidos errores 409) | - | Presente | AR §5 | A |
| BE-HDR-06 | unit (int) | `Range` e `If-None-Match` en `/clips` | Ticket válido | 200 completo (sin 206/304) | DEC-05 | M |
| BE-HDR-07 | unit (int) | Segunda petición al mismo ticket | - | 410 `CLIP_TICKET_USED` | CA-2, DEC-04 | A |
| BE-HDR-08 | unit (int) | Ticket inválido | - | 404 `CLIP_TICKET_INVALID` | AR §5 | A |
| BE-HDR-09 | unit (int) | CORS: origen permitido recibe ACAO; ajeno no; sin `Access-Control-Expose-Headers` | `ALLOWED_ORIGIN` | Según descripción | AR §5, §8 | M |
| BE-HDR-10 | unit (int) | Clip fixture sin ID3 ni Xing/Info y servido sin transformar | Fixture | Primeros bytes != `ID3`; bytes iguales al fichero | DEC-06 | M |
| BE-HDR-11 | unit (int) | Tamaño del clip del intento N ≈ `CLIP_SECONDS[N]*16000` B (±1 trama) | CBR 128 kbps | Coincide para los 6 | CA-2 | A |
| BE-HDR-12 | unit (int) | Fallo del almacén | Store con error | 502 `STORAGE_ERROR`, sin detalles internos | AR §5 | M |
| BE-HDR-13 | unit (int) | Cuerpo > 4 KB | - | 413 o `VALIDATION_ERROR` sin caída | AR §8 | M |
| BE-HDR-14 | unit (int) | Ruta inexistente / método no permitido | - | 404 JSON con formato de error, sin stack | AR §5 | B |

### 2.7 Backend - validación y config

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-VAL-01 [MOD] | unit | `POST /games`: `mode` desconocido, ausente, no string; `mode:"daily"` con `games` (cualquier valor); `mode:"unlimited"` sin `games` o con `games` no array | - | `VALIDATION_ERROR` (el caso `unlimited` con `games:[]` es `EMPTY_FILTER`, ver BE-CAT-03) | AR §5 | A |
| BE-VAL-02 | unit | `games` con elementos no string, demasiados elementos o strings enormes (ilimitado) | - | `VALIDATION_ERROR` | AR §5, DEC-15 | A |
| BE-VAL-03 | unit | `token` ausente / no string / vacío en `state`, `guess`, `skip` | - | `VALIDATION_ERROR` | AR §5 | A |
| BE-VAL-04 | unit | `songId` ausente / número / objeto / `__proto__` / `constructor` | - | `VALIDATION_ERROR` o `UNKNOWN_SONG`, nunca excepción | AR §5, §8 | A |
| BE-VAL-05 | unit | Cuerpo no JSON o `Content-Type` incorrecto | - | 400 con `{error:{code,message}}`, `message` en español | AR §5 | M |
| BE-VAL-06 | unit | Token en query string no se acepta | - | Ignorado | AR §5 | B |
| BE-VAL-07 [NUEVO] | unit | Cuerpo de `guess` con `songId` correcto y campos extra (`gameId`, `filter`) | - | Campos extra ignorados o rechazados (documentar); no cambian la evaluación | DEC-17 | B |
| BE-CFG-01 | unit | Falta `GAME_TOKEN_SECRET` o `DAILY_SEED` | Env sin ellas | `loadConfig` lanza | AR §8 | A |
| BE-CFG-02 | unit | `GAME_TOKEN_SECRET` < 32 bytes | - | Lanza | AR §8 | A |
| BE-CFG-03 | unit | `STORAGE_DRIVER=s3` sin claves/endpoint/bucket | - | Lanza sin imprimir secretos | AR §10 | M |
| BE-CFG-04 | unit | Defaults: TTL 60, caché 32, `TRUST_PROXY=1` | - | Valores por defecto | AR §10 | B |
| BE-CFG-05 | unit | Sin dependencias específicas de Render (`RENDER_*`) | - | Ninguna | RQ §9 | B |

### 2.8 Backend - rate-limit

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-RL-01 | unit (int) | `POST /games` > 20/min por IP | Límites reales, reloj falso | 21.ª -> 429 `RATE_LIMITED` con `Retry-After` > 0 | RQ §5, AR §8 | A |
| BE-RL-02 | unit (int) | `guess`+`skip` > 40/min por IP | - | 41.ª -> 429 | AR §8 | A |
| BE-RL-03 | unit (int) | `/clips` > 30/min por IP | - | 31.ª -> 429 | AR §8 | M |
| BE-RL-04 | unit (int) | Global `/api` 120/min | - | 121.ª -> 429 | AR §8 | M |
| BE-RL-05 | unit (int) | Por partida (nonce): 13.ª acción en 1 min sobre la cadena de tokens desde IPs distintas | `X-Forwarded-For`, `trust proxy` | 429 por nonce | DEC-13 | A |
| BE-RL-06 | unit (int) | Límite por nonce no bloquea otra partida de la misma IP | 2 partidas | La segunda funciona | DEC-13 | M |
| BE-RL-07 | unit (int) | Recuperación tras la ventana | Reloj +60 s | 200 | AR §8 | M |
| BE-RL-08 | unit (int) | `TRUST_PROXY=1` toma IP de `X-Forwarded-For`; con 0 se ignora | - | Según config | AR §8, §13 | A |
| BE-RL-09 | unit (int) | `RATE_LIMIT_*` por env | - | Se aplican | AR §10 | B |
| BE-RL-10 [MOD] | unit (int) | Flujo normal completo (6 intentos con `state` y carga de clip, incluyendo una recarga y un `ALREADY_GUESSED` accidental) no dispara el límite por nonce de 12/min | - | Sin 429. **Posible defecto de diseño**: por intento hay guess/skip + state, y los rechazos suman; el test lo confirma o lo refuta | RQ §5 | A |
| BE-RL-11 [NUEVO] | unit (int) | Los rechazos `ALREADY_GUESSED` cuentan para el límite por nonce y por IP (no se pueden usar para sondear sin coste) | Muchas repeticiones | 429 a partir del límite | RQ §5, DEC-18 | M |

### 2.9 Backend - almacén y caché

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-STO-01 | unit | `LruCache` respeta límite en bytes y expulsa el menos reciente | Límite pequeño | Correcto | AR §9 | M |
| BE-STO-02 | unit | Clip mayor que el límite no se cachea ni rompe | - | Se sirve sin cachear | AR §9 | B |
| BE-STO-03 | unit | `FsClipStore` lee `catalog/catalog.json` y `clips/<clipKey>/<n>.mp3`; sin path traversal | `clipKey` `../` | Rechaza claves fuera de `[0-9a-f]{16}` | DEC-07, AR §8 | A |
| BE-STO-04 | unit | `S3ClipStore` con cliente simulado: `GetObject` con bucket/clave esperados; errores -> `STORAGE_ERROR` | Mock | OK | DEC-08, DEC-19 | M |
| BE-STO-05 | unit | Hit de caché no vuelve a llamar al store | Spy | 1 lectura | AR §9 | M |

### 2.10 shared (`catalog.ts`, `rules.ts`, `date.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-CAT-01 | unit | Catálogo válido mínimo y `catalog.example.json` | - | Sin errores | AR §6 | A |
| SH-CAT-02 | unit | Ids de canción duplicados | - | Error con el id | AR §6 | A |
| SH-CAT-03 | unit | Id con mayúsculas, espacios, `_`, vacío o acentos | - | Error (`[a-z0-9-]+`) | AR §6 | A |
| SH-CAT-04 | unit | Id de juego duplicado / formato inválido | - | Error | AR §6 | M |
| SH-CAT-05 | unit | `clipKey` duplicado | - | Error | AR §6 | A |
| SH-CAT-06 | unit | `clipKey` mal formado: 15 y 17 hex, mayúsculas, no hex, vacío, no string | - | Error en cada uno | AR §6 | A |
| SH-CAT-07 | unit | Canción referencia juego inexistente | - | Error | AR §6 | A |
| SH-CAT-08 | unit | `games` vacío en una canción | - | Error | AR §6 | A |
| SH-CAT-09 | unit | `startSec` negativo (-1, -0.001); 0 y decimales positivos válidos | - | Error / válido | AR §6 | A |
| SH-CAT-10 | unit | `startSec` no numérico / NaN / Infinity | - | Error | AR §6 | M |
| SH-CAT-11 | unit | Falta campo obligatorio, `version` != 1, raíz no objeto, `null` | - | Error descriptivo, sin excepción | AR §6 | A |
| SH-CAT-12 | unit | Ids repetidos en `games` de una canción | - | Error o normalización (definir) | AR §6 | M |
| SH-CAT-13 | unit | Acumula todos los errores, no solo el primero | 3 fallos | 3 errores | AR §6 | B |
| SH-CAT-14 | unit | Una sola canción habilitada / todas deshabilitadas | - | Válido (el vacío lo gestiona el backend) | CA-5 | M |
| SH-RUL-01 | unit | `CLIP_SECONDS=[1,2,4,7,11,16]`, `MAX_ATTEMPTS=6` | - | Exactos | RQ §3 | A |
| SH-DAT-01 [NUEVO] | unit | `shared/date.ts`: fecha de hoy Madrid para los instantes de BE-DAY-10..14 (se ejecuta una vez y es la misma función que usan backend y frontend) | - | Mismos resultados que BE-DAY-10..14 | DEC-09, AR §2 | A |
| SH-DAT-02 [NUEVO] | unit | `shared/date.ts` independiente de la zona del proceso y del navegador (TZ variable, `Intl` de jsdom) | TZ variable | Misma fecha | CL | M |
| SH-DAT-03 [NUEVO] | unit | Aritmética de fechas `YYYY-MM-DD`: "día siguiente" y "diferencia en días" correctas en cambios de hora, fin de mes y fin de año (la usa la racha) | Fechas de borde | Sin errores de 23/25 h | CL | A |

### 2.11 Scripts de catálogo (sin red)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-PT-01 | unit | `parseTitle` formato típico "Pokemon Ruby/Sapphire/Emerald - Littleroot Town" | - | Título y juego(s) | RQ §4 | A |
| SC-PT-02 | unit | `parseTitle` varios juegos, guiones largos, "OST", "(Extended)", unicode | - | Parseo razonable, sin excepción | RQ §4 | M |
| SC-PT-03 | unit | `parseTitle` no parseable | Sin separador | Título completo, juego desconocido, marcado para revisión; nunca lanza | RQ §4 | A |
| SC-PT-04 | unit | `parseTitle` cadena vacía | - | Resultado seguro | RQ §4 | B |
| SC-DR-01 | unit | `draft` añade vídeos nuevos (por `youtubeId`) con `startSec:0`, `reviewed:false`, `clipKey` válido y único | Catálogo vacío | Válido según validador si el juego se reconoce en el título; si no, `games: []` y el validador lo rechaza (revisión manual, RQ §9) | AR §6 | A |
| SC-DR-02 | unit | `draft` idempotente | Mismas entradas 2 veces | Sin duplicados ni cambios | AR §6 | A |
| SC-DR-03 | unit | `draft` nunca pisa entradas editadas (título, juegos, `startSec`, `enabled`, `reviewed:true`, `clipKey`) | Entrada modificada | Intacta | RQ §4, AR §6 | A |
| SC-DR-04 | unit | `draft` evita colisión de `clipKey` | Generador forzado | Reintenta hasta único | AR §6 | M |
| SC-DR-05 | unit | Títulos repetidos dan ids distintos y válidos | - | Sufijo | AR §6 | A |
| SC-DR-06 | unit | Juego nuevo se añade a `games` sin duplicar | - | Catálogo válido | AR §6 | M |
| SC-FF-01 | unit | Args master: `-ss startSec -t 16` y `loudnorm` | - | Esperados | AR §6 | A |
| SC-FF-02 | unit | Args clips para N en `CLIP_SECONDS`: `-t N`, fundido 50 ms, `-b:a 128k`, estéreo, 44100 Hz | - | Los 6 correctos | CA-2, DEC-06 | A |
| SC-FF-03 | unit | Args sin metadatos: `-map_metadata -1 -id3v2_version 0 -write_xing 0 -fflags +bitexact` | - | Presentes | DEC-06, RQ §2 | A |
| SC-FF-04 | unit | Salida `data/out/clips/<clipKey>/<n>.mp3` (n=1..6) sin id ni título | - | Correcta | DEC-07 | A |
| SC-FF-05 | unit | Args seguros ante rutas con espacios/comillas/`;` (array, sin shell) | Título malicioso | Sin inyección | AR §8 | M |
| SC-FF-06 | unit | Fundido en clip de 1 s sin valores negativos | - | `st >= 0` | DEC-06 | M |
| SC-BU-01 | unit | Recompila solo si cambian `startSec` o fuente | Manifest simulado | Correcto | AR §6 | M |
| SC-BU-02 | unit | `build` ignora `enabled:false` | - | No genera sus clips | AR §6 | M |
| SC-VA-01 | unit | `validate` falla con clips faltantes (5 de 6) o catálogo inválido | Directorio sintético | Código != 0 y mensaje | AR §6 | A |
| SC-VA-02 | unit | Tamaños distintos entre canciones para el mismo intento | Clips desiguales | Falla | DEC-06 | A |
| SC-VA-03 | unit | Tamaños idénticos | - | Pasa | DEC-06 | A |
| SC-VA-04 | unit | ffprobe simulado: tolerancia −30/+60 ms (sin Xing el encoder añade retardo/relleno); −29 y +59 ms pasan, −31 y +61 ms fallan | Mock | Frontera correcta | CA-2 | A |
| SC-VA-05 | unit | ffprobe simulado con etiquetas (title/artist) | Mock | Falla | RQ §2 | A |
| SC-VA-06 | unit (cond.) | `validate` real contra fixtures si hay ffmpeg. Criterio de duración: de −30 ms a +60 ms sobre lo esperado (sin Xing, ffprobe mide ~40-50 ms de más; Xing no se reactiva por ser huella) | ffmpeg presente | Pasa; si no, skip explícito | AR §11 | M |
| SC-UP-01 | unit | `upload` ejecuta `validate` primero; si falla no sube nada | Cliente S3 simulado | 0 subidas | AR §6 | A |
| SC-UP-02 | unit | Orden: clips y por último `catalog.json` | Mock registra orden | Catálogo el último | AR §6 | A |
| SC-UP-03 | unit | Nunca sube `data/work/` | Con originales | 0 claves de work | DEC-16 | A |
| SC-UP-04 | unit | Solo sube nuevos/cambiados | Remoto parcial | Sube la diferencia | AR §6 | M |
| SC-UP-05 | unit | `--prune` borra huérfanos; sin flag no | - | Según flag | AR §6 | M |
| SC-CLI-01 | unit | Subcomando desconocido / falta URL en `fetch` | - | Uso y código != 0 | AR §6 | B |
| SC-GI-01 | unit | `.gitignore` cubre `node_modules`, `dist`, `.env*` (salvo example), `scripts/catalog/data/`, `e2e/test-results`, `*.mp3` fuera de `e2e/fixtures` | - | `git check-ignore` confirma | RQ §4, AR §12 | M |

### 2.12 Frontend - lógica de partida, apertura del diario, filtro

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-GAM-01 | unit | Reductor: nueva partida -> miss -> skip -> win | `GameView` simuladas | Estado refleja la última vista | RQ §3 | A |
| FE-GAM-02 | unit | Skip y buscador deshabilitados en `won`/`lost` | Terminada | No se envían acciones | CA-7 | A |
| FE-GAM-03 | unit | Solución solo con `solution` presente | playing / won | Oculta / visible | CA-1, CA-7 | A |
| FE-GAM-04 | unit | Duración mostrada = `clipSeconds[attempt]` | - | Correcta 0..5 | CA-2 | M |
| FE-GAM-05 | unit | Se guarda siempre el último token recibido | Dos acciones | Storage con el último | AR §4 | A |
| FE-GAM-06 | unit | Etiquetas: `game` -> "juego acertado"; `miss` -> "juego incorrecto" | - | Textos en español | CA-3 | A |
| FE-GAM-07 | unit | `TOKEN_INVALID` al recuperar con `/games/state`: descarta token y ofrece partida nueva | API mock | Estado limpio y botón nueva partida | CL | A |
| FE-GAM-08 | unit | `GAME_OVER` desde servidor: refresca con state y muestra resultado | API mock | UI coherente | CA-7 | M |
| FE-GAM-09 | unit | 429: mensaje y respeto de `Retry-After`; sin bucle | Mock | Mensaje y botón reactivado tras espera | RQ §5 | M |
| FE-GAM-10 [MOD] | unit | Ilimitado: cambiar filtro con partida en curso no altera la partida activa; la siguiente `POST /games` envía el filtro nuevo | - | La vista en curso no cambia; petición siguiente con filtro nuevo | CL | A |
| FE-GAM-11 [MOD] | unit | Apertura del diario con `daily:<hoy>` terminada: muestra resultado, sin botón jugar y **cero llamadas** a `/games`, `/games/state` y `/games/guess` | localStorage sembrado | Resultado visible; 0 llamadas de partida | CL, AR §7 | A |
| FE-GAM-12 [MOD] | unit | Apertura del diario sin `daily:<hoy>`: `POST /games` con cuerpo exactamente `{mode:"daily"}` (sin `games`). Si la `date` devuelta difiere de la calculada con `Intl`, manda la del servidor: si esa fecha ya está terminada en storage, se muestra el resultado y se descarta el token nuevo; si no, se guarda como `daily:<date servidor>` | Reloj cliente desviado | Comportamiento descrito | CL, AR §7 | A |
| FE-GAM-13 [MOD] | unit | Apertura del diario con `daily:<hoy>` en curso: `POST /games/state` con su token, sin `POST /games`; con `TOKEN_INVALID` se crea partida nueva | Storage sembrado | Una llamada a `state`; 0 a `POST /games` salvo `TOKEN_INVALID` | AR §7, CL | A |
| FE-GAM-14 | unit | Ilimitado en curso se recupera tras recarga; al terminar se limpia y permite nueva | - | OK | RQ §3 | M |
| FE-GAM-15 [NUEVO] | unit | Día nuevo: `daily:<ayer>` terminado no impide jugar `daily:<hoy>`; la clave de ayer no se modifica | Fechas distintas | Partida nueva jugable | CL | A |
| FE-GAM-16 [NUEVO] | unit | El diario no muestra selector de filtro ni lee `heardle:filter` | Filtro guardado | UI diaria sin filtro; la petición no incluye `games` | RQ §3 | A |
| FE-GAM-17 [NUEVO] | unit | Fecha de hoy calculada en cliente con `shared/date.ts` en Madrid, independiente de la zona del navegador (TZ simulada) | TZ = Asia/Tokyo | Fecha Madrid | CL | A |
| FE-GAM-18 [NUEVO] | unit | `ALREADY_GUESSED` desde servidor: aviso en español, el contador de intentos y `results` locales no cambian, el token guardado no cambia | API mock 409 | Aviso, estado intacto | DEC-18, CL | A |
| FE-GAM-19 [NUEVO] | unit | Tras recargar (`/games/state`) los `guesses` vuelven en la vista y se aplican al buscador | - | Marcados | DEC-18 | A |
| FE-FIL-01 [MOD] | unit | En ilimitado, filtro vacío deshabilita "Empezar" y muestra aviso | Filtro `[]` | Botón `disabled`; 0 llamadas a la API | CA-5 | A |
| FE-FIL-02 [MOD] | unit | Ilimitado con un juego: `POST /games` con `{mode:"unlimited",games:[id]}` | - | Cuerpo correcto | RQ §3 | A |
| FE-FIL-03 | unit | Filtro persiste en `heardle:filter` y se restaura | - | Restaurado | RQ §3 | A |
| FE-FIL-04 [MOD] | unit | Filtro guardado con ids inexistentes: se descartan; si queda vacío se avisa | Storage sembrado | Sin romper | RQ §3 | M |
| FE-FIL-05 | unit | `localStorage` corrupto en cualquier clave | Basura | Valores por defecto sin excepción | AR §7 | A |
| FE-FIL-06 [MOD] | unit | `EMPTY_FILTER` / `UNKNOWN_GAME` del servidor en ilimitado -> mensaje claro | API mock | Mensaje en español | CA-5 | M |
| FE-FIL-07 [NUEVO] | unit | Filtro vacío no bloquea el diario | Filtro `[]` | Diario jugable | CA-4, CA-5 | A |

### 2.13 Frontend - buscador, compartir, estadísticas, red, audio

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-SRC-01 | unit | Búsqueda por título (subcadena) | Catálogo cliente | Coincidentes | DEC-17 | A |
| FE-SRC-02 | unit | Búsqueda por nombre de juego | "ruby" | Todas las canciones del juego | DEC-17 | A |
| FE-SRC-03 | unit | Sin distinguir mayúsculas ni acentos | "pokemon" vs "Pokémon" | Coincide | DEC-17 | A |
| FE-SRC-04 | unit | Busca sobre TODO el catálogo, sin importar el filtro del ilimitado ni si el juego ya se acertó; en diario tampoco hay filtro | Filtro={A}; canción de B | Aparece | DEC-17 | A |
| FE-SRC-05 | unit | Cada opción muestra título y todos sus juegos | Multi-juego | Todos visibles | DEC-17 | M |
| FE-SRC-06 | unit | Canción multi-juego aparece una vez | - | Sin duplicados | DEC-17 | A |
| FE-SRC-07 [MOD] | unit | Seleccionar opción envía solo `songId` (`{token,songId}`) | Spy API | Cuerpo exacto | DEC-17 | A |
| FE-SRC-08 | unit | Sin resultados / texto vacío / solo espacios | - | "Sin resultados" o lista según diseño, sin errores | DEC-17 | M |
| FE-SRC-09 | unit | Caracteres especiales regex en la búsqueda | `(`, `*`, `\` | Sin excepción | DEC-17 | M |
| FE-SRC-10 | unit | Catálogo grande (1500 canciones) | Dataset generado | < 50 ms | AR §16 | B |
| FE-SRC-11 | unit | No se puede enviar texto libre que no sea una canción | - | Solo opciones del catálogo | DEC-17 | M |
| FE-SRC-12 [NUEVO] | unit | Canciones de `guesses` aparecen marcadas (estilo y `aria-disabled`/etiqueta "ya intentada") y no seleccionables por clic ni teclado (Enter) | `guesses=[x,y]` | No se emite petición al pulsar; las demás sí | DEC-18, CL | A |
| FE-SRC-13 [NUEVO] | unit | Una canción intentada sigue apareciendo al buscar (marcada), no desaparece de la lista | Buscar su título | Visible y deshabilitada | DEC-18, DEC-17 | A |
| FE-SRC-14 [NUEVO] | unit | Marcado por `songId`: se deshabilita la canción intentada pero no otra del mismo juego | Dos canciones del mismo juego | Solo la intentada | DEC-18 | M |
| FE-SRC-15 [NUEVO] | unit | Tras skip no se marca ninguna canción; tras guess nuevo se añade a las marcadas | - | Correcto | DEC-18 | M |
| FE-SHR-01 | unit | Mapeo `hit` 🟩, `game` 🟨, `miss` 🟥, `skip` ⬛, no usados ⬜ | Mixtos | Fila de 6 emojis | CA-6, AR §7 | A |
| FE-SHR-02 | unit | Victoria en intento 1 (🟩⬜⬜⬜⬜⬜), en el 6; derrota | - | Correcto | CA-6 | A |
| FE-SHR-03 | unit | Incluye modo y fecha solo en diario | - | Cabecera correcta | AR §7 | A |
| FE-SHR-04 | unit | Nunca incluye título, id ni juego de la solución (aunque esté en el estado) | `solution` en estado | Sin subcadenas | CA-6 | A |
| FE-SHR-05 | unit | El generador recibe solo `results` y modo/fecha (firma pura) | - | Sin `solution` en la firma | CA-6 | M |
| FE-SHR-06 | unit | Copiar: éxito, y fallback si `navigator.clipboard` no existe o rechaza | Mock | Copiado / fallback | CA-6 | M |
| FE-STA-01 [MOD] | unit | Primera victoria diaria: racha 1, `distribución[intento]++` en `stats:daily` | Storage vacío | Correcto | RQ §3 | A |
| FE-STA-02 [MOD] | unit | Días consecutivos incrementan la única racha; máxima se actualiza | Fechas Madrid del servidor | Racha n | RQ §3 | A |
| FE-STA-03 [MOD] | unit | Salto de un día rompe la racha (máxima conservada) | - | Racha reiniciada | RQ §3 | A |
| FE-STA-04 [MOD] | unit | Derrota (X) rompe racha y suma en X | - | Correcto | RQ §3 | A |
| FE-STA-05 [MOD] | unit | Consecutividad según fecha del servidor / `shared/date.ts`, no del reloj local (TZ simulada) | TZ simulada | Mismo resultado | CL | A |
| FE-STA-06 [MOD] | unit | Racha continua a través de cambio de hora (03-28 -> 03-29 -> 03-30; 10-24 -> 10-25 -> 10-26), fin de mes y fin de año | - | Continua | CL | A |
| FE-STA-07 [MOD] | unit | La misma fecha registrada dos veces (recarga) no duplica | - | Idempotente | CL | A |
| FE-STA-08 [MOD] | unit | `stats:daily` y `stats:unlimited` separadas; ilimitado sin racha | - | Claves y contenido correctos | AR §7 | M |
| FE-STA-09 [MOD] | unit | El filtro del ilimitado y los cambios de filtro no afectan a `stats:daily`; solo hay una distribución diaria | Cambiar filtro entre partidas | Sin cambios en diario | RQ §3, AR §7 | M |
| FE-STA-10 | unit | `stats:*` corruptos o de versión antigua | - | Reinicio seguro | AR §7 | M |
| FE-STA-11 | unit | `localStorage` no disponible o cuota excedida | Mock lanza | La app funciona sin persistir y avisa | AR §7 | M |
| FE-STA-12 | unit | En partida solo token y jugadas propias: ninguna clave contiene la solución | En curso | `localStorage` sin título/id objetivo | CA-1 | A |
| FE-API-01 | unit | Arranque en frío: `/health` 503/falla -> "Despertando el servidor...", backoff (timers falsos), recupera al 200 | `vi.useFakeTimers` | Reintentos crecientes hasta ~90 s, luego listo | CA-8, DEC-14 | A |
| FE-API-02 | unit | Tras ~90 s sin éxito: error con botón de reintento | Fake timers | Botón funcional | CA-8 | A |
| FE-API-03 | unit | Una sola llamada a `/health` al abrir; ningún `setInterval` de ping | Spy | 0 pings periódicos | RQ §9, DEC-14 | A |
| FE-API-04 | unit | Sin reintentos de POST de acción tras 4xx; sí en red/503 en arranque | Mock | Según política | DEC-14 | M |
| FE-API-05 [NUEVO] | unit | El cliente API no reintenta automáticamente `guess` tras `ALREADY_GUESSED` ni tras 409 `GAME_OVER` | Mock 409 | 1 sola petición | DEC-18 | M |
| FE-AUD-01 | unit | Clip: `fetch` a Blob -> `createObjectURL`; un fetch por intento aunque se repita | Mocks | 1 petición | DEC-05 | A |
| FE-AUD-02 | unit | `audio.play()` síncrono en el handler del clic | Mock Audio | Misma pila del evento | RQ §6, DEC-05 | A |
| FE-AUD-03 | unit | Clip 410/404: pide `state` para nuevo ticket y reintenta una vez | Mock | Recupera | DEC-04 | M |
| FE-AUD-04 | unit | `revokeObjectURL` al cambiar de intento/desmontar | Spy | Sin fugas | DEC-05 | B |
| FE-UI-01 | unit | Textos de interfaz en español; títulos y juegos tal cual (inglés) | - | Aserciones | RQ §6 | B |

## 3. E2E Playwright

Entorno: backend real en driver `fs`, `NODE_ENV=test`, semilla y fecha fijables (reloj de test, nunca en producción). Dos catálogos sintéticos:
- **Catálogo M (mono)**: 1 canción `enabled`. El diario siempre resuelve a ella, lo que permite ganar/perder de forma determinista.
- **Catálogo R**: ≥5 canciones en 3 juegos (A con 2 canciones, B con 2, multi-juego A+B, una deshabilitada). La objetivo del diario se conoce por el vector independiente (semilla y fecha fijas) y la del ilimitado, por filtro de pool controlado.

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-01 [MOD] | e2e | Diario | Partida diaria ganada en el intento 1, sin filtro | Catálogo M | Solución revelada, estado ganado, buscador y skip bloqueados, racha 1 | CA-7, RQ §3 | A |
| E2E-02 [MOD] | e2e | Diario | Partida diaria perdida: 6 intentos entre skips y fallos | Catálogo R | Tras el 6.º se revela solución; sin más acciones; estadística X | CA-7 | A |
| E2E-03 | e2e | Diario | Skips consecutivos alargan el clip (1->2->4->7->11->16 s) | `HTMLMediaElement.duration` del Blob | `[1,2,4,7,11,16]` ±0,1 s | CA-2 | A |
| E2E-04 [MOD] | e2e | Diario | Acierto en intento intermedio tras fallos | Catálogo R, objetivo conocida | Compartir muestra 🟥/🟨/⬛ y 🟩 en orden | RQ §3 | A |
| E2E-05 [MOD] | e2e | Diario | Diario ya jugado: recargar tras terminar. Se registra la red | Diario terminado | Resultado visible, sin botón jugar, **0 peticiones** a `POST /games` y a `/games/*` | CL, AR §7 | A |
| E2E-06 [MOD] | e2e | Diario | Mismo día en dos `browser.newContext()` independientes, sin filtro | Catálogo R | Misma solución al terminar en ambos | CA-4 | A |
| E2E-07 [MOD] | e2e | Diario | El diario no muestra filtro; cambiar el filtro en ilimitado no altera la partida ni el estado del diario | Catálogo R | Sin selector en diario; diario intacto | CA-4, RQ §3 | A |
| E2E-08 | e2e | Diario | Recarga en mitad de partida | 2 intentos consumidos | Mismo estado recuperado por token; en red solo `POST /games/state`, ningún `POST /games` | CL, AR §7 | A |
| E2E-09 [MOD] | e2e | Diario | Cambio de día con reloj simulado (`page.clock` + reloj de test del backend) | Partida de ayer terminada en storage | Se crea partida de hoy; la de ayer no se toca; la racha se continúa | CL | M |
| E2E-10 | e2e | Ilimitado | Partida completa y "Nueva partida" | - | Tras terminar permite otra | RQ §3 | A |
| E2E-11 | e2e | Ilimitado | Recarga en mitad de partida | - | Recupera partida | CL | A |
| E2E-12 | e2e | Ilimitado | Token manipulado (byte alterado) y caducado en `localStorage` | `page.evaluate` | Se descarta y ofrece/crea partida nueva sin crash | CL | A |
| E2E-13 [MOD] | e2e | Filtro (ilimitado) | Filtro vacío: "Empezar" deshabilitado | Desmarcar todos | `disabled`; sin petición a `/api/games` | CA-5 | A |
| E2E-14 [MOD] | e2e | Filtro (ilimitado) | Pool con una sola canción funciona | Filtro con juego de 1 canción | Se juega y se gana | CA-5 | A |
| E2E-15 [MOD] | e2e | Filtro (ilimitado) | Filtro persiste tras recarga; el diario sigue jugable con filtro vacío | - | Restaurado; diario no afectado | RQ §3 | M |
| E2E-16 [MOD] | e2e | Filtro (ilimitado) | Cambio de filtro a mitad de partida ilimitada: la partida sigue con su pool; la siguiente usa el nuevo | - | Verificar por la canción revelada al terminar y el pool resultante | CL | A |
| E2E-17 [MOD] | e2e | Feedback juego | Fallo con juego correcto en ilimitado con filtro {A} (2 canciones de A) | Catálogo R | Elegir la canción incorrecta de A muestra "juego acertado" | CA-3 | A |
| E2E-18 | e2e | Feedback juego | Fallo con juego incorrecto | Filtro {A}; elegir canción de B | "Juego incorrecto" | CA-3 | A |
| E2E-19 | e2e | Feedback juego | Canción multi-juego: acertar un juego compartido | Catálogo R | Acierto de juego | RQ §3 | M |
| E2E-20 | e2e | Buscador | Buscar por título y por nombre de juego; seleccionar | - | Opciones con sus juegos; envío funciona | DEC-17 | A |
| E2E-21 [MOD] | e2e | Buscador | Con filtro {A} en ilimitado, el buscador aún muestra canciones de B; en diario muestra todo el catálogo | Catálogo R | Lista completa en ambos modos | DEC-17 | A |
| E2E-22 | e2e | Buscador | Búsqueda sin acentos ni mayúsculas | - | Encuentra "Pokémon" con "pokemon" | DEC-17 | M |
| E2E-23 | e2e | Compartir | Texto de emojis tras terminar | Terminada | Emojis y modo/fecha; sin título, id ni juego de la solución | CA-6 | A |
| E2E-24 | e2e | Compartir | En victoria y en derrota | - | Formatos correctos | CA-6 | M |
| E2E-25 | e2e | Estadísticas | Racha y estadísticas persisten tras recarga | - | Valores mantenidos | RQ §3 | M |
| E2E-26 [MOD] | e2e | Fuga | Antes de terminar: registrar con `page.on('response')` cuerpo y cabeceras (incluido el audio como hex), HTML/JS servido, `localStorage`, `sessionStorage`, cookies, IndexedDB, DOM y `src` del audio. Buscar `clipKey`, `startSec`, `source`, nombre de fichero y cualquier indicador de cuál es la objetivo. Cuenta como legítimo que el título aparezca en `/api/catalog`, en el desplegable y en `guesses` propias | Catálogo R (≥2 canciones) | Cero coincidencias en `/api/games*`, clips, storage y DOM, salvo las propias jugadas | CA-1, RQ §2 | A |
| E2E-27 | e2e | Fuga | URL del audio opaca, sin extensión ni id; primeros bytes != `ID3` | - | Cumple | CA-1, RQ §2 | A |
| E2E-28 | e2e | Fuga | Reabrir la URL del clip | Clip reproducido | 410 | RQ §2 | A |
| E2E-29 | e2e | Fuga | `/fixtures/...` y `/clips/<clipKey>/1.mp3` no accesibles | - | 404 | RQ §2 | M |
| E2E-30 | e2e | Fuga | La longitud del Blob del intento N es la de `CLIP_SECONDS[N]`; no se descargan bytes de intentos futuros | Interceptar red | 1 petición de clip por intento; tamaño ≈ `N*16000` B | CA-2 | A |
| E2E-31 | e2e | Fuga | Tras terminar aparece la solución (título y juegos) | - | Visible | CA-7 | A |
| E2E-32 | e2e | Fuga | Comparar snapshots antes/después | - | La solución solo aparece tras el fin | CA-1 | M |
| E2E-33 | e2e | Arranque en frío | `/health` retrasado 10 s y luego 503 x3 y 200 | `page.route` | "Despertando el servidor...", sin errores no controlados; se recupera y juega | CA-8, DEC-14 | A |
| E2E-34 | e2e | Arranque en frío | 503 permanente > máximo | Reloj acelerado | Error con botón reintentar | CA-8 | M |
| E2E-35 | e2e | Arranque en frío | Sin pings periódicos tras cargar | `page.clock.fastForward` 2 min | 1 sola petición a `/health` | RQ §9 | A |
| E2E-36 | e2e | Red | Fallo transitorio en `POST /games/guess` (abort una vez) | - | Mensaje y reintento posible sin perder el intento | CA-8 | M |
| E2E-37 | e2e | Rate-limit | Spam de guesses/skips superando el límite | `RATE_LIMIT_*` bajo | Mensaje de 429 y recupera tras `Retry-After` | RQ §5 | M |
| E2E-38 | e2e | Móvil/oscuro | WebKit iPhone: flujo completo ganar/perder (diario e ilimitado) | `devices['iPhone 13']` | Funciona; `play()` tras tap | CA-8, RQ §6 | A |
| E2E-39 | e2e | Móvil/oscuro | `colorScheme:'dark'` y `light` | `use: {colorScheme}` | Fondo oscuro/claro computado, legible | CA-8 | A |
| E2E-40 | e2e | Móvil/oscuro | 375x667: sin scroll horizontal, controles ≥ 44 px, buscador usable | - | Layout correcto | CA-8 | M |
| E2E-41 | e2e | Audio | Sin autoplay antes del gesto | - | Sin `play()` previo al clic | RQ §6 | M |
| E2E-42 | e2e | Audio | Repetir el clip del intento actual sin nueva petición | Contar red | 0 peticiones adicionales | DEC-05 | M |
| E2E-43 | e2e | Multi-pestaña | Misma partida en dos pestañas; terminar en una y actuar en otra | Mismo context | `GAME_OVER` o estado coherente, sin crash | CL | B |
| E2E-44 [MOD] | e2e | Navegadores | E2E-01, 02, 26 y 45 en Chromium, Firefox y WebKit | Proyectos Playwright | Pasan en los tres | CA-8 | M |
| E2E-45 [NUEVO] | e2e | Canción ya intentada | Fallar con la canción X; X queda marcada y no seleccionable en el buscador (clic y teclado), sigue visible al buscar su título | Catálogo R | Ninguna petición al pulsar X; el resto se puede elegir | DEC-18, CL | A |
| E2E-46 [NUEVO] | e2e | Canción ya intentada | Forzar `ALREADY_GUESSED`: reenviar vía `page.route`/`request` el mismo `POST /games/guess` con la misma `songId` y el token previo | Tras un fallo en X | 409; UI muestra aviso, no se consume intento ni cambia el token guardado | DEC-18, CL | A |
| E2E-47 [NUEVO] | e2e | Canción ya intentada | Los `guesses` sobreviven a la recarga: tras recargar, X sigue marcada | Un fallo previo | Marcada | DEC-18 | A |
| E2E-48 [NUEVO] | e2e | Diario - apertura | Primera apertura sin estado: exactamente un `POST /games` con cuerpo `{"mode":"daily"}`; segunda apertura (recarga) usa `POST /games/state` y ningún `POST /games` | Storage vacío | Conteo de peticiones correcto | AR §7 | A |
| E2E-49 [NUEVO] | e2e | Diario - desviación de reloj | Reloj del navegador desviado un día (`page.clock`) respecto al servidor; el servidor manda la fecha | Diario de la fecha del servidor terminado en storage | Se muestra el resultado y se descarta el token nuevo, sin dejar estado duplicado | AR §7, CL | M |

## 4. Tests existentes afectados

No hay tests previos. Todo el plan es nuevo.

## 5. Matriz de cobertura

| Requisito | Casos |
|---|---|
| RQ §2 Solución no deducible | BE-TOK-08..14, 16..18, BE-TKT-02..08, BE-LEAK-01..12, BE-HDR-01..08, SC-FF-03, SC-VA-02/05, E2E-26..30 |
| RQ §3 6 intentos, duraciones, skip | SH-RUL-01, BE-ENG-08..14, BE-TKT-11, BE-HDR-11, SC-FF-02, FE-GAM-04, E2E-03, E2E-30 |
| RQ §3 Diario común sin filtro | BE-DAY-01..07, 10..20, SH-DAT-01..03, FE-GAM-11..17, FE-FIL-07, E2E-01..09, 48, 49 |
| RQ §3 Ilimitado con filtro | BE-DAY-18, BE-CAT-01..05, BE-TOK-16, FE-FIL-01..06, FE-GAM-10, E2E-10..16 |
| RQ §3 Intento repetido no permitido | BE-ENG-16, 18..24, BE-LEAK-11..12, BE-RL-11, BE-TOK-17..18, FE-GAM-18..19, FE-SRC-12..15, FE-API-05, E2E-45..47 |
| RQ §3 Feedback parcial, multi-juego | BE-ENG-02..07, FE-GAM-06, E2E-17..19 |
| RQ §3 Estadísticas (una racha diaria) | FE-STA-01..12, SH-DAT-03, E2E-25 |
| DEC-17 Buscador | FE-SRC-01..11, BE-ENG-06, E2E-20..22 |
| RQ §3 Compartir | FE-SHR-01..06, E2E-23..24 |
| RQ §4 Catálogo/script | SH-CAT-*, SC-* |
| RQ §5 Rate-limit, arranque en frío | BE-RL-01..11, FE-API-01..03, E2E-33..37 |
| RQ §6 UI, iOS, oscuro | FE-AUD-02, FE-UI-01, E2E-38..41 |
| RQ §9 Sin keep-alive | FE-API-03, E2E-35 |
| CA-1 | BE-TOK-11, BE-LEAK-05..07, 11..12, FE-STA-12, E2E-26, 32 |
| CA-2 | BE-TKT-09/11, BE-HDR-07/11, SC-FF-02, SC-VA-04, E2E-03, 30 |
| CA-3 | BE-ENG-02..03, FE-GAM-06, E2E-17..18 |
| CA-4 (diario común) | BE-DAY-01..07, 19, E2E-06..07, FE-FIL-07 |
| CA-5 (filtro ilimitado) | BE-CAT-03..04, BE-DAY-07 (pool de 1 del diario), FE-FIL-01, E2E-13..14 |
| CA-6 | FE-SHR-01..06, E2E-23..24 |
| CA-7 | BE-ENG-09..13, BE-LEAK-02..04, FE-GAM-02, E2E-01..02, 31 |
| CA-8 | FE-API-01..02, E2E-33..34, 38..40, 44 |
| CL token inválido/recarga | BE-TOK-05, BE-CAT-07, FE-GAM-07/13, E2E-08, 11..12 |
| CL diario ya jugado | FE-GAM-11, E2E-05 |
| CL cambio de filtro (ilimitado) | FE-GAM-10, E2E-16 |
| CL canción ya intentada | BE-ENG-16/18, FE-GAM-18, FE-SRC-12, E2E-45..46 |
| CL zona horaria | BE-DAY-10..15, 20, SH-DAT-01..03, BE-TOK-15, FE-STA-05..06, FE-GAM-17, E2E-09, 49 |

Cobertura de errores de la API (AR §5):

| Código | Casos |
|---|---|
| VALIDATION_ERROR | BE-VAL-01..05, BE-DAY-02 |
| EMPTY_FILTER | BE-CAT-03/04, FE-FIL-06 |
| UNKNOWN_GAME | BE-CAT-05 |
| UNKNOWN_SONG | BE-ENG-15, 21 |
| TOKEN_INVALID | BE-TOK-03..07, 13..14, 18, BE-CAT-07, FE-GAM-07, E2E-12 |
| GAME_OVER | BE-ENG-13, 21, FE-GAM-08, E2E-43 |
| ALREADY_GUESSED | BE-ENG-16, 18..22, BE-LEAK-11, BE-RL-11, FE-GAM-18, E2E-46 |
| CLIP_TICKET_USED | BE-TKT-02..03, BE-HDR-07, E2E-28 |
| CLIP_TICKET_INVALID | BE-TKT-06, BE-HDR-08 |
| RATE_LIMITED | BE-RL-01..11, FE-GAM-09, E2E-37 |
| STORAGE_ERROR | BE-STO-04, BE-HDR-12 |
| CATALOG_UNAVAILABLE | BE-CAT-08..09 |

## 6. Dependencias de entorno y datos

- Node (versión de claude-test), vitest 4, Testing Library + jsdom, Playwright con Chromium, Firefox y WebKit (`npx playwright install --with-deps`).
- Fixtures versionadas en `e2e/fixtures` y `backend/test/fixtures`:
  - Catálogo R: 3 juegos (A, B, C); canciones solo en A, solo en B, multi-juego A+B, una deshabilitada, y un juego con una sola canción para pool de 1 en ilimitado. Ids de 13 y 22 caracteres, `clipKey` de 16 hex.
  - Catálogo M: una sola canción `enabled`.
  - Clips sintéticos de tonos, CBR 128 kbps, estéreo, 44,1 kHz, sin ID3/Xing, 6 por canción, con tamaños idénticos entre canciones para el mismo intento. Para BE-LEAK-08 y SC-VA-02, además un juego de clips con tamaños deliberadamente distintos.
- Variables de test: `GAME_TOKEN_SECRET` (32+ bytes base64) y un segundo secreto, `DAILY_SEED` fija, `STORAGE_DRIVER=fs`, `STORAGE_DIR` a fixtures, `CLIP_TICKET_TTL_SEC` corto para caducidad, `RATE_LIMIT_*` reducidos en e2e.
- Reloj inyectable en backend (`now()`) para `tickets`, `token`, `daily` y rate-limit. Es requisito de testabilidad: sin él, las fronteras no son verificables. En frontend, `vi.useFakeTimers` y `page.clock`. En e2e, reloj de backend fijable solo con `NODE_ENV=test` (E2E-09, 49).
- Vectores de referencia de BE-DAY-05 y de fechas Madrid calculados de forma independiente (no importando la función bajo test). Las canciones objetivo del diario en e2e se derivan del vector (semilla y fecha fijas), o se usa el catálogo M.
- ffmpeg/ffprobe solo para SC-VA-06 y regenerar fixtures (skip explícito si falta).

## 7. Riesgos y limitaciones

1. Shazam/grabación no testeables (aceptado).
2. El rate-limit por nonce de 12/min puede chocar con el uso normal (guess/skip, `state`, recarga, reintentos y ahora rechazos `ALREADY_GUESSED`). BE-RL-10 y BE-RL-11 lo detectan. Si falla, es un defecto de diseño a decidir con el arquitecto.
3. Tickets usados en memoria: tras reinicio de Render un ticket vivo puede reusarse una vez (AR §13). Solo se documenta (BE-TKT-14).
4. S3 de Supabase real, egress, horas de Render, arranque en frío real y `trust proxy` en Render no se prueban en local. Hace falta verificación manual en el primer despliegue (incluye que `shared/` sea visible en Render y Vercel, importante porque ahora `shared/date.ts` lo usan ambos).
5. La prueba de fuga demuestra ausencia de cadenas conocidas, no de canales laterales (tamaños sí cubiertos en BE-LEAK-08 y SC-VA-02; tiempos de respuesta no). Con `guesses`/`ALREADY_GUESSED` se añadió BE-LEAK-11 para que el error no dependa de la objetivo.
6. Limitaciones aceptadas (AR §8): token antiguo reutilizable y apertura de partidas diarias nuevas en otro navegador para sondear. Con el diario común, una persona puede probar canciones en otros navegadores sin consumir su partida de hoy. Ni el rate-limit lo evita del todo. BE-ENG-17 solo lo documenta.
7. WebKit en Linux no es Safari iOS real: hay que verificar autoplay en un iPhone antes de cerrar CA-8.
8. Cambios de catálogo a mitad de día cambian la canción del diario de partidas nuevas (DEC-09, ahora con cualquier alta o baja en todo el catálogo, no solo en un juego). Solo BE-CAT-07 y BE-DAY-20 cubren la parte del token.
9. yt-dlp y la subida real a Supabase no se prueban sin red; solo argumentos y parseo.
10. Ambigüedades abiertas que el desarrollador debe resolver, porque los casos asumen una elección (documentar la decisión en el propio test):
    - Inclusividad de `exp` (BE-TOK-06).
    - Si el ticket queda consumido cuando falla el almacén (BE-HDR-12).
    - Qué hace `draft` con ids duplicados (SC-DR-05).
    - Qué pasa si `q` o `guesses` contienen una canción retirada del catálogo: `TOKEN_INVALID` (BE-TOK-18) o se omite del listado.
    - Prioridad de errores `GAME_OVER` > `UNKNOWN_SONG` > `ALREADY_GUESSED` (BE-ENG-21).
    - Si los campos extra en `guess` se ignoran o se rechazan (BE-VAL-07).
    - Si `ALREADY_GUESSED` cuenta para el rate-limit (BE-RL-11, propuesta: sí).

## 8. Orden de ejecución recomendado

1. `shared` (SH-*), `token`, `tickets`, `daily`, `engine`, `catalog`.
2. Integración backend (BE-LEAK, BE-HDR, BE-RL).
3. Scripts (SC-*).
4. Frontend (FE-*).
5. E2E: primero E2E-01, 13, 26, 45 (humo, fuga e intento repetido), después el resto y por último la matriz de navegadores (E2E-44).

Recuento aproximado: 18 BE-TOK, 14 BE-TKT, 20 BE-DAY (2 retirados), 9 BE-CAT, 24 BE-ENG, 12 BE-LEAK, 14 BE-HDR, 12 BE-VAL/CFG, 11 BE-RL, 5 BE-STO, 18 SH, 36 SC, ~80 FE, 49 E2E.

