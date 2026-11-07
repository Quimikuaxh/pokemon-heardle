# Plan de pruebas - Pokemon Heardle

Fuentes: REQUISITOS.md y ARQUITECTURA.md vigentes en la rama `feature/admin-catalogo` (DEC-01..42, §6.1, §8, §11).
Referencias: RQ §n = REQUISITOS, CA-n = criterio de aceptación, CL = casos límite (RQ §8), DEC-nn y AR §n = ARQUITECTURA.
Marcas: [NUEVO] caso nuevo en esta iteración; [MOD] caso existente cuyo contenido cambia por esta iteración; [AJ] caso existente cuya redacción se concreta porque una DEC ya cerrada (DEC-13, 20..35) elimina una ambigüedad; [RETIRADO] el ID no se reutiliza.
El código está implementado y existe la suite `e2e/` con IDs E2E-01..49. Los IDs vigentes se conservan.

## 0. Cambios respecto a la versión anterior

Funcionalidades nuevas cubiertas: admin local del catálogo (DEC-36..39, AR §6.1), detección de canciones cortas (DEC-40), `youtubeId` en la solución revelada y botón "Escuchar la canción completa" (DEC-41), barra de reproducción segmentada (DEC-42).

- **Modificados** (mismo ID): BE-LEAK-02, 03, 05, 06, 10; BE-CAT-06; FE-STA-12; FE-AUD-02; SC-DR-01, SC-DR-03, SC-BU-02, SC-VA-01; SC-GI-01; SH-CAT-01; E2E-26, E2E-31, E2E-44.
- **Ajustados a DEC ya cerradas** [AJ] (resuelven ambigüedades de v2): BE-TOK-06, BE-TOK-18, BE-DAY-05, BE-DAY-16, BE-TKT-03, BE-RL-05/06/11, BE-HDR-12/13/14, BE-VAL-07, BE-ENG-21, SH-CAT-03/04, SC-UP-04, FE-SHR-01, FE-GAM-09, FE-GAM-18.
- **Nuevos**:
  - shared: SH-CAT-15..21.
  - backend: BE-CAT-10..11, BE-ENG-25..26, BE-LEAK-13..16.
  - scripts, regla de corta: SC-DUR-01..11.
  - scripts, `draft`/`build`/`validate`: SC-DR-07..09, SC-BU-03..05, SC-VA-07..09.
  - scripts, almacén y utilidades: SC-CS-01..12, SC-ID-01..05.
  - scripts, otros: SC-GI-02..03, SC-ISO-01..02.
  - servidor del admin: AD-SRV-01..14, AD-CAT-01..08, AD-PAT-01..20, AD-GAM-01..14, AD-AUD-01..16, AD-STA-01..05, AD-CLI-01..07.
  - UI del admin: AU-FIL-01..10, AU-UI-01..22.
  - frontend: FE-BAR-01..12, FE-PLY-01..10, FE-EMB-01..14, FE-CSP-01..02.
  - E2E: E2E-50..72.
- **Eliminado de §7 (riesgos)**: las ambigüedades que las DEC-21, 22, 30, 31 y 13 ya resuelven (inclusividad de `exp`, ticket y fallo de almacén, `q` con canción retirada, prioridad de errores, campos extra, `ALREADY_GUESSED` y rate-limit). Se añaden las ambigüedades nuevas de esta iteración.

### 0.1 Retirada de compartir y estadísticas (decisión 2026-10-04)

El usuario retira compartir resultado y estadísticas (REQUISITOS §9, ARQUITECTURA DEC-27 retirada y DEC-43). Se mantiene `DailyRecord` para no repetir el diario. Las filas de esta sección prevalecen sobre las de §2 y §3 con el mismo ID.

- **Retirados** (el ID no se reutiliza): FE-SHR-01..06, FE-STA-01..11, FE-EMB-14, SH-DAT-03 (`shared/date.ts` solo calcula la fecha de hoy, cubierta por SH-DAT-01/02), E2E-23..25.
- **Modificados:**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-STA-12 | unit | Fuga en almacenamiento (se conserva el ID por CA-1). Partida EN CURSO: ninguna clave de `localStorage` (`unlimited`, `daily:<fecha>`, `filter`) contiene título, id ni `youtubeId` de la objetivo. Terminada: `DailyRecord.view` puede contener `solution.youtubeId` | En curso / terminada | En curso: sin coincidencias; terminada: solo dentro de `solution` | CA-1, DEC-41 | A |
| E2E-01 | e2e | Diario ganado en el intento 1 | Catálogo M | Solución revelada, estado ganado, buscador y skip bloqueados; sin botón de compartir ni estadísticas | CA-7 | A |
| E2E-02 | e2e | Diario perdido (6 intentos entre skips y fallos) | Catálogo R | Tras el 6.º se revela la solución; sin más acciones | CA-7 | A |
| E2E-04 | e2e | Acierto intermedio tras fallos: la lista de intentos muestra en orden fallo, juego acertado, skip y acierto (`miss`, `game`, `skip`, `hit`) | Catálogo R, objetivo conocida | Historial correcto y en orden; ganada en el intento esperado | RQ §3, CA-3 | A |
| E2E-09 | e2e | Cambio de día con reloj simulado (`page.clock` + reloj de test del backend) | Partida de ayer terminada en `daily:<ayer>` | Se crea la partida de hoy y es jugable; la de ayer no cambia | CL | M |
| E2E-44 | e2e | E2E-01, 02, 26, 45, 50 y 54 en Chromium, Firefox y WebKit | Proyectos Playwright | Pasan en los tres | CA-8 | M |

- **Nuevos:**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-NOF-01 | unit | Tras terminar (ganar/perder, diario/ilimitado) el resultado NO muestra "Compartir"/"Copiar resultado" y no se llama a `navigator.clipboard`, `navigator.share` ni `execCommand('copy')` (spies) | `GameView` terminada | Ausentes; 0 llamadas | Decisión 2026-10-04 | A |
| FE-NOF-02 | unit | La UI no muestra estadísticas ("racha", "distribución", "estadísticas", ni botón/modal) en ningún estado terminado ni en cabecera/menú | Estados terminados | Ningún elemento | Decisión 2026-10-04 | A |
| FE-NOF-03 | unit | Tras partidas completas, las únicas claves `heardle:` son `filter`, `daily:<fecha>` y `unlimited` (solo con partida en curso); ninguna `stats:*` | Storage vacío | Conjunto exacto | Decisión 2026-10-04, AR §7 | A |
| FE-NOF-04 | unit | Claves `heardle:stats:*` heredadas (válidas, corruptas o de otra versión) no se leen ni rompen nada; según DEC-43 se borran al arrancar | Storage con claves heredadas | Diario y filtro normales; sin excepción; claves eliminadas | DEC-43 | M |
| FE-DRC-01 | unit | `DailyRecord` se mantiene: al terminar un diario se guarda `daily:<fecha>` = `{token, finished:true, view}` con `results` y `solution`, sin campos de estadísticas | Diario terminado | Forma esperada | CL, AR §7 | A |
| FE-DRC-02 | unit | Un diario terminado se muestra al reabrir y no se vuelve a jugar: sin botón de partida y 0 llamadas a la API | `daily:<hoy>` terminado | Resultado visible, 0 llamadas | CL | A |
| E2E-73 | e2e | Terminar un diario (ganar) y un ilimitado (perder): sin compartir ni estadísticas (texto y rol: "Compartir", "Copiar", "Racha", "Estadísticas", "Distribución"); `localStorage` solo con `heardle:filter`, `heardle:daily:<fecha>` y, en curso, `heardle:unlimited`; ninguna clave `stats:*`. Recargar el diario terminado muestra el resultado sin repetir | Catálogo M y R | Ausencias confirmadas | Decisión 2026-10-04, CL | A |

Matriz §5: las filas "RQ §3 Estadísticas", "RQ §3 Compartir" y "CA-6" quedan sin efecto; la cobertura de la retirada es FE-NOF-01..04, FE-DRC-01..02 y E2E-73.

### 0.2 Clip único de 16 s (DEC-44) y fundido con Web Audio (DEC-45)

Prevalece sobre las filas anteriores con el mismo ID. Fuentes: ARQUITECTURA.md (DEC-06/07/22/23/24/44/45, §5 `/clips`, §6 pasos 4-6, §7, §9, §11) y REQUISITOS.md (§9, criterio 2: "hasta 24 ms menos por el corte en límite de trama MP3, nunca más").

Datos de referencia (DEC-44): `CLIP_FRAME_COUNTS=[39,77,154,268,422,614]`; `CLIP_BYTE_OFFSETS=[16300,32182,64365,112013,176378,256626]`; `CLIP_TOTAL_BYTES=256626`; `frames(N)=floor((N*44100+1105)/1152)` para N<16 y 614 para N=16. Bytes tras k tramas = `floor(k*144*128000/44100)`.
Datos de referencia (DEC-45): rampa de ganancia con `setValueAtTime(1,t0)`, `setValueAtTime(1,t0+d-0.05)`, `linearRampToValueAtTime(0,t0+d)`, con `d = buffer.duration`.

**Retirados:** SC-FF-02 (args de 6 clips por intento; sustituido por SC-CLP-01..03) y SC-FF-06 (fundido por intento dentro del fichero; sustituido por FE-WA-05).

**Modificados — shared, script y backend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-RUL-01 | unit | `CLIP_SECONDS=[1,2,4,7,11,16]`, `MAX_ATTEMPTS=6`, y `shared/rules.ts` exporta `CLIP_FRAME_COUNTS`, `CLIP_BYTE_OFFSETS` y `CLIP_TOTAL_BYTES` (6, 6 y 1 valores) | - | Exactos y de longitud coherente con `CLIP_SECONDS` | RQ §3, DEC-44 | A |
| SC-FF-03 | unit | Args del clip único sin metadatos y sin reservoir: `-map_metadata -1 -id3v2_version 0 -write_xing 0 -fflags +bitexact -reservoir 0` | - | Todos presentes | DEC-06, DEC-44 | A |
| SC-FF-04 | unit | Ruta de salida `data/out/clips/<clipKey>.mp3` (sin subdirectorio ni número); no contiene id ni título | - | Correcta | DEC-07, DEC-24, DEC-44 | A |
| SC-BU-01 | unit | Recompila solo si cambian `startSec` o la fuente; un clip con el layout antiguo (`<clipKey>/<n>.mp3` sin `<clipKey>.mp3`) cuenta como no compilado | Manifest simulado y layout antiguo | Recompila el antiguo; no el ya migrado | AR §6, DEC-44 | M |
| SC-VA-01 | unit | `validate` falla con: `<clipKey>.mp3` ausente en una canción activa, catálogo inválido, o `enabled` con `games: []`; con el layout antiguo y sin fichero nuevo también falla | Dir sintético | Código != 0 con mensaje que nombra la canción | AR §6, DEC-44 | A |
| SC-VA-02 | unit | Tamaño distinto de `CLIP_TOTAL_BYTES` (más corto, más largo, 0 bytes) | Ficheros sintéticos | Falla y nombra canción y bytes | DEC-06, DEC-44 | A |
| SC-VA-03 | unit | Fichero de exactamente `CLIP_TOTAL_BYTES` con 614 tramas válidas y patrón 417/418 | MP3 sintético válido | Pasa | DEC-06, DEC-44 | A |
| SC-VA-04 | unit | `ffprobe` simulado sobre el fichero entero: tolerancia −30/+60 ms respecto a 16 s | Mock | −29 y +59 pasan; −31 y +61 fallan | CA-2, DEC-44 | A |
| SC-VA-06 | unit (cond.) | `validate` real contra un clip generado con ffmpeg (`-reservoir 0`, 128k, 44,1 kHz estéreo, `-write_xing 0`) | ffmpeg presente | 256.626 B, 614 tramas, offsets en límite de trama; skip explícito sin ffmpeg | AR §11, DEC-44 | M |
| SC-UP-04 | unit | Sube solo `clips/<clipKey>.mp3` nuevos o con md5 distinto; el primer `upload` tras migrar sube todos y el segundo ninguno | Remoto parcial y con layout antiguo | Diferencia correcta; idempotente | DEC-23, DEC-44 | M |
| SC-UP-05 | unit | `--prune` borra todo bajo `clips/` que no sea `clips/<clipKey>.mp3` de una canción activa (carpetas antiguas incluidas); sin el flag no borra nada; nunca toca `catalog/catalog.json` | Remoto con layouts mezclados | Solo clips activos y catálogo | AR §6, DEC-44 | A |
| SC-UP-06 | unit | `upload` no sube clips de canciones desactivadas y el catálogo subido las mantiene `enabled:false` | Corta desactivada | 0 claves de esa canción | DEC-40, DEC-44 | M |
| BE-TKT-11 | unit | El intento N sirve el prefijo `CLIP_BYTE_OFFSETS[N]` del clip único | Clip único de fixture | 16.300 / 32.182 / 64.365 / 112.013 / 176.378 / 256.626 bytes | CA-2, DEC-44 | A |
| BE-HDR-01 | unit (int) | Cabeceras de `GET /clips/:ticket` | Ticket válido | `audio/mpeg`, `Content-Length` = `CLIP_BYTE_OFFSETS[intento]`, `no-store, private`, `nosniff` | AR §5, DEC-44 | A |
| BE-HDR-06 | unit (int) | `Range` e `If-None-Match` en `/clips` | Ticket válido | 200 con el prefijo completo (sin 206/304) | DEC-05, DEC-44 | M |
| BE-HDR-10 | unit (int) | El cuerpo es exactamente `fichero.subarray(0, offset)`; sin ID3 ni Xing/Info | Fixture | Prefijo idéntico | DEC-06, DEC-44 | M |
| BE-HDR-11 | unit (int) | Tamaño servido = `CLIP_BYTE_OFFSETS[N]` exacto y cada offset cae en cabecera de trama | Clip único | Coincide en los 6 intentos | CA-2, DEC-44 | A |
| BE-HDR-12 | unit (int) | Fallo del almacén o formato inválido del clip: 502 `STORAGE_ERROR` sin detalles; el ticket NO se consume y un reintento funciona si el almacén se recupera | Store que falla una vez | 502, luego 200 con el mismo ticket | DEC-22, DEC-44 | A |
| BE-LEAK-08 | unit (int) | `Content-Length` de clips y tamaño de `GameView` iguales entre objetivos para el mismo intento (por construcción) | Dos canciones | Iguales | DEC-03, DEC-06, DEC-44 | A |
| BE-STO-03 | unit | `FsClipStore.getClip(clipKey)` lee `clips/<clipKey>.mp3`; sin path traversal | `clipKey` `../`, `a/b`, vacío | Rechaza claves fuera de `[0-9a-f]{16}` | DEC-07, DEC-44 | A |
| BE-STO-04 | unit | `S3ClipStore.getClip(clipKey)` con cliente simulado | Mock | `GetObject` con `clips/<clipKey>.mp3`; error -> `STORAGE_ERROR`; nunca la clave antigua | DEC-08, DEC-44 | M |
| BE-STO-05 | unit | La caché guarda un fichero por canción y lo reutiliza en los 6 intentos | Spy | 1 lectura para los 6 intentos | AR §9, DEC-44 | M |

**Modificados — frontend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-AUD-01 | unit | `prepare`: un solo `fetch` del Blob por intento y una decodificación aunque se repita el clip | `AudioContext` simulado | 1 petición y 1 decodificación | DEC-05, DEC-45 | A |
| FE-AUD-02 | unit | `play()` síncrono en el gesto: `ctx.resume()` si no está `running` y `source.start` en la misma pila (sin `await` previo), también con `subscribe` activo | Contexto `suspended` | `resume` y `start` antes de terminar el handler | DEC-05, DEC-45, DEC-42 | A |
| FE-AUD-03 | unit | Clip 410/404 en `prepare`: pide `state`, reintenta una vez; sin `AudioBuffer` a medias | Mock | Recupera; un reintento | DEC-04 | M |
| FE-AUD-04 | unit | Limpieza al cambiar de intento o desmontar: se suelta el `AudioBuffer` anterior; `revokeObjectURL` solo en el fallback `<audio>` | Spy | Sin referencias ni URLs sin revocar | DEC-05, DEC-45 | B |
| FE-PLY-01 | unit | Emisiones por frame `{playing:true, positionSec}` con `min(ctx.currentTime - t0, d)` (Web Audio) o `audio.currentTime` (fallback) | Contexto y audio falsos | Posición correcta en ambas rutas | DEC-42, DEC-45 | A |
| FE-PLY-02 | unit | Al terminar (`onended`), parar o interrumpirse emite `{playing:false}` y detiene el rAF; en fallback igual con `ended`/`pause` | - | Emisión final y 0 frames | DEC-42, DEC-45 | A |
| FE-PLY-05 | unit | Sin reproducción no hay rAF activo (tampoco tras `onended` ni con contexto suspendido) | Spy rAF | 0 frames | DEC-42 | M |
| FE-PLY-06 | unit | Repetir crea una fuente nueva y reinicia desde 0 (la anterior se para) | - | `positionSec` desde 0 | DEC-42, DEC-45 | M |
| FE-PLY-07 | unit | Cambio de intento: `{playing:false, positionSec:0}`, listeners siguen y se suelta el buffer anterior | - | Coherente | DEC-42, DEC-45 | M |
| FE-PLY-10 | unit | `stop()` para la fuente, emite `{playing:false}` y no cierra el contexto; `dispose()` sí lo cierra | - | Estado final correcto | DEC-41, DEC-45 | A |

**Modificados — E2E**

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-03 | e2e | Diario | Skips alargan el clip 1->2->4->7->11->16 s; duración leída del `AudioBuffer` decodificado (script de inicio que envuelve `decodeAudioData`) | Fixtures con clip único | ≈ 1,0188 / 2,0114 / 4,0229 / 7,0008 / 11,0237 / 16,0392 s; N ≤ duración ≤ N + 0,05 s | CA-2, DEC-44, DEC-45 | A |
| E2E-29 | e2e | Fuga | `/fixtures/...`, `/clips/<clipKey>.mp3` y `/clips/<clipKey>/1.mp3` no accesibles desde frontend ni backend | - | 404 | RQ §2, DEC-07 | M |
| E2E-30 | e2e | Fuga | Un `GET /clips/<ticket>` por intento; el cuerpo del intento N mide `CLIP_BYTE_OFFSETS[N]` y es prefijo del N+1 | Interceptar red | Tamaños 16.300 … 256.626 | CA-2, DEC-44 | A |
| E2E-38 | e2e | Móvil | WebKit iPhone: flujo completo; `AudioContext` pasa de `suspended` a `running` tras el primer tap y suena en ese gesto | `iPhone 13` | Sin errores de autoplay | CA-8, DEC-45 | A |
| E2E-41 | e2e | Audio | Sin autoplay antes del gesto: contexto `suspended` y ningún `source.start` hasta el clic | Script que registra `start`/`resume` | 0 arranques previos | RQ §6, DEC-45 | M |
| E2E-42 | e2e | Audio | Repetir el clip sin red ni nueva decodificación | Contar red y `decodeAudioData` | 0 adicionales | DEC-05, DEC-45 | M |
| E2E-52 | e2e | Barra | El cabezal avanza (sigue a `ctx.currentTime`), no supera la zona desbloqueada y queda en reposo al terminar | Intento 3 (4 s) | Monótono, ≤ tope, parado | DEC-42, DEC-45 | A |

**Nuevos — shared (`shared/rules.ts`)**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-RUL-02 | unit | Valores exactos de las constantes | - | Los de la referencia | DEC-44 | A |
| SH-RUL-03 | unit | Recalcular tramas con `floor((N*44100+1105)/1152)` (N<16) y 614 para N=16 | - | = `CLIP_FRAME_COUNTS` | DEC-44 | A |
| SH-RUL-04 | unit | Recalcular offsets desde el patrón 417/418 construido en el test, sin importar la fórmula de producción | - | = `CLIP_BYTE_OFFSETS`; límites de trama; total correcto | DEC-44 | A |
| SH-RUL-05 | unit | Invariantes: offsets crecientes, último = total; para N<16 el audio real queda por debajo de N, de ~1 a 24 ms; con `ceil` se rebasaría N | - | Cumple | DEC-44, CA-2 | A |
| SH-RUL-06 | unit | Un solo origen de las constantes: backend, `validate` y `generate-fixtures` las importan de `shared/rules` (sin literales duplicados fuera de tests) | Análisis estático | Sin duplicados | DEC-44, DEC-12 | M |

**Nuevos — script de catálogo**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-CLP-01 | unit | `clipArgs`: un clip, `-t 16`, 128k CBR, estéreo, 44100 Hz, `-reservoir 0`, salida `<clipKey>.mp3` | - | Args exactos; nada por intento | DEC-44 | A |
| SC-CLP-02 | unit | El único fundido del fichero es el de 50 ms al final (`afade=t=out:st=15.95:d=0.05`) | - | Un solo `afade` | DEC-44, DEC-45 | A |
| SC-CLP-03 | unit | Args seguros: sin shell, rutas absolutas, `youtubeId` que empieza por `-` | Título y ruta hostiles | Sin inyección | AR §8 | M |
| SC-CLP-04 | unit | `build` borra `out/clips/<clipKey>/` antiguo tras generar el nuevo, solo de las canciones reconstruidas | Layouts antiguo y nuevo | Correcto | DEC-44 | A |
| SC-CLP-05 | unit | Si la generación falla, el directorio antiguo no se borra | ffmpeg simulado que falla | Antiguo intacto, código != 0 | DEC-44 | A |
| SC-CLP-06 | unit | `validate` recorre cabeceras: 614 tramas MPEG-1 Layer III 128 kbps 44,1 kHz estéreo | MP3 sintético | Pasa; MPEG-2, otro bitrate o mono -> falla | DEC-44 | A |
| SC-CLP-07 | unit | `validate`: cada offset es límite de trama; patrón de padding desplazado falla | MP3 sintético alterado | Falla nombrando el offset | DEC-44 | A |
| SC-CLP-08 | unit | `validate`: `main_data_begin == 0` en todas las tramas | Trama con reservoir | Falla nombrando la trama | DEC-44 | A |
| SC-CLP-09 | unit | `validate`: primera trama Xing/Info o ID3 al inicio | Cada caso | Falla | DEC-06, DEC-44 | A |
| SC-CLP-10 | unit | `validate` con solo el layout antiguo | Dir antiguo | Falla pidiendo `build` | DEC-44 | M |
| SC-CLP-11 | unit | Migración: `upload` sin prune sube los nuevos y deja los antiguos; `upload --prune` borra los antiguos | Remoto mezclado | Estado tras cada paso | DEC-44 | A |
| SC-CLP-12 | unit | Un clip que no cumple `validate` impide todo `upload` | 1 corrupto entre 5 | 0 subidas | AR §6, DEC-44 | A |

**Nuevos — backend (`unit (int)` salvo indicación)**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-CLP-01 | unit (int) | Partida completa: cada respuesta es `subarray(0, CLIP_BYTE_OFFSETS[i])` y prefijo de la siguiente | Clip único | Prefijos encadenados | DEC-44, CA-2 | A |
| BE-CLP-02 | unit (int) | Fichero de tamaño distinto de `CLIP_TOTAL_BYTES` | Store erróneo | 502 `STORAGE_ERROR`; ticket no consumido | DEC-22, DEC-44 | A |
| BE-CLP-03 | unit (int) | Longitud correcta pero sin cabecera de trama en algún offset | Corrupto en el 3.º offset | 502 sin consumir ticket; el test documenta si se valida todo el fichero o solo el offset del intento | DEC-22, DEC-44 | A |
| BE-CLP-04 | unit (int) | Un fichero válido en caché no se revalida tramo a tramo en cada petición | Spy | Coste constante | DEC-44, AR §9 | M |
| BE-CLP-05 | unit (int) | Caché por canción: 1 lectura por partida; LRU con `CLIP_CACHE_MB` pequeño | Spy | Correcto | AR §9, DEC-44 | A |
| BE-CLP-06 | unit (int) | `getClip(clipKey)` es la única operación de audio; se rechaza `clips/<clipKey>/<n>.mp3` | - | Solo `clips/<clipKey>.mp3` | DEC-44, DEC-07 | A |
| BE-CLP-07 | unit (int) | El backend arranca con un store solo con el layout nuevo | Fixture nuevo | `/health` 200; canciones servidas | DEC-44 | M |
| BE-CLP-08 | unit (int) | Backend nuevo contra bucket sin los ficheros nuevos | `clips/` vacío | 502 en `/clips` sin consumir ticket; `/health` y `/catalog` 200 | DEC-44, DEC-22 | M |
| BE-CLP-09 | unit (int) | Sin fuga por longitud ni bytes posteriores al offset | Dos canciones distintas | Longitud igual; ningún byte posterior | CA-1, CA-2, DEC-44 | A |
| BE-CLP-10 | unit | Fixtures de lamejs: 614 tramas, 256.626 B, offsets en límite, sin ID3/Xing; `main_data_begin == 0` no se exige (lamejs no desactiva el reservoir) | Fixtures | Cumplen | DEC-44 | A |
| BE-CLP-11 | unit (int) | El 6.º intento sirve el fichero entero, idéntico | - | Igual byte a byte | DEC-44 | A |
| BE-CLP-12 | unit (int) | `CLIP_CACHE_MB=32` ≈ 130 canciones; la 131.ª expulsa la más antigua | Fixtures sintéticos | Correcto | AR §9, DEC-44 | M |

**Nuevos — frontend `ClipPlayer` con Web Audio (`AudioContext` simulado)**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-WA-01 | unit | Un `AudioContext` por `ClipPlayer`, creado perezosamente en el primer `prepare` y reutilizado | `createAudioContext` inyectado | 1 instancia; 0 antes de `prepare` | DEC-45 | A |
| FE-WA-02 | unit | `prepare` decodifica y no llama a `resume()` | Contexto `suspended` | `resume` 0 veces | DEC-45 | A |
| FE-WA-03 | unit | `play` con contexto `suspended`: `resume()` y `start(t0)` síncronos | - | Misma pila | DEC-45, DEC-05 | A |
| FE-WA-04 | unit | `play` con contexto `running` no llama a `resume` | - | 0 llamadas | DEC-45 | M |
| FE-WA-05 | unit | Ganancia exacta (referencia DEC-45) en los 6 intentos, sin caso especial para 16 s; `d < 0.05` sin tiempos negativos | Buffers de 1,0188 … 16,0392 s y de 0,03 s | Llamadas y tiempos exactos | DEC-45 | A |
| FE-WA-06 | unit | Cada `play` crea fuente y `GainNode` nuevos; la anterior se para y desconecta | Dos `play` | 2 fuentes; 1.ª parada | DEC-45 | A |
| FE-WA-07 | unit | `positionSec = min(ctx.currentTime - t0, d)`, nunca negativa ni mayor que `d` | `currentTime` simulado | Acotada | DEC-45, DEC-42 | A |
| FE-WA-08 | unit | `onended` emite `playing:false` y detiene el rAF; con `stop()` previo no se emite dos veces | - | Una emisión | DEC-45 | A |
| FE-WA-09 | unit | Contexto pasa a `interrupted`/`suspended` mientras suena: emite `playing:false`, para la fuente y el siguiente `play()` vuelve a llamar a `resume()` | Evento simulado | Correcto | DEC-45 | A |
| FE-WA-10 | unit | `resume()` rechaza: `playing:false`, sin excepción; un segundo clic reintenta | - | Coherente | DEC-45 | M |
| FE-WA-11 | unit | `dispose()` cierra el contexto una vez, idempotente, sin emisiones posteriores; `stop()` no lo cierra | - | Cierre único | DEC-45 | A |
| FE-WA-12 | unit | Solo se conserva el `AudioBuffer` del intento actual | Inspección | 1 buffer vivo | DEC-45 | M |
| FE-WA-13 | unit | Sin `AudioContext` (`createAudioContext` → `null`): `<audio>` + objectURL, corte seco; `play` sigue síncrono | - | 0 usos de Web Audio | DEC-45, DEC-05 | A |
| FE-WA-14 | unit | Solo `webkitAudioContext`: se usa y funciona igual | - | Igual que FE-WA-01..07 | DEC-45 | M |
| FE-WA-15 | unit | `decodeAudioData` rechaza: ese clip va por `<audio>`; el siguiente vuelve a intentar Web Audio | Falla una vez | Clip 1 fallback; clip 2 Web Audio | DEC-45 | A |
| FE-WA-16 | unit | Carrera en `prepare` (A y luego B): el resultado tardío de A se descarta | Retardos invertidos | Suena B | DEC-45 | M |
| FE-WA-17 | unit | `navigator.audioSession.type = 'playback'` si existe; sin él no falla | Con y sin | Correcto | DEC-45 | M |
| FE-WA-18 | unit | Interfaz pública de `ClipPlayer` sin cambios; `ClipProgressBar` no cambia | Tipos y render | Sin cambios de API | DEC-45, DEC-42 | M |
| FE-WA-19 | unit | Nada se emite ni queda registrado tras `dispose` o desmontar | Eventos tras dispose | 0 emisiones | DEC-45 | M |

**Nuevos — E2E**

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-74 | e2e | Fundido | Envolviendo `GainNode` y `decodeAudioData`: cada `play` (6 intentos) programa 1 hasta `t0+d-0.05` y rampa a 0 en `t0+d` | Chromium y WebKit | 6 rampas coherentes | DEC-45 | A |
| E2E-75 | e2e | Fallback | Sin `AudioContext` ni `webkitAudioContext`: partida completa con `<audio>`, barra con `audio.currentTime`, sin errores en consola | Script de inicio | Flujo completo | DEC-45, CA-8 | A |
| E2E-76 | e2e | Corte | Fixtures con un tono distinto por segundo: los últimos 10 ms del buffer del intento N tienen el tono del segundo N, no del N+1 (FFT en página) | Tonos escalonados | Correcto en los 5 primeros intentos | CA-2, DEC-44 | M |
| E2E-77 | e2e | Audio | Un fetch y una decodificación por intento (también al repetir o cambiar de pestaña); el fichero completo no se pide antes del intento 6 | Contadores | Conteos correctos; bytes ≤ offset | DEC-44, DEC-45 | A |
| E2E-78 | e2e | Errores | Fixture alterado en un offset: 502, la UI muestra "No se pudo cargar el audio. Reintentar" y permite reintentar sin consumir ticket; reparado el fichero, el mismo ticket da 200 (sin caché envenenada) | Fixture corrupto | Sin crash; reintento | DEC-44, DEC-22, DEC-28 | M |
| E2E-79 | e2e | iOS | `statechange` a `interrupted` durante la reproducción: barra y botón en reposo; el siguiente clic reanuda | WebKit con contexto controlado | UI coherente | DEC-45 | M |

**Matriz §5:** "RQ §3 / CA-2" += SH-RUL-02..06, SC-CLP-01..12, BE-CLP-01..12, BE-HDR-11, E2E-03, 30, 76; "RQ §2" += BE-CLP-09, E2E-29, 76; nueva fila "DEC-44 clip único" = SH-RUL-01..06, SC-FF-03/04, SC-BU-01, SC-VA-01..04/06, SC-UP-04..06, SC-CLP-01..12, BE-TKT-11, BE-HDR-01/06/10..12, BE-LEAK-08, BE-STO-03..05, BE-CLP-01..12, E2E-29, 30, 76, 78; nueva fila "DEC-45 fundido" = FE-AUD-01..04, FE-PLY-01/02/05..07/10, FE-WA-01..19, E2E-38, 41, 42, 52, 74, 75, 77, 79; "CA-8" += E2E-75, 79; "RQ §6 (iOS)" += FE-WA-03/09/10/17, E2E-79.

**Riesgos (complementan §7):**
1. Verificación manual en iPhone real: desbloqueo del `AudioContext`, interruptor de silencio con `navigator.audioSession.type='playback'` (Safari ≥ 16.4), llamadas y segundo plano. WebKit en Linux solo lo aproxima.
2. Orden de despliegue obligatorio (DEC-44): `build` → `upload` sin `--prune` → merge a `main` (Render) → `upload --prune`. Un backend nuevo sin ficheros nuevos da 502 en todos los clips (BE-CLP-08). No verificable en CI; está en `DESARROLLO.md`.
3. Los fixtures de lamejs usan reservoir: `main_data_begin == 0` solo lo garantiza `validate` (SC-CLP-08).
4. Un cambio de versión de ffmpeg/LAME que altere el patrón de tramas o el retardo (1105 muestras) lo detecta `validate` antes de subir; habría que recalcular las constantes.
5. E2E-03 usa un rango de duración porque cada navegador puede recortar el retardo del codificador de forma distinta.
6. Resuelto (DEC-44, BE-CLP-03): el backend valida el tamano y los 5 offsets intermedios de cualquier intento, un fallo de formato no consume el ticket y la lectura invalida se expulsa de la cache (la siguiente peticion relee del almacen).

### 0.3 Rediseño visual (DEC-46, rama `feature/rediseno-ui`)

Prevalece sobre las filas anteriores con el mismo ID. El comportamiento no cambia salvo: el botón rojo PAUSA y REANUDA de verdad (`ClipPlayer.pause()`; `play()` continúa desde el offset con `start(t0, offset)` y fundido recalculado; el punto de reanudación vuelve a 0 al acabar el fragmento o cambiar de intento; antes reiniciaba); la fila actual del historial dice "Escuchando N s…" (antes "Intento N"); en listas el juego sale sin el prefijo "Pokémon "; el botón del modo libre se ve "Libre" con nombre accesible "Partida libre".

**Modificados (selectores y textos, sin cambio de intención):**

| ID | Cambio |
|---|---|
| E2E-01, 02, 04, 05, 06, 08, 10..12, 16, 31, 38, 43, 49, 55, 58, 59, 61, 73, 75 | Resultado: región "Resultado" y título en `<h2>` en mayúsculas ("¡ACERTASTE EN EL INTENTO n!" / "¡LA CANCIÓN SE ESCAPÓ!"); la canción revelada va en `.font-display`. Filas del historial: "Escuchando N s…" en vez de "Intento N" |
| E2E-04 | Al terminar el historial solo muestra los intentos usados (n filas, no 6) |
| E2E-13..19, 21 | Casillas del filtro con nombre corto ("Game Charlie") y contador al final: el Page Object `gameCheckbox` lo resuelve a partir del nombre completo |
| E2E-20 | La opción del buscador muestra el juego sin prefijo ("Game Bravo") |
| E2E-39 | Colores del tema: oscuro `rgb(20,21,24)` / `rgb(236,234,228)`; claro `rgb(236,234,228)` / `rgb(23,24,27)` |
| E2E-42 | Repetir el clip: play mientras suena pausa, así que se espera a que termine (`data-playing=false`) antes de cada repetición; tras acabar, la repetición empieza desde 0 |
| E2E-53 | Fondo oscuro `rgb(20,21,24)` |
| E2E-79 | Nombre accesible del botón (`Reproducir N s` o `Reanudar` si la interrupción lo deja con posición > 0) en vez de texto |

**Nuevos:**

| ID | Nivel | Descripción | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|
| E2E-80 | e2e | Forma de onda: en cada uno de los 6 intentos hay 48 barras; las `3·N` primeras (audio desbloqueado) tienen altura de datos reales y las restantes son planas (12 %); sin saltar no se pide ni cambia nada posterior al corte | Onda solo con audio desbloqueado | DEC-46, CA-1 | A |
| E2E-81 | e2e | Play/pausa real: el botón pasa de "Reproducir N s" a "Pausar" y, en pausa con posición > 0, a "Reanudar" ("Reproducir N s" con posición 0, al acabar el fragmento o al cambiar de intento); pausar detiene la fuente y mantiene la posición; reanudar arranca `start(t0, offset)` con el offset de la pausa (no 0) y la barra continúa desde ahí; al acabar el fragmento la barra queda al final pero la siguiente reproducción empieza en offset 0; cambiar de intento deja la posición en 0 | Pausa sin reinicio | DEC-46, DEC-45 | A |
| E2E-84 | e2e | Fuentes alojadas (`@fontsource`): ninguna petición a `fonts.googleapis.com` ni `fonts.gstatic.com` al cargar y cambiar de modo, ni `<link>` a Google Fonts | 0 peticiones | DEC-46 | A |
| E2E-82 | e2e | Modo oscuro con `emulateMedia({colorScheme})` en caliente: fondo y carcasa cambian; contraste ≥ 4,5:1 en texto, botón Saltar y buscador, en claro y oscuro | Legible en ambos | DEC-46, RQ §6 | A |
| E2E-83 | e2e | Layout a 375 y 1440 px: sin scroll horizontal (también con el desplegable abierto y en modo libre), controles ≥ 44 px dentro del viewport; en escritorio leyenda visible e historial a la derecha del reproductor; en móvil leyenda oculta e historial debajo | Layout correcto | DEC-46, CA-8 | A |

### 0.4 Burbuja de juego en el buscador, pistas, consolas y un juego por canción (DEC-49 a DEC-53)

Prevalece sobre las filas anteriores con el mismo ID. Fuentes: REQUISITOS.md §3, criterios 9 y 10, §9; ARQUITECTURA.md DEC-48 a DEC-53, §5 (`GameView`), §6, §6.1, §7 y §11.

Referencia (DEC-50/51/53):
- `GameView.hints: Array<AttemptHint | null>`, misma longitud que `results`; `null` en skip y en hit. `AttemptHint = { console: { label, match } | null, order: 'earlier' | 'later' | null }`.
- `order` describe el juego de la BUSCADA respecto al de la elegida; `null` si es el mismo juego.
- Consola: `match = consoles(elegida) ∩ consoles(buscada) ≠ ∅`; `label` = primera consola común en orden canónico `CONSOLES = ['GB','GBC','GBA','DS','3DS','Switch','Switch 2']`, o la primera consola de la ELEGIDA si no hay coincidencia. Z-A = `['Switch','Switch 2']`.
- Una canción = exactamente un juego. `Game.consoles` es opcional en `shared` y obligatorio en `validate`/`upload` para juegos con canciones activas.

**Retirados** (el ID no se reutiliza): BE-ENG-04 y BE-ENG-05 (canciones con varios juegos; lo cubre BE-ENG-02), BE-CAT-02 (canción multi-juego en el pool; sustituido por SH-CAT-08/12), AD-PAT-06 (`games` con ids repetidos; ver AD-PAT-04/07), FE-SRC-06 (canción multi-juego una vez), E2E-19 (juego compartido por canción multi-juego; lo cubre E2E-17).

**Modificados — shared, backend, admin y UI del admin**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-CAT-01 | unit | Catálogo válido mínimo y `catalog.example.json`, cada canción con UN juego y cada juego con `consoles` válidas en orden canónico | - | Sin errores | AR §6, DEC-51, DEC-53 | A |
| SH-CAT-08 | unit | `games` de una canción con 0 elementos y con 2 o más (distintos o repetidos) | - | Error en cada caso que nombra la canción y dice "exactamente un juego" | DEC-26, DEC-53 | A |
| SH-CAT-12 | unit | `games: ["a","a"]` y `games: ["a","b"]` | - | Error en ambos | DEC-53 | M |
| BE-CAT-01 | unit | Pool = canciones `enabled:true` cuyo único juego está en el filtro; deshabilitadas fuera | Deshabilitadas y juegos distintos | Correcto | DEC-10, DEC-53 | A |
| BE-CAT-06 | unit (int) | `GET /catalog`: por canción solo `id,title,games` (un id); juegos `{id,name}` (más `consoles` solo si la implementación las expone; el test documenta cuál); sin `clipKey,startSec,enabled,reviewed,source,youtubeId,videoTitle,durationSec,selectionGroup`; sin `hints`; sin canciones deshabilitadas | Catálogo con `source.youtubeId`, `durationSec` y `consoles` | Cumple; ningún `youtubeId` en el JSON | DEC-11, DEC-41, CA-1 | A |
| BE-ENG-03 | unit | Fallo con juego correcto: elegida distinta pero del MISMO juego | Objetivo y elegida de un mismo juego | `G` -> `game` | CA-3, DEC-53 | A |
| BE-LEAK-06 | unit (int) | Diario (dos fechas) e ilimitado (dos objetivos). Claves de `GameView`: `token,mode,date?,status,attempt,maxAttempts,clipSeconds,results,guesses,hints,clipUrl?,solution?`; `hints` con la longitud de `results` | - | Cero coincidencias; claves exactas | CA-1, DEC-50 | A |
| AD-CAT-01 | unit (int) | Respuesta: `games[{id,name,consoles?,songCount}]` y `songs[AdminSong]` con `durationSec`, `tooShort`, `hasSource`, `errors` | Fixture de 5 canciones | Campos y tipos correctos | AR §6.1, DEC-51 | A |
| AD-PAT-04 | unit (int) | `games` con exactamente un juego existente | - | Guardado | DEC-53 | A |
| AD-PAT-07 | unit (int) | `games: []` y `games` con 2 o más juegos | - | 400 `VALIDATION_ERROR` sin cambios (si se permite `[]` para dejar la canción pendiente, documentarlo y marcarlo en `errors`) | DEC-26, DEC-53 | M |
| AD-PAT-19 | unit (int) | Activar una canción con `games: []` o con 2 juegos (importada a mano) | - | Comportamiento definido y documentado (409/400, o permitido con `errors` visible y `validate` fallando) | DEC-26, DEC-53 | M |
| AU-FIL-01 | unit | Filtro por juego | Catálogo cliente | Canciones de ese juego | AR §6.1, DEC-53 | A |
| AU-UI-08 | unit | Editar el juego de una canción con selección ÚNICA; envía `PATCH {games:[id]}`; solo ofrece juegos existentes | - | Correcto | DEC-53 | A |
| AU-UI-09 | unit | Crear juego: `POST /api/games {name}`; aparece sin consolas y con la marca "Sin consola"; nombre vacío o duplicado muestra error | - | Correcto | DEC-39, DEC-51 | A |

**Modificados — frontend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-SRC-02 | unit | Búsqueda por nombre de juego ("ruby"): el grupo "Juegos" lista ese juego y "Canciones" todas sus canciones | `mkCatalog()` | Ambos grupos correctos | DEC-17, DEC-49 | A |
| FE-SRC-04 | unit | Se busca sobre TODO el catálogo, también juegos y canciones fuera del filtro del modo libre | Filtro libre = {A}; canción y juego de B | Aparecen | DEC-17, DEC-49 | A |
| FE-SRC-05 | unit | Cada opción de canción muestra el título y su ÚNICO juego | - | Visible | DEC-17, DEC-53 | M |
| FE-SRC-17 | unit | ↓ sin activa va a la primera y ↑ a la última, con vuelta, recorriendo ambos grupos como una sola lista; la activa se desplaza a la vista | Búsqueda con juegos y canciones | Juegos y luego canciones; scroll correcto | RQ §6, DEC-49 | M |
| FE-SRC-18 | unit | Sin límite: 60 canciones coincidentes -> 60 opciones de canción; sin aviso "y N más" | Catálogo de 60 canciones | Todas visibles | DEC-48 | M |
| FE-NOF-03 | unit | Tras partidas completas, las únicas claves `heardle:` son `filter`, `settings` (solo si se abrió el panel), `daily:<fecha>` y `unlimited` (en curso); ninguna `stats:*` ni clave por la burbuja | Storage vacío | Conjunto exacto | DEC-43, DEC-49, DEC-52 | A |

**Modificados — E2E**

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-20 | e2e | Buscador | Buscar por título y por juego: grupos "Juegos" y "Canciones" (el vacío no se pinta); elegir una canción envía el intento | Catálogo R | Grupos y orden correctos | DEC-17, DEC-49 | A |
| E2E-21 | e2e | Buscador | Con filtro libre {A}, el buscador ofrece juegos y canciones de B; en diario, todo el catálogo | Catálogo R | Lista completa | DEC-17, DEC-49 | A |
| E2E-26 | e2e | Fuga | Antes de terminar, en `/api/games*`, clips, token, storage, DOM y bundle: ni `clipKey`, `startSec`, `source`, fichero, `videoTitle`, `durationSec`, `youtubeId` ni el id y NOMBRE del juego de la objetivo (salvo `/api/catalog`, el desplegable y `guesses` propias), con las pistas activadas y desactivadas | Juego objetivo con id y nombre únicos | Cero coincidencias fuera de lo legítimo | CA-1, DEC-41, DEC-50 | A |
| E2E-73 | e2e | Estado | Diario ganado e ilimitado perdido: sin compartir ni estadísticas; `localStorage` solo con `filter`, `settings` (si se tocó), `daily:<fecha>` y `unlimited` en curso; recargar el diario no lo repite | Catálogo M y R | Correcto | DEC-43, DEC-52, CL | A |

**Nuevos — shared**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-CON-01 | unit | `CONSOLES` exacto y en orden: `['GB','GBC','GBA','DS','3DS','Switch','Switch 2']` | - | Igual | DEC-50 | A |
| SH-CON-02 | unit | El tipo `ConsoleName` admite exactamente esos 7 valores (`expectTypeOf`) | - | Coincide | DEC-50 | M |
| SH-CON-03 | unit | Un único origen: backend, script, admin-ui y frontend importan `CONSOLES` de `shared/rules` | Análisis estático | Sin literales duplicados | DEC-50, DEC-12 | M |
| SH-CAT-22 | unit | `Game.consoles` ausente es válido en `shared` | - | Sin error | DEC-51 | A |
| SH-CAT-23 | unit | `consoles` válida: una (`['GBA']`) o varias en orden canónico (`['Switch','Switch 2']`) | - | Sin error | DEC-51 | A |
| SH-CAT-24 | unit | `consoles: []` | - | Error | DEC-51 | A |
| SH-CAT-25 | unit | Nombre desconocido (`'PS5'`, `'switch'`, `'Switch2'`, `''`) o tipo erróneo (string, número, objeto, `null`) | - | Error que nombra el juego | DEC-51 | A |
| SH-CAT-26 | unit | `consoles` desordenada (`['Switch 2','Switch']`) | - | Error "orden canónico" | DEC-51 | A |
| SH-CAT-27 | unit | `consoles` con repetidos | - | Error | DEC-51 | A |

**Nuevos — script de catálogo**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-CON-01 | unit | `validate` falla si un juego con canciones ACTIVAS no tiene `consoles`; nombra el juego | - | Código != 0 | DEC-51 | A |
| SC-CON-02 | unit | `validate` pasa si el juego sin `consoles` solo tiene canciones desactivadas | - | Código 0 por este motivo | DEC-51 | A |
| SC-CON-03 | unit | `validate` falla con `consoles` vacías, desconocidas, desordenadas o repetidas | Un caso por vuelta | Código != 0 | DEC-51 | A |
| SC-CON-04 | unit | `validate` falla si una canción activa tiene 0 o 2 juegos | - | Código != 0 y nombra la canción | DEC-53 | A |
| SC-CON-05 | unit | `upload` no sube nada si falta alguna consola | S3 simulado | 0 subidas | DEC-51 | A |
| SC-CON-06 | unit | `draft` añade el juego nuevo AL FINAL de `games`, sin `consoles` ni reordenar los existentes | Catálogo con 3 juegos | Posición final; resto intacto | DEC-48, DEC-51 | A |
| SC-CON-07 | unit | `draft` con un título que parseTitle asigna a dos juegos nunca persiste `games.length == 2` sin que `validate` falle (documentar la elección) | Título ambiguo | Correcto | DEC-53, DEC-26 | M |
| SC-CON-08 | unit | `DESARROLLO.md` y el README del script avisan de mover el juego nuevo a su sitio en `games` y asignarle consolas | Documentos | Aviso presente | DEC-48, DEC-51 | B |

**Nuevos — backend: `computeHint` y `buildGameView`** (catálogo de prueba en orden de salida: `rby` GB, `gsc` GBC, `rse` GBA, `bw` DS, `xy` 3DS, `swsh` Switch, `za` Switch + Switch 2; además `sw2only` Switch 2 y `noconsole` sin consolas)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-HNT-01 | unit | Consola coincide: elegida y buscada de `rse` | - | `{label:'GBA', match:true}` | DEC-50, criterio 9 | A |
| BE-HNT-02 | unit | No coincide: elegida `rse`, buscada `bw` | - | `{label:'GBA', match:false}`; el label es de la ELEGIDA | DEC-50 | A |
| BE-HNT-03 | unit | Z-A 1: elegida Z-A, buscada Switch | - | `{label:'Switch', match:true}` | DEC-50 | A |
| BE-HNT-04 | unit | Z-A 2: elegida Z-A, buscada solo Switch 2 | - | `{label:'Switch 2', match:true}` | DEC-50 | A |
| BE-HNT-05 | unit | Z-A 3: elegida Z-A, buscada de otra consola (`rse`, `bw`, `rby`) | - | `{label:'Switch', match:false}` | DEC-50 | A |
| BE-HNT-06 | unit | Z-A 4a: buscada Z-A, elegida Switch | - | `{label:'Switch', match:true}` | DEC-50 | A |
| BE-HNT-07 | unit | Z-A 4b: buscada Z-A, elegida solo Switch 2 | - | `{label:'Switch 2', match:true}` | DEC-50 | A |
| BE-HNT-08 | unit | Z-A contra Z-A | - | `{label:'Switch', match:true}`, `order: null` | DEC-50 | M |
| BE-HNT-09 | unit | Producto cartesiano de juegos: el label nunca es una consola que la elegida no tenga | - | `label` ∈ consolas de la elegida | DEC-50 | A |
| BE-HNT-10 | unit | Elegida o buscada sin `consoles` | `noconsole` | `console: null`; `order` calculado | DEC-50, DEC-51 | A |
| BE-HNT-11 | unit | Fecha: elegida `rse`, buscada `rby` | - | `order: 'earlier'` | DEC-50, DEC-48 | A |
| BE-HNT-12 | unit | Fecha: elegida `rby`, buscada `za` | - | `order: 'later'` | DEC-50 | A |
| BE-HNT-13 | unit | Mismo juego | - | `order: null` | DEC-50 | A |
| BE-HNT-14 | unit | Reordenar `games` invierte las flechas | `games` permutado | `earlier` <-> `later` | DEC-48, DEC-50 | A |
| BE-HNT-15 | unit | Juego fuera de `games` (catálogo corrupto) | - | Sin excepción; `order: null` | DEC-50 | B |
| BE-HNT-16 | unit | `buildGameView`: `hints.length === results.length`; `null` en skip y hit; objeto en miss y game (en game: `match:true`, `order:null`) | Secuencias mixtas | Alineación correcta | DEC-50 | A |
| BE-HNT-17 | unit | Skips intercalados `S,M,S,G,M` con `q=[k1,k2,k3]` | - | `[null,h(k1),null,h(k2),h(k3)]` | DEC-50 | A |
| BE-HNT-18 | unit | 6 fallos -> 6 hints; ganada en el 3.º tras 2 fallos -> `[h,h,null]`; solo skips -> todo `null` | - | Correcto | DEC-50 | A |
| BE-HNT-19 | unit (int) | `POST /games`, `guess`, `skip` y `state` traen siempre `hints`, en diario e ilimitado, y se recuperan tras recarga | - | Presente y estable | DEC-50 | A |
| BE-HNT-20 | unit (int) | El servidor ignora ajustes del cliente en el cuerpo (`settings`, `consoleHint`, `dateHint`, `hints`) | Cuerpos con campos extra | Respuesta idéntica | DEC-31, DEC-52 | M |
| BE-HNT-21 | unit (int) | Cambiar `consoles` en el catálogo y recargarlo cambia las pistas de la misma partida sin invalidar el token | Catálogo recargado | Pistas nuevas, token válido | DEC-50 | M |
| BE-HNT-22 | unit (int) | `AttemptHint` tiene exactamente `console` (`label`,`match`) y `order` | Respuesta real | Claves exactas | DEC-50, criterio 9 | A |
| BE-HNT-23 | unit (int) | El label de una pista roja nunca es una consola de la buscada | Buscada `bw`, elegidas de los demás | Todos los labels rojos ∉ consolas de la buscada | DEC-50 | A |
| BE-HNT-24 | unit (int) | Alcance de lo revelado: una pista verde revela una consola de la buscada y la flecha un lado del orden; nada más (ver BE-LEAK-17..19) | - | Alcance exacto | DEC-50 | M |
| BE-TOK-19 | unit | El token no guarda pistas: claves `v,n,m,d,k,r,q,iat,exp` y longitud constante con 0..6 fallos | - | Mismas claves y longitud | DEC-50, DEC-03 | A |
| BE-CAT-12 | unit (int) | `GET /catalog` devuelve `games` en el orden de `catalog.json` | `games` permutados | Orden idéntico | DEC-48 | A |
| BE-CAT-13 | unit (int) | Una canción con 0 o 2 juegos en el catálogo cargado: `/health` 503 `CATALOG_UNAVAILABLE` | Fixture inválido | 503 | DEC-53 | M |
| BE-LEAK-17 | unit (int) | Partida con 5 fallos y pistas: el id y el nombre del juego objetivo (y subcadenas ≥4) no aparecen en cuerpos ni cabeceras de `/games*` antes del final | Juego objetivo con id y nombre únicos | Cero coincidencias | CA-1, DEC-50, criterio 9 | A |
| BE-LEAK-18 | unit (int) | Igual con pistas verdes (misma consola, Z-A): se revela la consola, no el id ni el nombre del juego | - | Solo `label` y `match` | DEC-50 | A |
| BE-LEAK-19 | unit (int) | Dos objetivos de juegos distintos con la misma secuencia de elegidas: las respuestas solo difieren en `match` y `order` | - | Diferencias limitadas | DEC-50, CA-1 | A |

**Nuevos — admin (`PATCH /api/games/:id`)**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-CON-01 | unit (int) | `PATCH {consoles:['GBA']}` persiste sin cambiar `id` ni `name` | Token correcto | Persistido | DEC-51, DEC-39 | A |
| AD-CON-02 | unit (int) | Entrada desordenada se guarda en orden canónico | - | Orden canónico | DEC-51 | A |
| AD-CON-03 | unit (int) | `[]`, nombre desconocido, repetidos (o normalizados; documentar), no array | - | 400 sin cambios | DEC-51 | A |
| AD-CON-04 | unit (int) | `PATCH {name}` conserva consolas; `PATCH {consoles}` conserva nombre; `{}` -> 400 o no-op documentado | - | Sin pérdida | DEC-51 | A |
| AD-CON-05 | unit (int) | `name` y `consoles` a la vez: atómico | - | Ambos o ninguno | DEC-37, DEC-51 | A |
| AD-CON-06 | unit (int) | Juego inexistente; `id` en el cuerpo | - | 404; `id` ignorado | DEC-39 | M |
| AD-CON-07 | unit (int) | Sin token o con `Host` ajeno | - | 403 | DEC-36 | A |
| AD-CON-08 | unit (int) | `GET /api/catalog` devuelve `consoles`; un juego sin consolas con canciones activas aparece marcado | - | Correcto | DEC-51 | A |
| AD-CON-09 | unit (int) | `['Switch','Switch 2']` y `['Switch 2']` se aceptan | - | Persistido | DEC-51 | M |
| AD-CAT-09 | unit (int) | `errors` de la canción incluye "exactamente un juego" con 0 o 2 juegos | Catálogo tolerante | Mensaje correcto | DEC-53 | A |

**Nuevos — UI del admin**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AU-CON-01 | unit | 7 casillas de consola por juego marcadas según `consoles` | API simulada | Estado correcto | DEC-51 | A |
| AU-CON-02 | unit | Guardar envía `PATCH {consoles}` en orden canónico sin importar el orden de clic | - | Cuerpo canónico | DEC-51 | A |
| AU-CON-03 | unit | Desmarcar todas bloquea el guardado o muestra error; nunca envía `[]` | - | Correcto | DEC-51 | A |
| AU-CON-04 | unit | Juego sin consolas con canciones activas muestra "Sin consola" y se filtra con "con errores" | - | Marca visible | DEC-51 | M |
| AU-CON-05 | unit | Error 400 al guardar: mensaje y casillas revertidas | Mock 400 | Revertido | DEC-51 | M |
| AU-CON-06 | unit | Z-A con ambas marcadas se guarda `['Switch','Switch 2']`; casillas con etiqueta accesible | - | Correcto | DEC-51 | M |
| AU-CON-07 | unit | La UI no ofrece borrar, fusionar ni reordenar juegos | - | Ausentes | DEC-48 | M |

**Nuevos — frontend: búsqueda (`searchCatalog`)**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-SRC-19 | unit | `searchCatalog(catalog, query, null)` devuelve `{games, songs}`; juegos en el orden de `catalog.games` y canciones en el del catálogo | `mkCatalog()` | Ambos grupos ordenados | DEC-17, DEC-48, DEC-49 | A |
| FE-SRC-20 | unit | Sin burbuja y texto vacío o solo espacios | - | `{games:[], songs:[]}` | DEC-49 | A |
| FE-SRC-21 | unit | Con burbuja y texto vacío: todas las canciones del juego | Juego con 200 canciones | 200 | DEC-49, DEC-48 | A |
| FE-SRC-22 | unit | Con burbuja y texto: solo canciones de ese juego que cumplen el texto | "town" con burbuja Ruby | Solo Ruby | DEC-49 | A |
| FE-SRC-23 | unit | Con burbuja, "Juegos" sigue ofreciendo juegos que coinciden (para sustituirla) | Burbuja Ruby, texto "diamond" | Incluye Diamond/Pearl | DEC-49 | M |
| FE-SRC-24 | unit | `gameId` inexistente o nulo: sin excepción; inexistente -> `songs: []` | - | Seguro | DEC-49 | M |
| FE-SRC-25 | unit | Sin acentos ni mayúsculas en "Juegos"; caracteres de regex literales | - | Coincide sin excepción | DEC-17 | M |
| FE-SRC-26 | unit | Función pura que no lee el filtro del modo libre | `Object.freeze` | Sin mutación | DEC-49 | A |
| FE-SRC-27 | unit | Las canciones intentadas siguen en `songs`, también con burbuja | `guesses=[x]` | Presente | DEC-18, DEC-49 | A |
| FE-SRC-28 | unit | 1500 canciones con y sin burbuja | Dataset | < 50 ms | DEC-49 | B |

**Nuevos — frontend: combobox con grupos y burbuja**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-CMB-01 | unit | Input `role="combobox"`, `aria-expanded` coherente, `aria-controls` al `listbox` | - | Atributos correctos | DEC-49, RQ §6 | A |
| FE-CMB-02 | unit | Dos `role="group"` con `aria-labelledby` a "Juegos" y "Canciones"; un grupo vacío no se pinta | - | Estructura correcta | DEC-49 | A |
| FE-CMB-03 | unit | Opciones `role="option"`; la activa `aria-selected="true"` y `aria-activedescendant` en el input | - | Correcto | DEC-49 | A |
| FE-CMB-04 | unit | Canciones intentadas `aria-disabled="true"`, no elegibles | `guesses=[x]` | Sin petición | DEC-18, DEC-49 | A |
| FE-CMB-05 | unit | Flechas recorren ambos grupos como una lista con vuelta | - | Orden correcto | DEC-49 | A |
| FE-CMB-06 | unit | Enter sobre un juego: vacía el texto, pone la burbuja, foco en el input, lista sus canciones | - | Correcto | DEC-49 | A |
| FE-CMB-07 | unit | Enter sobre una canción envía `{token,songId}` | Spy | Cuerpo exacto | DEC-17, DEC-49 | A |
| FE-CMB-08 | unit | Escape: con lista abierta la cierra; cerrada, vacía el texto; nunca quita la burbuja | - | Correcto | DEC-49 | A |
| FE-CMB-09 | unit | Backspace con input vacío quita la burbuja; con texto edita; sin burbuja nada; no durante IME | - | Según caso | DEC-49 | A |
| FE-CMB-10 | unit | Burbuja con nombre y `<button aria-label="Quitar filtro de juego: <nombre>">`; clic, Enter o Espacio la quitan y el foco vuelve al input | - | Accesible | DEC-49 | A |
| FE-CMB-11 | unit | `aria-describedby` "Filtrando por <juego>" solo con burbuja | - | Presente/ausente | DEC-49 | A |
| FE-CMB-12 | unit | `aria-live` anuncia "Filtro de juego: <nombre>", "Filtro de juego quitado" y el número de resultados | - | Anunciado | DEC-49 | A |
| FE-CMB-13 | unit | Elegir otro juego sustituye la burbuja | - | Una burbuja | DEC-49 | A |
| FE-CMB-14 | unit | La burbuja se borra al empezar otra partida y no se guarda en `localStorage` | - | Correcto | DEC-49 | A |
| FE-CMB-15 | unit | La burbuja no toca `heardle:filter` ni `FilterPanel`; admite juegos fuera del pool libre | - | Filtro intacto | DEC-49 | A |
| FE-CMB-16 | unit | Clic en una opción no quita el foco del input | - | Foco conservado | DEC-49 | M |
| FE-CMB-17 | unit | 200 canciones: 200 opciones y la activa sigue a `scrollIntoView` | - | Sin truncar | DEC-48, DEC-49 | M |
| FE-CMB-18 | unit | Nombres accesibles en español; tabulación: × (si hay) -> input | - | Correcto | RQ §6 | M |
| FE-CMB-19 | unit | Partida terminada: combobox deshabilitado y burbuja no interactiva | - | Deshabilitado | CA-7 | M |
| FE-CMB-20 | unit | Burbuja y texto sin resultados: mensaje accesible "sin resultados" | - | Mensaje y atributos | DEC-49 | M |

**Nuevos — frontend: panel de ajustes**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-SET-01 | unit | Engranaje con nombre "Ajustes" abre `role="dialog"` `aria-modal="true"` con título | - | Accesible | DEC-52 | A |
| FE-SET-01 [MOD] | unit | El botón de pistas muestra el engranaje y el texto visible "Pistas" (nombre accesible "Pistas"); abre un `role="dialog"` `aria-modal="true"` titulado "Pistas" | - | Accesible | DEC-52 | A |
| FE-SET-02 | unit | Foco atrapado dentro del diálogo | - | Ciclo de foco | DEC-52 | A |
| FE-SET-03 | unit | Escape cierra y el foco vuelve al engranaje | - | Restaurado | DEC-52 | A |
| FE-SET-04 | unit | Dos `role="switch"` "Pista de consola" y "Pista de fecha", desactivados por defecto | Storage vacío | `aria-checked="false"` | DEC-52 | A |
| FE-SET-05 | unit | Cada interruptor cambia con clic, Enter y Espacio, de forma independiente | - | Correcto | DEC-52 | A |
| FE-SET-06 | unit | Se guardan en `heardle:settings` `{consoleHint,dateHint}` y se restauran | - | Persistidos | DEC-52 | A |
| FE-SET-07 | unit | Datos corruptos -> ambas desactivadas sin excepción | Storage con basura | Por defecto | DEC-52 | A |
| FE-SET-08 | unit | Datos parciales: el campo ausente vale `false`; claves extra se ignoran | - | Tolerante | DEC-52 | M |
| FE-SET-09 | unit | `localStorage` no disponible: funcionan en memoria | Mock lanza | Sin excepción | DEC-52 | M |
| FE-SET-10 | unit | Valen en diario e ilimitado y no generan peticiones ni cambian cuerpos | Spy de red | 0 peticiones | DEC-52, DEC-50 | A |
| FE-SET-11 | unit | La limpieza de `stats:*` no borra `heardle:settings` | - | Intacto | DEC-43, DEC-52 | A |
| FE-SET-12 | unit | El panel se abre con partida en curso o terminada sin afectar al reproductor | - | Sin efectos | DEC-52 | M |
| FE-SET-13 | unit | Cerrar con el botón o el fondo deja los ajustes aplicados | - | Aplicados | DEC-52 | M |
| FE-SET-14 | unit | Textos en español; el estado no depende solo del color | - | Correcto | RQ §6 | B |

**Nuevos — frontend: pistas en `AttemptList`**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-HNT-01 | unit | Pistas desactivadas: sin burbujas ni flechas aunque `hints` traiga datos | 3 fallos | Nada visible | DEC-52, criterio 9 | A |
| FE-HNT-02 | unit | Consola activada: burbuja con la consola, verde con ✓ si `match`, roja con ✗ si no | `hints` mixtas | Correcto | DEC-52 | A |
| FE-HNT-03 | unit | `aria-label` "Consola: GBA, coincide" / "no coincide"; icono además del color | - | Correcto | DEC-52, RQ §6 | A |
| FE-HNT-04 | unit | Fecha activada: flecha "La canción buscada es de un juego anterior/posterior"; sin flecha si `order` es `null` | - | Correcto | DEC-52 | A |
| FE-HNT-05 | unit | Skips y acierto sin pistas | - | Correcto | DEC-50 | A |
| FE-HNT-06 | unit | Interruptores independientes | - | Correcto | DEC-52 | A |
| FE-HNT-07 | unit | Activar a mitad de partida pinta también los fallos anteriores sin petición; desactivar las oculta | Misma `GameView` | 0 peticiones | DEC-52, criterio 9 | A |
| FE-HNT-08 | unit | `console: null` no pinta burbuja | - | Sin burbuja | DEC-50, DEC-51 | A |
| FE-HNT-09 | unit | Diario terminado guardado con `hints` y pistas activas: se pintan sin API | Storage sembrado | 0 llamadas | DEC-52, CL | A |
| FE-HNT-10 | unit | Vistas guardadas sin `hints` (versiones anteriores): sin excepción ni pistas | - | Degradación segura | DEC-52 | A |
| FE-HNT-11 | unit | `hints` con longitud distinta de `results` no rompe la lista | - | Sin excepción | DEC-50 | M |
| FE-HNT-12 | unit | Mismas pistas en diario, ilimitado y tras `GAME_OVER`/recarga | - | Igual | DEC-50 | M |
| FE-HNT-13 | unit | Las pistas no alteran el texto accesible del resultado ni el feedback de juego | - | Intactos | CA-3 | M |
| FE-HNT-14 | unit | Desactivadas, las pistas no quedan en el DOM como texto oculto ni en storage fuera de `view` | - | Nada extra | criterio 9 | A |

**Nuevos — E2E**

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-85 | e2e | Buscador | "ruby": grupos "Juegos" y "Canciones"; elegir el juego pone la burbuja con ×, vacía el texto y lista solo ese juego; un título filtra dentro; la × y Backspace la quitan; otro juego la sustituye | Catálogo R con ≥3 juegos | Correcto | DEC-49 | A |
| E2E-86 | e2e | Buscador | Solo teclado: flechas por ambos grupos, Enter (juego -> burbuja; canción -> intento), Escape, Backspace; foco en el input; región `aria-live` anuncia | - | Operable sin ratón | DEC-49, RQ §6 | A |
| E2E-87 | e2e | Buscador | La burbuja no persiste ni toca el filtro libre; desaparece al empezar otra partida | Filtro libre {A}, burbuja B | Correcto | DEC-49 | A |
| E2E-88 | e2e | Buscador | Con burbuja, las intentadas siguen visibles y deshabilitadas; burbuja de un juego fuera del pool | - | Correcto | DEC-18, DEC-49 | A |
| E2E-89 | e2e | Pistas | Sin pistas por defecto; tras dos fallos activar "Pista de consola" las muestra en los anteriores y siguientes; desactivar oculta; recargar conserva el ajuste | Catálogo R con `consoles` | 0 peticiones al cambiar ajustes | DEC-52, criterio 9 | A |
| E2E-90 | e2e | Pistas | "Pista de fecha": flechas correctas con juegos anteriores y posteriores; mismo juego sin flecha; skips sin nada | Objetivo conocida | Correcto | DEC-50, DEC-52 | A |
| E2E-91 | e2e | Pistas | Las 4 reglas de Z-A en el navegador | Juegos GBA, Switch, Switch 2 y Z-A | Etiqueta y color correctos | DEC-50 | A |
| E2E-92 | e2e | Fuga | Con pistas activadas y desactivadas, `/api/games*` trae `hints` con claves exactas y nada revela el id ni el nombre del juego objetivo hasta terminar | Catálogo R | Cero coincidencias | criterio 9, DEC-50 | A |
| E2E-93 | e2e | Pistas | Diario terminado y reabierto con pistas activas: se ven sin peticiones | - | 0 peticiones | DEC-52, CL | A |
| E2E-94 | e2e | Accesibilidad | Ajustes: foco atrapado, Escape devuelve el foco, interruptores con teclado; buscador con grupos sin violaciones graves (axe si está disponible, si no por roles) | Chromium | Sin violaciones graves | DEC-49, DEC-52 | M |
| E2E-95 | e2e | Móvil/oscuro | 375 px claro/oscuro: burbuja con nombre largo sin desbordar; burbujas de consola y flecha con contraste ≥ 4,5:1 e iconos; engranaje ≥ 44 px | Viewport móvil | Correcto | DEC-52, RQ §6 | A |
| E2E-96 | e2e | Admin | Editar consolas (Switch 2 y luego Switch) guarda `['Switch','Switch 2']` en el catálogo temporal; "Sin consola" visible; juego de canción de selección única | Fixture del admin | Correcto | DEC-51, DEC-53 | A |
| E2E-97 | e2e | Catálogo | Un juego sin consolas hace fallar `validate`; tras asignarlas en el admin pasa; `upload` simulado no sube antes de corregir | Fixture | Flujo corregible | DEC-51 | M |

Fixtures: los catálogos `R` y `M` y los del backend necesitan `consoles` en cada juego, al menos tres juegos con orden conocido, un Z-A (`['Switch','Switch 2']`), un juego de solo Switch 2 y un solo juego por canción (se elimina la canción "multi-juego A+B"). Afecta a E2E-17..22, 45 y 85..96.

**Matriz §5:** "Feedback parcial" pasa a "un juego por canción, DEC-53" = BE-ENG-02/03, FE-GAM-06, E2E-17/18; nuevas filas "Buscador con burbuja (DEC-49)" = SH-SRC-*, FE-SRC-02/04/05/17..28, FE-CMB-01..20, E2E-20/21/85..88/94/95; "Pistas (DEC-50..52, criterio 9)" = SH-CON-01..03, BE-HNT-01..24, BE-TOK-19, BE-LEAK-17..19, FE-SET-01..14, FE-HNT-01..14, E2E-26/89..95; "Consolas y un juego por canción (DEC-51/53)" = SH-CAT-01/08/12/22..27, SC-CON-01..08, AD-CON-01..09, AD-CAT-01/09, AD-PAT-04/07/19, AU-CON-01..07, AU-UI-08/09, BE-CAT-06/12/13, E2E-96/97; "Orden de juegos (DEC-48)" += BE-CAT-12, BE-HNT-14, FE-SRC-19; "CA-1" += BE-LEAK-17..19, E2E-92.

**Riesgos y ambigüedades:**
1. Limitación aceptada (DEC-50): las pistas viajan siempre aunque estén desactivadas en el cliente; una verde revela una consola de la buscada y la flecha un lado del orden. Un fallo `game` ya revela el juego (comportamiento previo, CA-3).
2. `validate` no detecta un juego mal colocado en `games` (flechas erróneas): revisión manual al añadir juegos (`CLAUDE.md` del proyecto).
3. A resolver por el desarrollador y documentar en el test: si `/catalog` expone `consoles`; si `PATCH /api/songs/:id` admite `games: []`; si `PATCH /api/games/:id` normaliza consolas repetidas; qué hace `draft` con un título asignable a dos juegos; si "Juegos" sigue visible con burbuja (se asume que sí); si el diálogo se cierra con clic en el fondo.
4. Los datos reales (consolas, un juego por canción) se comprueban con `validate` sobre una copia de `scripts/catalog/data`, nunca sobre el original.
5. Foco del diálogo y lectura del combobox con VoiceOver: verificación manual en iPhone.

### 0.5 Selección equiprobable por grupo (DEC-54)

Prevalece sobre las filas anteriores con el mismo ID. Fuentes: ARQUITECTURA DEC-09 (v2), DEC-10, DEC-20, DEC-54; REQUISITOS §3 y §9.

Referencia:
- `h = HMAC-SHA256(DAILY_SEED, "daily|v2|"+fecha)`. Grupo = `h.readUIntBE(0,6) % grupos.length`, con `grupos` = grupos de selección con alguna canción `enabled`, ordenados por id del grupo (no por su posición en `catalog.games`). Canción = `h.readUIntBE(6,6) % canciones.length`, con `canciones` = las `enabled` de todos los juegos del grupo, por `song.id`.
- Grupo de un juego = `selectionGroup` o, si falta, su propio id. Black/White + Black 2/White 2 y Sun/Moon + Ultra Sun/Ultra Moon forman grupo.
- Libre: grupo al azar (`randomInt`) entre los grupos con algún juego filtrado con canciones activas; luego canción al azar entre las activas de los juegos filtrados de ese grupo, por `id`.
- Probabilidad de una canción: `1 / (grupos × canciones_de_su_grupo)`. Filtro, pistas y feedback siguen siendo por juego.

**Retirado:** BE-DAY-17 (365 días cubren todas las canciones; lo sustituyen BE-SEL-03..05).

**Modificados**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-DAY-03 | unit | La selección diaria usa las canciones `enabled` agrupadas por grupo de selección; las desactivadas nunca salen ni cuentan | 3 grupos y deshabilitadas | Ninguna deshabilitada; en 120 fechas salen los 3 grupos | CA-4, DEC-09, DEC-54 | A |
| BE-DAY-05 | unit | Vector independiente: `"daily|v2|"+fecha`; bytes 0-5 BE `% nGrupos`; bytes 6-11 BE `% nCanciones del grupo` | Semilla y fecha fijas; grupos de 1, 5 y 40 | Coincide; con `v1` no | DEC-09, DEC-54 | A |
| BE-DAY-06 [MOD] | unit | Grupos por id del grupo; canciones por `id`. Barajar `songs` no cambia el resultado y reordenar `games` tampoco. Motivo: insertar un juego en su sitio de `games` no debe cambiar la canción del día | `songs` barajado y `games` reordenado | Misma canción; reproducible contra el vector | DEC-09, DEC-20, DEC-48 | A |
| BE-DAY-07 | unit | Un solo juego con una sola canción activa | - | Siempre esa; sin dividir por cero | DEC-09 | A |
| BE-DAY-18 | unit | Libre con `randomInt` inyectado: `randomInt(nGrupos)` y después `randomInt(nCanciones del grupo)`; nunca `randomInt(0)` | `randomInt` espiado | Llamadas y rangos exactos | DEC-10, DEC-20, DEC-54 | A |
| BE-CAT-01 | unit | Candidatos del modo libre = canciones `enabled` de juegos filtrados, agrupadas; un grupo cuenta solo con algún juego filtrado con activas | Filtro {B2W2}, grupo BW+B2W2 | El grupo aporta solo canciones de B2W2 | DEC-10, DEC-54 | A |

**Nuevos — backend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-SEL-01 | unit | Determinismo: misma fecha y semilla -> misma canción, también tras barajar `songs` y reconstruir el índice | - | Siempre la misma | CA-4, DEC-09 | A |
| BE-SEL-02 | unit | `v2` difiere de la selección `v1` en al menos el 50 % de 365 fechas; el código no usa `v1` | 3 grupos desiguales | Diferencias; sin `daily|v1|` fuera de tests | DEC-09, DEC-54 | A |
| BE-SEL-03 | unit | Diario uniforme por grupo: grupos de 1, 10 y 100 canciones en 3000 fechas generadas | Semilla fija | Cada grupo 33,3 % ± 3 puntos | DEC-54, CA-4 | A |
| BE-SEL-04 | unit | Dentro de un grupo de 10 canciones la canción es uniforme | ≥ 3000 fechas con ese grupo | Cada una 10 % ± 3; ninguna con 0 | DEC-54 | A |
| BE-SEL-05 | unit | Probabilidad `1/(grupos×canciones)`: canción de grupo de 1 ≈ 1/3; de grupo de 100 ≈ 1/300 | Muestreo de BE-SEL-03 | Dentro de tolerancia | DEC-54 | M |
| BE-SEL-06 | unit | Grupo sin canciones activas: nunca sale y no cuenta en `nGrupos` | - | Correcto | DEC-54 | A |
| BE-SEL-07 | unit | Activar o desactivar una canción cambia el tamaño del grupo; desactivar todas reduce `nGrupos` | Antes/después | Reproducible contra el vector | DEC-09, DEC-54 | M |
| BE-SEL-08 | unit | Grupo de dos juegos pesa como uno: {BW+B2W2 con 30+10, X con 5} | 3000 fechas | BW+B2W2 ≈ 50 %, X ≈ 50 %; dentro, cada canción ≈ 1/40 | DEC-54 | A |
| BE-SEL-09 | unit | Grupo de dos juegos con uno sin activas aporta solo las del otro y sigue pesando uno; sin activas en ambos desaparece | Tres variantes | Correcto | DEC-54 | A |
| BE-SEL-10 | unit | Sin `selectionGroup` cada juego es su grupo (equivale a `selectionGroup = su id`) | Catálogos equivalentes | Misma selección | DEC-54 | A |
| BE-SEL-11 [MOD] | unit | Orden de grupos por id del grupo, no por posición en `games`: `games = [X, B2W2 (grupo BW), BW]` -> grupo BW en 0, X en 1, y invertir `games` no cambia la canción. Motivo: igual que BE-DAY-06 | - | Orden estable | DEC-09 | A |
| BE-SEL-12 | unit | Un solo grupo con varias canciones, y un solo juego con una canción | - | Funciona | DEC-54 | M |
| BE-SEL-13 | unit | Libre: solo cuentan grupos con juegos filtrados; los juegos no filtrados del grupo no aportan | Filtro {SM}, grupo SM+USUM | Solo SM; el grupo pesa 1 | DEC-10, DEC-54 | A |
| BE-SEL-14 | unit | Libre con filtro de un juego: canción uniforme entre las suyas (documentar si se llama a `randomInt(1)` o se omite) | Filtro {A} | Correcto | DEC-10, DEC-54 | A |
| BE-SEL-15 | unit | Libre con dos grupos desiguales: 3000 sorteos con generador con semilla inyectado | Filtro {A (1 canción), B (50)} | A ≈ 50 %, B ≈ 50 % (± 3) | DEC-54 | A |
| BE-SEL-16 | unit | Recorrer todos los pares `(g,s)` de `randomInt` | Catálogo pequeño | Cada candidata exactamente una vez | DEC-20, DEC-54 | A |
| BE-SEL-17 | unit (int) | Juegos filtrados sin activas se ignoran; si ninguno tiene activas -> 400 `EMPTY_FILTER` | - | Correcto | CA-5, DEC-10 | A |
| BE-SEL-18 | unit (int) | Feedback por juego dentro de un grupo: elegida de B2W2 con buscada de BW -> `miss` | Grupo BW+B2W2 | `M` | DEC-17, DEC-54 | A |
| BE-SEL-19 | unit (int) | `selectionGroup` no aparece en el token, `GameView` ni `/catalog` | - | Ausente | DEC-54, DEC-11 | A |
| BE-SEL-20 | unit (int) | Dos `POST /games daily` el mismo día con grupos: misma solución | Reloj fijo | Misma canción | CA-4, DEC-54 | A |
| BE-SEL-21 | unit (int) | Cambio de `v1` a `v2`: una partida diaria ya empezada conserva su canción; una nueva sigue `v2` | Token antiguo | Correcto | DEC-54 | M |
| BE-SEL-22 | unit | `selectionGroup` hacia un juego inexistente (catálogo que se salta el validador): 503 `CATALOG_UNAVAILABLE`, sin grupo nuevo | Catálogo inválido | 503 | DEC-54 | M |

**Nuevos — shared (validador de `selectionGroup`)**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-CAT-28 | unit | `selectionGroup` ausente es válido | - | Sin error | DEC-54 | A |
| SH-CAT-29 | unit | `selectionGroup` = id de un juego cabeza (B2W2 -> BW) | - | Sin error | DEC-54 | A |
| SH-CAT-30 | unit | Apunta a un id inexistente | - | Error que nombra juego e id | DEC-54 | A |
| SH-CAT-31 | unit | Cadena C -> B -> A | - | Error en C | DEC-54 | A |
| SH-CAT-32 | unit | Ciclo A -> B -> A | - | Error | DEC-54 | A |
| SH-CAT-33 | unit | Autorreferencia | - | Válido (equivale a ausente) | DEC-54 | M |
| SH-CAT-34 | unit | Tipo inválido: vacío, número, `null`, array, objeto, id mal formado | - | Error en cada uno | DEC-54, DEC-29 | A |
| SH-CAT-35 | unit | Un juego cabeza de otros no puede pasar a miembro de otro grupo | - | Error | DEC-54 | A |
| SH-CAT-36 | unit | Grupo cuyo juego cabeza no tiene canciones activas sigue siendo válido | - | Sin error | DEC-54 | M |

**Nuevos — script de catálogo**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-DR-11 | unit | `draft` añade el juego nuevo al final, sin `selectionGroup` ni `consoles`, y no toca orden ni campos de los existentes | Catálogo con ambos campos | Intactos | DEC-48, DEC-51, DEC-54 | A |
| SC-VA-10 | unit | `validate` falla con `selectionGroup` inválido y pasa con grupos correctos | Catálogo sintético | Código != 0 / 0 | DEC-54 | A |
| SC-CS-13 | unit | `catalogStore.update` conserva `selectionGroup`, `consoles` y el orden de `games` | - | Idénticos | DEC-37, DEC-54 | M |

**Nuevos — admin**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-SEL-01 | unit (int) | `PATCH /api/games/:id {selectionGroup}` válido persiste | Token | 200 y disco actualizado | DEC-54, AR §6.1 | A |
| AD-SEL-02 | unit (int) | Grupo inexistente | - | 400 sin cambios | DEC-54 | A |
| AD-SEL-03 | unit (int) | Destino no cabeza o que crea ciclo | - | 400 sin cambios | DEC-54 | A |
| AD-SEL-04 | unit (int) | Un juego cabeza de otros no puede pasar a miembro | - | 400 sin cambios | DEC-54 | A |
| AD-SEL-05 | unit (int) | Quitar el grupo (`null` o el propio id) lo devuelve a su propio grupo (documentar cómo queda el JSON) | - | Estado válido | DEC-54 | A |
| AD-SEL-06 | unit (int) | `{name, selectionGroup inválido}`: atómico | - | 400 sin cambiar el nombre | DEC-37, DEC-54 | A |
| AD-SEL-07 | unit (int) | `GET /api/catalog` devuelve el grupo efectivo de cada juego | - | Correcto | AR §6.1 | M |
| AD-SEL-08 | unit (int) | Sin token -> 403; `id` del cuerpo ignorado | - | Correcto | DEC-36, DEC-39 | A |
| AD-SEL-09 | unit (int) | `selectionGroup` no afecta a `songCount` ni a la lista de juegos | - | Igual | AR §6.1 | B |
| AU-SEL-01 | unit | Desplegable "Grupo de selección" con "Su propio grupo" y los juegos cabeza | - | Opciones correctas | DEC-54 | A |
| AU-SEL-02 | unit | No ofrece el propio juego ni miembros de otros grupos; un juego cabeza no puede unirse a otro grupo | - | Opciones filtradas | DEC-54 | A |
| AU-SEL-03 | unit | Elegir un grupo envía `PATCH {selectionGroup}`; "Su propio grupo" lo quita | `fetch` simulado | Cuerpo correcto | DEC-54 | A |
| AU-SEL-04 | unit | Error 400: mensaje y valor revertido | Mock 400 | Revertido | DEC-54 | A |
| AU-SEL-05 | unit | Tras cada cambio refleja el estado real del servidor | - | Coherente | AR §6.1 | M |

**Nuevos — frontend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-GRP-01 | unit | `FilterPanel` muestra BW y B2W2 como casillas independientes | Catálogo público | Dos casillas | DEC-54, CA-5 | A |
| FE-GRP-02 | unit | El buscador lista BW y B2W2 como juegos separados | - | Correcto | DEC-49, DEC-54 | A |
| FE-GRP-03 | unit | El cliente no recibe ni usa `selectionGroup` | Tipos y peticiones | Ausente | DEC-54, DEC-11 | M |

**Nuevos — E2E**

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-98 | e2e | Selección | Diario con grupos desiguales: la misma solución en dos contextos el mismo día y coincide con el vector `v2` | Semilla y fecha fijas | Correcto | CA-4, DEC-09 | A |
| E2E-99 | e2e | Selección | Libre con BW y B2W2 filtrados: dos casillas; la solución es de uno de ellos | Fixture con grupo | Correcto | DEC-10, DEC-54 | M |
| E2E-100 | e2e | Selección | Elegida de B2W2 con buscada de BW -> juego incorrecto | Filtro {BW} con 1 canción | `miss` | DEC-17, DEC-54 | A |
| E2E-101 | e2e | Admin | Asignar y quitar `selectionGroup` desde la UI persiste en el catálogo temporal; un destino inválido muestra el error | Fixture del admin | Coherente | DEC-54 | M |

**Matriz §5:** nueva fila "DEC-54 selección por grupo" = BE-DAY-03/05/06/07/18, BE-CAT-01, BE-SEL-01..22, SH-CAT-28..36, SC-DR-11, SC-VA-10, SC-CS-13, AD-SEL-01..09, AU-SEL-01..05, FE-GRP-01..03, E2E-98..101; "CA-4" += BE-SEL-01/03/20, E2E-98; quitar BE-DAY-17.

**Notas:** los muestreos (BE-SEL-03/04/08/15) usan semilla fija y fechas generadas, nunca `Math.random`, para no ser intermitentes. A documentar en el test: si con un solo grupo se llama a `randomInt(1)` y cómo queda el JSON al quitar el grupo.

### 0.6 Volumen común del clip y del vídeo (DEC-55)

Prevalece sobre las filas anteriores con el mismo ID. Fuentes: ARQUITECTURA DEC-41 y DEC-55; REQUISITOS §6. Tests en `frontend/src/__tests__/volume.test.tsx`.

**Modificados**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-WA-18 [MOD] | unit | Interfaz pública de `ClipPlayer`: `prepare/play/pause/stop/setVolume/subscribe/dispose` | - | Exactamente esas claves | DEC-45, DEC-46, DEC-55 | M |
| FE-EMB-05 [MOD] | unit | Sin control de volumen (`onVolumeChange` ausente) el `src` es exactamente `https://www.youtube-nocookie.com/embed/<youtubeId>`; con él lleva además `?enablejsapi=1` (FE-VOL-10) | - | URL correcta | DEC-41, DEC-55 | A |
| E2E-56, E2E-57, E2E-61 [MOD] | e2e | El `src` del iframe en la app es `https://www.youtube-nocookie.com/embed/<youtubeId>?enablejsapi=1` | - | URL correcta | DEC-41, DEC-55 | A |

**Nuevos — frontend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-VOL-01 | unit | Sin valor guardado el volumen es 1; `setVolume` guarda en `heardle:volume` y se restaura | Storage vacío | 1 y luego el guardado | DEC-55 | A |
| FE-VOL-02 | unit | Fuera de rango se acota a [0, 1]; un valor guardado no numérico vale 1 | - | Acotado / por defecto | DEC-55 | M |
| FE-VOL-03 | unit | `localStorage` no escribible: el volumen funciona en memoria y `writeFailed` es true | Mock lanza | Sin excepción | DEC-55 | M |
| FE-VOL-04 | unit | El clip (Web Audio) arranca al volumen fijado y el fundido final baja desde él a 0 | `setVolume(0.4)` antes de `play` | Ganancia 0,4 | DEC-45, DEC-55 | A |
| FE-VOL-05 | unit | Cambiar el volumen sonando cancela la programación y la rehace desde `currentTime`, con el fundido final intacto | Sonando | Reprogramado | DEC-55 | A |
| FE-VOL-06 | unit | La pausa funde desde el volumen actual, no desde 1 | Volumen 0,3 | Rampa desde 0,3 | DEC-46, DEC-55 | M |
| FE-VOL-07 | unit | Ruta `<audio>`: aplica `audio.volume`, acotado | Sin Web Audio | `volume` correcto | DEC-55 | M |
| FE-VOL-08 | unit | El reproductor muestra un `slider` "Volumen" con el valor en % y avisa con valores de 0 a 1 | - | Valor y callback | DEC-55 | A |
| FE-VOL-09 | unit | Sin `onVolumeChange` el reproductor no pinta el deslizador | - | Sin slider | DEC-55 | B |
| FE-VOL-10 | unit | Con volumen, el iframe es `youtube-nocookie` con `?enablejsapi=1` | - | URL correcta | DEC-41, DEC-55 | A |
| FE-VOL-11 | unit | Al cargar el iframe manda `{event:"listening"}` y `setVolume` (0..100), siempre con destino `https://www.youtube-nocookie.com` | - | Mensajes y origen correctos | DEC-55 | A |
| FE-VOL-12 | unit | Cambiar el volumen con el vídeo abierto manda el `setVolume` nuevo | - | Orden enviada | DEC-55 | A |
| FE-VOL-13 | unit | Repite el volumen con cada mensaje del reproductor hasta `onReady`; ignora mensajes de otros orígenes | - | Correcto | DEC-55 | A |
| FE-VOL-14 | unit | Bajo el vídeo hay un deslizador "Volumen" con el mismo valor | - | Valor y callback | DEC-55 | A |

**Riesgos:** en iOS `audio.volume` es de solo lectura (solo cuenta la ruta Web Audio) y YouTube puede ignorar `setVolume`; el volumen del sistema sigue mandando. El protocolo `postMessage` del iframe no es API pública documentada (es el que usa el script de la IFrame API): si YouTube lo cambia, el deslizador deja de afectar al vídeo sin romper nada más. Pasada manual en navegador real.

### 0.7 GitHub Pages y Edge Function (DEC-57)

Prevalece sobre las filas anteriores con el mismo ID. Fuente: ARQUITECTURA DEC-57. Express se sustituye por un manejador `Request`/`Response` (`backend/src/http/handler.ts`) servido por Node en los tests: los casos de integración BE-* existentes se mantienen sin cambios y prueban ese manejador.

**Modificados**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| E2E-33 [MOD] | e2e | Arranque lento: el aviso es "Conectando con el servidor…" | `/health` retrasado y 503 x3 | Aviso y recuperación | DEC-14, DEC-57 | A |
| FE (components) [MOD] | unit | Mientras `/health` falla se ve "Conectando con el servidor" | - | Texto nuevo | DEC-14, DEC-57 | M |

**Nuevos — backend**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-CAT-12 | unit (int) | Con `CATALOG_WAIT_MS`, una petición que llega con el catálogo cargando lo espera; si no carga a tiempo, 503 | Store lento / caído | 200 / `CATALOG_UNAVAILABLE` | DEC-57 | A |
| BE-CFG-09 | unit | `STORAGE_DRIVER=supabase` y `RATE_LIMIT_STORE=postgres` exigen `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (y bucket); `CATALOG_WAIT_MS` 0 por defecto | - | Lanza nombrando la variable | DEC-57 | M |
| BE-SQL-01..06 | unit (PGlite) | `heardle_rate_limit_hit`: límite y segundos de espera, claves independientes, cuenta en orden y para en la primera que se pasa, ventana de 60 s, sin permisos para `anon`/`authenticated`, migración reaplicable (`rateLimitSql.test.ts`) | Migración real | Correcto | DEC-13, DEC-57 | A |
| BE-SUP-01..04 | unit | `SupabaseClipStore`: rutas y cabecera `service_role`, catálogo, `clipKey` inválido sin petición, errores → `STORAGE_ERROR` (`supabaseEdge.test.ts`) | `fetch` falso | Correcto | DEC-57 | A |
| BE-SUP-05..07 | unit | `PostgresRateLimiter`: una RPC por petición con las claves en hash, `RATE_LIMITED` con los segundos devueltos, y deja pasar si la base de datos falla | `fetch` falso | Correcto | DEC-57 | A |

**Verificación manual:** la función se prueba en el Supabase local (`npm run edge:local`, DESARROLLO.md) con el frontend compilado contra ella; en producción, los pasos de verificación de DESARROLLO.md (incluida la cabecera de la IP del cliente).

### 0.8 Rediseño "Pokédex completa" (DEC-58)

Prevalece sobre las filas anteriores con el mismo ID. Fuente: ARQUITECTURA DEC-58. El comportamiento, los nombres accesibles y los textos de los controles no cambian; cambian la composición y los colores.

**Modificados**

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-DSN-06 [MOD] | unit | Player: pantalla con "INTENTO n/m", onda y barra; la lente y las luces ya no están en el reproductor (van en `DexTop`, FE-DEX-01) | - | Cumple | DEC-58 | A |
| FE-DSN-09 [MOD] | unit | Resultado: textos y estados como antes; la lente pasa a `DexTop`; el botón de la canción completa es azul y plano (`bg-dex-blue`, sin degradado) | - | Cumple | DEC-58, DEC-41 | A |
| FE-DSN-12 [MOD] | unit | Leyenda "CLAVE" como teclas de la hoja derecha: oculta en móvil y visible desde `lg` | `App` renderizada | `hidden lg:flex` | DEC-58 | M |
| FE-EMB-13 [MOD] | unit | El diario terminado muestra la cuenta atrás (`role="timer"`, `HH:MM:SS`) en lugar de "Vuelve mañana…"; con `showNextDayNote=false` no la pinta el panel | - | Cumple | DEC-58 | A |
| E2E-39 [MOD] | e2e | Mismos colores de página en claro y oscuro: fondo `rgb(27,29,34)`, texto `rgb(233,237,230)` | `colorScheme` dark/light | Iguales | DEC-58 | A |
| E2E-53 [MOD] | e2e | Barra en móvil oscuro: fondo de página `rgb(27,29,34)` | iPhone, dark | Cumple | DEC-58 | M |
| E2E-82 [MOD] | e2e | Mismo aspecto en claro y oscuro (`emulateMedia` en caliente) y contraste ≥ 4,5:1 en texto, "Saltar", botón de reproducir y buscador | - | Iguales y legibles | DEC-58, RQ §6 | A |

**Nuevos — frontend** (`frontend/src/__tests__/Pokedex.test.tsx`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-DEX-01 | unit | `DexTop`: logo h1, subtítulo, lente y tres luces; lente azul en juego, verde al acertar y roja al perder | - | Cumple | DEC-58 | A |
| FE-DEX-02 | unit | `msUntilNextMadridDay`: día normal, segundo en curso, días de 23 y 25 h del cambio de hora; `formatCountdown` `HH:MM:SS`, nunca negativo | Instantes fijos | Cumple | DEC-58 | A |
| FE-DEX-03 | unit | `NextDayCountdown`: descuenta cada segundo y llama a `onExpire` una sola vez al pasar la medianoche | Reloj falso | Cumple | DEC-58 | A |
| FE-DEX-04 | unit | `FilterStart`: sin partida, pantalla con canciones en juego y "Empezar partida"; tras una partida (`compact`), solo botón y resumen; selección vacía: deshabilitado y aviso | - | Cumple | DEC-58 | M |

**Verificación manual:** capturas en 390×844 y 1920×1080 de carga, partida con pistas, buscador abierto, panel de pistas, victoria, derrota y modo libre (antes y después de jugar), y repaso con `armonia-visual`.

### 0.9 Retirada de Render y Vercel (DEC-57)

Prevalece sobre las filas anteriores con el mismo ID. Sin backend Node en producción ni Vercel: se borran `render.yaml`, `frontend/vercel.json` y el driver S3 del backend.

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-STO-04 [RETIRADO] | - | `S3ClipStore` ya no existe; su papel en producción lo cubre `SupabaseClipStore` (BE-SUP-01..04) | - | - | DEC-57 | - |
| BE-CFG-03 [MOD] | unit | `STORAGE_DRIVER=s3` lanza (driver retirado); con `supabase` incompleto el error nombra la variable que falta y nunca muestra la clave | - | Cumple | DEC-57 | A |
| FE-CSP-01 [MOD] | unit | `frontend/index.html` lleva una sola `<meta http-equiv="Content-Security-Policy">` en el `<head>` con valor exactamente `frame-src https://www.youtube-nocookie.com` (GitHub Pages no admite cabeceras) | - | Cumple | DEC-41, DEC-57 | A |
| FE-CSP-02 [MOD] | unit | Esa CSP no incluye `default-src`, `script-src`, `connect-src`, `media-src`, `img-src` ni `style-src` | - | Cumple | DEC-41 | A |
| E2E-59 [MOD] | e2e | La CSP real es la `<meta>` de `index.html` (la sirve Vite tal cual): el embed `youtube-nocookie` no la viola y otro origen sí | - | Cumple | DEC-41, DEC-57 | A |

### 0.10 Reparto de la Pokédex, parpadeo y favicon (DEC-59)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-DEX-01 [MOD] | unit | Además: la lente parpadea solo con `blinking` (capa `.dex-lens-glow`) y la animación se desactiva con `prefers-reduced-motion` | - | Cumple | DEC-59 | M |
| FE-DEX-05 | unit | Controles en la zona `dex-rtop`; reproductor y leyenda en la hoja izquierda; historial y, después, el buscador en la hoja derecha | `App` renderizada | Cumple | DEC-59 | A |
| FE-DEX-06 | unit | Pantalla del buscador: sin texto, aviso en el hueco de resultados; al escribir, la lista está dentro de la pantalla, con scroll propio y sin posición absoluta | - | Cumple | DEC-59 | A |
| E2E-82 [MOD] | e2e | El contraste del buscador se mide contra el primer fondo pintado detrás del texto (la pantalla LCD), no contra el contenedor inmediato | - | ≥ 4,5:1 | DEC-59 | A |
| E2E-39, E2E-53, E2E-82 [MOD] | e2e | Fondo de la página negro puro `rgb(0,0,0)` en claro y oscuro | - | Cumple | DEC-59 | A |
| FE-DEX-04 [MOD] | unit | "Canciones en juego" con mayúscula inicial en la pantalla del modo libre | - | Cumple | DEC-59 | B |
| FE-DEX-08 | unit | Alto estable: hueco fijo para el aviso de selección vacía; tras una partida, aviso y resumen en el mismo hueco; `min-height: 880px` en escritorio; métricas fijas de la fuente del logo | - | Cumple | DEC-59 | A |
| E2E-61 [MOD] | e2e | Tras terminar una partida libre, la lista de juegos está plegada: se abre "Nueva partida" antes de cambiar el filtro | - | Cumple | DEC-59 | M |
| FE-DEX-07 | unit | `index.html` enlaza `/favicon.svg` y el SVG existe en `public/` | - | Cumple | DEC-59 | B |

**Verificación manual:** a 1895×911 y 1920×1080 la Pokédex entera cabe sin scroll con resultados de búsqueda a la vista; captura del favicon a 16, 32, 64 y 128 px.

## 1. Alcance

Dentro:
- Unitarios backend (vitest): `game/token`, `tickets`, `daily`, `engine` (vista y `solution`), `catalog/`, `http/validate`, `rateLimit`, `config`, `storage/LruCache`.
- Integración backend (`createApp` + `listen(0)` + `fetch` + `FsClipStore`), marcada `unit (int)`.
- `shared/` (`catalog.ts` incluido `youtubeId`, `durationSec` y regla de corta, `rules.ts`, `date.ts`).
- Scripts de catálogo sin red: `parseTitle`, `draft`, `build`, `validate`, `upload`, `ffmpegArgs`, `duration.ts`, `catalogStore.ts`, utilidad común `slugify`/`uniqueId`, CLI.
- Servidor del admin (`scripts/catalog/src/admin/*`): `node:http` real en `127.0.0.1:0` con `--data-dir` temporal. Se marca `unit (int)` y prefijo `AD-`.
- UI del admin (`scripts/catalog/admin-ui`, vitest + Testing Library + jsdom), prefijo `AU-`.
- Frontend (vitest + Testing Library + jsdom): lógica de partida, buscador, compartir, estadísticas, barra de reproducción, `ClipPlayer.subscribe`, `FullSongEmbed`.
- `frontend/vercel.json` (CSP de `frame-src`).
- E2E Playwright: juego (backend `fs`, tonos senoidales) y admin (servidor admin real contra directorio temporal).

Fuera:
- Descarga real con yt-dlp, subida real a Supabase S3, despliegue en Render/Vercel.
- Reproducción real de YouTube (el iframe se intercepta con `page.route`).
- Shazam y grabación de audio.
- Calidad subjetiva del audio y pruebas de carga.
- Egress y horas de Render.
- Borrado y fusión de juegos, edición de `startSec`, reproducción de los 6 fragmentos en el admin (fuera de alcance, AR §14). Se prueba que NO existen.

Regla de seguridad de la suite (obligatoria): todo test que arranque el admin, `draft`, `build` o cualquier escritura de catálogo usa `--data-dir` o un directorio temporal propio. Ningún test puede leer ni escribir `scripts/catalog/data/`. El caso AD-SRV-13 lo verifica.

Convenciones: nivel `unit`, `unit (int)` o `e2e`. Prioridad A alta, M media, B baja.

## 2. Casos de prueba

### 2.1 Backend - token (`game/token.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-TOK-01 | unit | Ida y vuelta: cifrar y descifrar payload `v,n,m,d,k,r,q,iat,exp` (sin `f`) | `GAME_TOKEN_SECRET` válido | Payload idéntico; diario con `d`, ilimitado sin `d` | DEC-02, AR §4 | A |
| BE-TOK-02 | unit | Formato de red | - | base64url (sin `+ / =`), iv(12)+ct+tag(16) | AR §4 | M |
| BE-TOK-03 | unit | Alterar 1 byte (iv, ct, tag; uno por vez) | Token válido | `TOKEN_INVALID` en los 3 casos | DEC-02 | A |
| BE-TOK-04 | unit | Token truncado, vacío, no base64, con caracteres extra | - | `TOKEN_INVALID` sin excepción no controlada | AR §5 | A |
| BE-TOK-05 | unit | Caducado (`exp` pasado, reloj falso) | Reloj inyectable | `TOKEN_INVALID` | CL, AR §4 | A |
| BE-TOK-06 [AJ] | unit | Frontera de `exp` (segundos epoch, exclusivo, DEC-30) | Reloj falso | `exp-1 s` válido; en el segundo `exp` y `exp+1` inválido | DEC-30 | M |
| BE-TOK-07 | unit | `v` distinta de 1 | Token con `v:2` | `TOKEN_INVALID` | AR §4 | M |
| BE-TOK-08 | unit | Longitud idéntica con ids de 13 vs 22 caracteres y `clipKey` distintos | - | Misma longitud | DEC-03, CA-1 | A |
| BE-TOK-09 | unit | Longitud idéntica variando 0..6 `r`, 0..6 `q`, modo `d`/`u` | - | Misma longitud | DEC-03, DEC-18 | A |
| BE-TOK-10 | unit | Peor caso (diario, `r` y `q` llenos) cabe en 384 B; el exceso lanza error al emitir | - | Cabe; nunca token de otra longitud | DEC-03 | A |
| BE-TOK-11 | unit | El token no contiene en claro `id`, `title`, `clipKey`, `youtubeId` (cadena y base64 decodificado) | Objetivo conocida | Sin coincidencias | CA-1, DEC-03, DEC-41 | A |
| BE-TOK-12 | unit | Aleatoriedad del iv | Mismo payload 2 veces | Tokens distintos | DEC-02 | M |
| BE-TOK-13 | unit | Separación HKDF token/ticket | - | Ambos rechazados cruzados | AR §4 | A |
| BE-TOK-14 | unit | Otro `GAME_TOKEN_SECRET` | 2 secretos | `TOKEN_INVALID` | DEC-02 | A |
| BE-TOK-15 | unit | `exp`: diario = fin del día Madrid + 6 h; ilimitado = 24 h, en días de 23 h y 25 h | Reloj falso | Correcto | AR §4 | M |
| BE-TOK-16 | unit | El token ilimitado no almacena el filtro (sin `f` ni ids de juego) | Filtros {A} y {A,B} | Mismas claves | DEC-10 | A |
| BE-TOK-17 | unit | `q`: cada elemento `clipKey` de 16 hex; longitud fija con 0, 1, 6 elementos | - | Longitud fija | DEC-18, DEC-03 | A |
| BE-TOK-18 [AJ] | unit | `q` mal formado (no array, elemento no `clipKey` de 16 hex, longitud > `r.length`) o con `clipKey` retirado del catálogo (DEC-21) | Token cifrado a mano | `TOKEN_INVALID` en todos | DEC-21 | A |

### 2.2 Backend - tickets de clip (`game/tickets.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-TKT-01 | unit | Emitir y canjear | Partida en curso | `clipKey` e índice correctos | DEC-04, CA-2 | A |
| BE-TKT-02 | unit | Un solo uso | Ticket válido | 1.ª ok, 2.ª `CLIP_TICKET_USED` | DEC-04, RQ §2 | A |
| BE-TKT-03 [AJ] | unit | Caducidad (TTL 60 s, ms; DEC-30) | Reloj falso | Caducado -> `CLIP_TICKET_USED` (410) | DEC-30 | A |
| BE-TKT-04 | unit | Frontera TTL | Reloj falso | `exp-1 ms` válido, `exp+1 ms` caducado | DEC-04 | M |
| BE-TKT-05 | unit | `CLIP_TICKET_TTL_SEC` configurable | Env | Se respeta | AR §10 | B |
| BE-TKT-06 | unit | Ticket manipulado, truncado, basura | - | `CLIP_TICKET_INVALID` (404) | AR §5 | A |
| BE-TKT-07 | unit | Longitud idéntica entre canciones e índices 0..5 | - | Misma longitud | DEC-03 | A |
| BE-TKT-08 | unit | Sin `clipKey`, id ni título en claro | - | Sin coincidencia | CA-1 | A |
| BE-TKT-09 | unit | Solo se emite con `a = r.length` | 2 resultados | `a=2` | CA-2 | A |
| BE-TKT-10 | unit | Sin ticket en partida terminada | `won`/`lost` | `clipUrl` ausente | CA-7 | A |
| BE-TKT-11 | unit | Duración servida del intento N = `CLIP_SECONDS[N]` | Clips de 1/2/4/7/11/16 s | Clip `N+1` correcto | CA-2 | A |
| BE-TKT-12 | unit | Limpieza del registro al expirar | Reloj falso, 1000 tickets | Memoria acotada | DEC-04 | B |
| BE-TKT-13 | unit | Dos canjes simultáneos | `Promise.all` | Exactamente uno ok | DEC-04 | M |
| BE-TKT-14 | unit | Reinicio simulado con ticket vivo | Registro vacío | Reutilizable una vez, mismo clip (solo documenta) | AR §13 | B |

### 2.3 Backend - selección diaria e ilimitada (`game/daily.ts`, `catalog/`)

El diario es común y sin filtro: `idx = HMAC-SHA256(DAILY_SEED, "daily|v1|"+fecha).readUIntBE(0,6) % songs.length`, con `songs` = canciones `enabled` ordenadas por `song.id` (DEC-09).

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-DAY-01 | unit | Mismo día y semilla: misma canción, sin parámetro de filtro | Catálogo de 20 | Mismo idx siempre | CA-4 | A |
| BE-DAY-02 | unit (int) | `POST /games {mode:"daily", games:[...]}` (también `[]`) | - | 400 `VALIDATION_ERROR` | AR §5 | A |
| BE-DAY-03 | unit | Usa todo el catálogo `enabled`; las `enabled:false` (incluidas las cortas desactivadas) nunca salen | Catálogo con deshabilitadas | Cobertura multi-juego, ninguna deshabilitada | CA-4, DEC-09 | A |
| BE-DAY-04 | unit | Semillas distintas -> selecciones distintas | 2 semillas | Difieren en alguna fecha de 30 | DEC-09 | M |
| BE-DAY-05 [AJ] | unit | Cálculo exacto contra vector independiente (primeros 6 bytes big-endian, `% songs.length`) | Seed y fecha fijas | idx coincide | DEC-09 | A |
| BE-DAY-06 | unit | Orden por `song.id`; no depende del orden de carga | Catálogo barajado | Misma canción | DEC-09 | A |
| BE-DAY-07 | unit | Catálogo con 1 canción `enabled` | - | Siempre esa | DEC-09 | A |
| BE-DAY-08 [RETIRADO] | - | (era `filterKey "all"`) | - | - | - | - |
| BE-DAY-09 [RETIRADO] | - | (era `filterKey` lista) | - | - | - | - |
| BE-DAY-10 | unit | Fecha Madrid verano: `2026-07-01T22:00:00Z` | - | `2026-07-02`; `21:59:59Z` -> `07-01` | DEC-09, CL | A |
| BE-DAY-11 | unit | Fecha Madrid invierno: `2026-12-01T23:00:00Z` | - | `2026-12-02`; `22:59:59Z` -> `12-01` | DEC-09, CL | A |
| BE-DAY-12 | unit | Cambio de hora primavera 2026-03-29 (23 h) | Cuatro instantes de borde | `03-28T22:59:59Z`->03-28; `23:00:00Z`->03-29; `03-29T21:59:59Z`->03-29; `22:00:00Z`->03-30 | CL | A |
| BE-DAY-13 | unit | Cambio de hora otoño 2026-10-25 (25 h) | Cuatro instantes de borde | `10-24T21:59:59Z`->10-24; `22:00:00Z`->10-25; `10-25T22:59:59Z`->10-25; `23:00:00Z`->10-26 | CL | A |
| BE-DAY-14 | unit | Fin de año `2026-12-31T23:00:00Z` | - | `2027-01-01` | CL | M |
| BE-DAY-15 | unit | Zona fija en código | `TZ` = UTC, New_York, Tokyo | Misma fecha | DEC-09 | M |
| BE-DAY-16 [AJ] | unit (int) | Campo `date` extra en `POST /games` se ignora (DEC-31) | - | No se puede elegir día | DEC-31 | A |
| BE-DAY-17 [RETIRADO, ver §0.5] | unit | 365 días, catálogo de 10 | - | Todas las canciones aparecen | RQ §3 | B |
| BE-DAY-18 | unit | Ilimitado: `randomInt(pool.length)` sobre pool ordenado por `id` (DEC-20) | `randomInt` espiado | Índices en `[0,len)`; pool de 1 constante | DEC-10, DEC-20 | M |
| BE-DAY-19 | unit (int) | Dos `POST /games daily` el mismo día | Catálogo >=3, reloj fijo | Mismo `date`; misma `solution` al terminar | CA-4 | A |
| BE-DAY-20 | unit (int) | Día D y D+1 con reloj falso | - | `date` distinto; token de D sigue válido hasta `exp` | CL | M |

Pool de ilimitado y catálogo público (`catalog/`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-CAT-01 | unit | Pool = `enabled:true` con algún juego del filtro | Deshabilitadas y multi-juego | Correcto | DEC-10 | A |
| BE-CAT-02 [RETIRADO, ver §0.4] | unit | Multi-juego aparece una vez | - | Sin duplicados | DEC-10 | A |
| BE-CAT-03 | unit (int) | Ilimitado con `games:[]` | - | 400 `EMPTY_FILTER` | CA-5 | A |
| BE-CAT-04 | unit (int) | Ilimitado con juego cuyas canciones están todas deshabilitadas | - | 400 `EMPTY_FILTER` | CA-5 | A |
| BE-CAT-05 | unit (int) | Id de juego inexistente | - | 400 `UNKNOWN_GAME` | AR §5 | A |
| BE-CAT-06 [MOD] | unit (int) | `GET /catalog` público: solo `id,title,games` por canción y `{id,name}` por juego; recursivamente sin `clipKey,startSec,enabled,reviewed,source,youtubeId,videoTitle,durationSec`; sin canciones deshabilitadas | Catálogo con `source.youtubeId` y `durationSec` | Cumple; ni el JSON serializado contiene el `youtubeId` de ninguna canción | DEC-11, DEC-41, CA-1 | A |
| BE-CAT-07 | unit (int) | Canción retirada con partida en curso | Token con `clipKey` inexistente | `TOKEN_INVALID` | AR §4 | A |
| BE-CAT-08 | unit (int) | Catálogo no cargado: `/health` | Store que falla | 503 `CATALOG_UNAVAILABLE`; escucha; reintento con backoff hasta recuperar | AR §9 | A |
| BE-CAT-09 | unit (int) | `/games` con catálogo no cargado | Idem | 503 | AR §5 | M |
| BE-CAT-10 [NUEVO] | unit (int) | `/catalog` lista solo juegos con alguna canción habilitada (DEC-32) | Juego con todas sus canciones deshabilitadas (p. ej. cortas) | Juego ausente en `games` | DEC-32, DEC-40 | A |
| BE-CAT-11 [NUEVO] | unit (int) | Catálogo cuyo `catalog.json` tiene una canción `enabled` y corta (`durationSec` < `startSec+16,1`) o un `youtubeId` mal formado | Fixture inválido | El validador compartido lo rechaza: `/health` 503 `CATALOG_UNAVAILABLE`. Documenta que el backend no arranca con catálogo inválido | AR §6 | M |

### 2.4 Backend - motor de reglas, vista y solución (`game/engine.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-ENG-01 | unit | Acierto | En curso | `H`; `won`; `hit` | CA-7 | A |
| BE-ENG-02 | unit | Fallo con juego distinto | Objetivo en A, elegida solo en B | `M` -> `miss` | CA-3 | A |
| BE-ENG-03 | unit | Fallo con juego correcto | Comparten un juego | `G` -> `game` | CA-3 | A |
| BE-ENG-04 [RETIRADO, ver §0.4] | unit | Intersección parcial | {A,B} vs {B,C} | `G` | RQ §3 | A |
| BE-ENG-05 [RETIRADO, ver §0.4] | unit | Multi-juego y elegida disjunta | - | `M` | DEC-17 | M |
| BE-ENG-06 | unit | Elegida fuera del pool del filtro (ilimitado) se acepta | Filtro {A}, canción de B | Evalúa `M` o `G` | DEC-17, DEC-10 | A |
| BE-ENG-07 | unit | Filtro de un solo juego, elegir de A | - | `G` o `H`, nunca `M` | DEC-17 | M |
| BE-ENG-08 | unit | Skip | - | `S`; `attempt`+1 | RQ §3 | A |
| BE-ENG-09 | unit | 6.º fallo (guess) -> `lost` | 5 resultados | `lost`; sin `clipUrl` | CA-7 | A |
| BE-ENG-10 | unit | 6.º con skip -> `lost` | 5 resultados | `lost` | CA-7 | A |
| BE-ENG-11 | unit | 6.º con acierto | 5 fallos | `won` | RQ §3 | A |
| BE-ENG-12 | unit | Acierto en intento 1 | - | `won`, `attempt=1` | RQ §3 | M |
| BE-ENG-13 | unit | Guess o skip tras `won`/`lost` | Terminada | `GAME_OVER` (409), estado intacto | CA-7 | A |
| BE-ENG-14 | unit | Estado derivado | Secuencias | Tabla AR §4 | AR §4 | M |
| BE-ENG-15 | unit | `songId` inexistente o deshabilitada | - | `UNKNOWN_SONG` | AR §5 | A |
| BE-ENG-16 | unit | Repetir canción fallida | Tras `M` en X | 409 `ALREADY_GUESSED`; sin cambio | DEC-18 | A |
| BE-ENG-17 | unit | Cada acción válida devuelve token distinto; el anterior refleja el estado antiguo (limitación) | - | Token nuevo != anterior | AR §8 | M |
| BE-ENG-18 | unit (int) | `ALREADY_GUESSED` no consume intento ni emite token | Un fallo previo | Error sin `token`; `/games/state` mismo `attempt` | DEC-18 | A |
| BE-ENG-19 | unit | Repetir canción que dio `G` | - | `ALREADY_GUESSED` | DEC-18 | A |
| BE-ENG-20 | unit | Skip no añade a `q` | Skip + guess | Aceptado | DEC-18 | M |
| BE-ENG-21 [AJ] | unit | Prioridad `TOKEN_INVALID` > `GAME_OVER` > `UNKNOWN_SONG` > `ALREADY_GUESSED` (DEC-31) | Cuatro casos cruzados | Código según prioridad | DEC-31 | M |
| BE-ENG-22 | unit | 6.º intento repetido se rechaza sin perder | 5 resultados | `playing`, `attempt=5`; luego distinta cierra | DEC-18, CA-7 | A |
| BE-ENG-23 | unit | `guesses`: `songId` en orden, sin skips; igual tras `/games/state` | 3 guesses y 1 skip | Correcto | DEC-18 | A |
| BE-ENG-24 | unit | `guesses` de ganada incluye el acierto; de perdida solo intentos propios | - | Correcto | DEC-18, CA-1 | A |
| BE-ENG-25 [NUEVO] | unit | `solution.youtubeId` presente al ganar y al perder (igual al `source.youtubeId` de la objetivo); ausente en `playing` (no existe la clave `solution`) | Catálogo con `youtubeId` | Correcto en los 3 estados | DEC-41, RQ §3 | A |
| BE-ENG-26 [NUEVO] | unit (int) | `POST /games/state` sobre partida ya terminada devuelve la misma `solution` con `youtubeId` (idempotente); `GAME_OVER` de guess/skip no la devuelve | Partida terminada | `state` = misma solución; 409 sin `solution` | DEC-41, CA-7 | A |

### 2.5 Backend - revelado de solución y fuga (integración)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-LEAK-01 | unit (int) | `solution` ausente mientras `playing` | En curso | La clave no existe | CA-1, CA-7 | A |
| BE-LEAK-02 [MOD] | unit (int) | `solution` al ganar con `id,title,games[{id,name}],youtubeId` | Acierto | Correcta | CA-7, DEC-41 | A |
| BE-LEAK-03 [MOD] | unit (int) | `solution` al perder, con `youtubeId` | 6 fallos | Correcta | CA-7, DEC-41 | A |
| BE-LEAK-04 | unit (int) | `clipUrl` ausente al terminar | Terminada | Sin `clipUrl` | CA-7 | A |
| BE-LEAK-05 [MOD] | unit (int) | Fuga: partida completa; serializar cuerpo y cabeceras de TODAS las respuestas previas al final (incluidos los 4xx, p. ej. `ALREADY_GUESSED`) y buscar id, título, `clipKey`, fichero, `startSec`, **`youtubeId`**, `videoTitle`, `durationSec` de la objetivo (y subcadenas >=4 y base64) | Objetivo conocida | Cero coincidencias | CA-1, RQ §2, DEC-41 | A |
| BE-LEAK-06 [MOD] | unit (int) | Misma prueba en diario (dos fechas) e ilimitado (dos objetivos). Whitelist de claves de `GameView`: `token,mode,date?,status,attempt,maxAttempts,clipSeconds,results,guesses,clipUrl?,solution?` | - | Cero coincidencias; claves exactas | CA-1 | A |
| BE-LEAK-07 | unit (int) | Errores 4xx/5xx no filtran datos de la objetivo | - | Sin datos | CA-1 | A |
| BE-LEAK-08 | unit (int) | `Content-Length` de clips y tamaño del JSON de `GameView` iguales entre objetivos para el mismo intento | Clips CBR | Iguales | DEC-03, DEC-06 | A |
| BE-LEAK-09 | unit (int) | `clipUrl` opaca | - | Sin `clipKey` ni id | RQ §2 | A |
| BE-LEAK-10 [MOD] | unit (int) | `solution` solo con `id,title,games,youtubeId`; sin `clipKey,startSec,source,videoTitle,durationSec,enabled,reviewed` | Terminada | Claves exactas | DEC-11, DEC-41 | M |
| BE-LEAK-11 | unit (int) | `ALREADY_GUESSED` idéntico con independencia de la objetivo | Misma secuencia, dos objetivos | Cuerpos iguales | CA-1, DEC-18 | A |
| BE-LEAK-12 | unit (int) | `GameView` no incluye `clipKey` de canciones intentadas | - | Solo `songId` | CA-1 | A |
| BE-LEAK-13 [NUEVO] | unit (int) | `youtubeId` aparece al terminar SOLO en `solution.youtubeId` de la respuesta final y de `/games/state` posteriores; no está en cabeceras, en `/catalog`, ni en ningún otro campo de `GameView` (búsqueda de subcadena en todo lo demás) | Partida terminada | Aparece exactamente en esa clave | DEC-41, CA-1 | A |
| BE-LEAK-14 [NUEVO] | unit (int) | La respuesta que NO termina la partida (anterior a la final) no contiene el `youtubeId` aunque la siguiente sí | Secuencia de 6 intentos | Cero coincidencias hasta la respuesta final | DEC-41, CA-1 | A |
| BE-LEAK-15 [NUEVO] | unit (int) | Dos partidas diarias el mismo día (BE-DAY-19): ninguna respuesta anterior al final contiene el `youtubeId` común | - | Cero coincidencias | CA-1, DEC-41 | M |
| BE-LEAK-16 [NUEVO] | unit (int) | El token y el ticket (descifrados con el secreto de test) no contienen `youtubeId`; no hay `youtubeId` en `q` | - | Ausente | DEC-41, DEC-18 | M |

### 2.6 Backend - cabeceras y clips (integración)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-HDR-01 | unit (int) | Cabeceras de `GET /clips/:ticket` | Ticket válido | `audio/mpeg`, `Content-Length`, `no-store, private`, `nosniff` | AR §5 | A |
| BE-HDR-02 | unit (int) | Sin `ETag`, `Last-Modified`, `Content-Disposition`, `Accept-Ranges` en `/clips` | - | Ausentes | CA-1 | A |
| BE-HDR-03 | unit (int) | Sin `ETag` en ninguna ruta | `etag=false` | Ausente | AR §5 | A |
| BE-HDR-04 | unit (int) | Sin `X-Powered-By` | - | Ausente | AR §5 | M |
| BE-HDR-05 | unit (int) | `Cache-Control: no-store` en JSON de `/games/*` incl. errores 409 | - | Presente | AR §5 | A |
| BE-HDR-06 | unit (int) | `Range` e `If-None-Match` en `/clips` | Ticket válido | 200 completo | DEC-05 | M |
| BE-HDR-07 | unit (int) | Segunda petición al ticket | - | 410 `CLIP_TICKET_USED` | CA-2 | A |
| BE-HDR-08 | unit (int) | Ticket inválido | - | 404 `CLIP_TICKET_INVALID` | AR §5 | A |
| BE-HDR-09 | unit (int) | CORS solo `ALLOWED_ORIGIN`; sin `Expose-Headers` | - | Según descripción | AR §8 | M |
| BE-HDR-10 | unit (int) | Clip sin ID3/Xing y servido sin transformar | Fixture | Bytes iguales al fichero | DEC-06 | M |
| BE-HDR-11 | unit (int) | Tamaño del clip N ≈ `CLIP_SECONDS[N]*16000` B (±1 trama) | CBR 128 | Coincide | CA-2 | A |
| BE-HDR-12 [AJ] | unit (int) | Fallo del almacén: 502 `STORAGE_ERROR` sin detalles internos; **el ticket NO queda consumido** (DEC-22) y un reintento con el mismo ticket funciona si el almacén se recupera | Store que falla una vez | 502, luego 200 con el mismo ticket | DEC-22 | A |
| BE-HDR-13 [AJ] | unit (int) | Cuerpo > 4 KB | - | 413 `VALIDATION_ERROR` | DEC-31 | M |
| BE-HDR-14 [AJ] | unit (int) | Ruta inexistente | - | 404 `NOT_FOUND` JSON, sin stack | DEC-31 | B |

### 2.7 Backend - validación y config

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-VAL-01 | unit | `POST /games`: `mode` desconocido/ausente; `daily` con `games`; `unlimited` sin `games` o no array | - | `VALIDATION_ERROR` (`games:[]` en ilimitado -> `EMPTY_FILTER`) | AR §5 | A |
| BE-VAL-02 | unit | `games` con elementos no string, demasiados o enormes | - | `VALIDATION_ERROR` | DEC-15 | A |
| BE-VAL-03 | unit | `token` ausente/no string/vacío | - | `VALIDATION_ERROR` | AR §5 | A |
| BE-VAL-04 | unit | `songId` ausente/número/objeto/`__proto__`/`constructor` | - | `VALIDATION_ERROR` o `UNKNOWN_SONG` | AR §8 | A |
| BE-VAL-05 | unit | Cuerpo no JSON o `Content-Type` incorrecto | - | 400 con formato de error en español | AR §5 | M |
| BE-VAL-06 | unit | Token en query string | - | Ignorado | AR §5 | B |
| BE-VAL-07 [AJ] | unit | Campos extra en `guess` (`gameId`, `filter`, `startSec`, `youtubeId`) | - | Ignorados; no cambian la evaluación (DEC-31) | DEC-31 | B |
| BE-CFG-01 | unit | Falta `GAME_TOKEN_SECRET` o `DAILY_SEED` | - | `loadConfig` lanza | AR §8 | A |
| BE-CFG-02 | unit | Secreto < 32 bytes | - | Lanza | AR §8 | A |
| BE-CFG-03 | unit | `s3` sin claves/endpoint/bucket | - | Lanza sin imprimir secretos | AR §10 | M |
| BE-CFG-04 | unit | Defaults TTL 60, caché 32, `TRUST_PROXY=1` | - | Valores | AR §10 | B |
| BE-CFG-05 | unit | Sin `RENDER_*` | - | Ninguna | RQ §9 | B |

### 2.8 Backend - rate-limit (limitador propio con reloj inyectado, DEC-13)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-RL-01 | unit (int) | `POST /games` > 20/min por IP | Reloj falso | 21.ª -> 429 con `Retry-After` > 0 | RQ §5 | A |
| BE-RL-02 | unit (int) | `guess`+`skip` > 40/min por IP | - | 41.ª -> 429 | AR §8 | A |
| BE-RL-03 | unit (int) | `/clips` > 30/min por IP | - | 31.ª -> 429 | AR §8 | M |
| BE-RL-04 | unit (int) | Global `/api` 120/min | - | 121.ª -> 429 | AR §8 | M |
| BE-RL-05 [AJ] | unit (int) | Por partida (nonce): cuentan `state`, `guess` y `skip`; la 13.ª en 1 min -> 429 aunque cambie la IP | `X-Forwarded-For` | 429 | DEC-13 | A |
| BE-RL-06 [AJ] | unit (int) | Crear partida y `/clips` NO cuentan por partida; otra partida de la misma IP no se bloquea | - | Correcto | DEC-13 | M |
| BE-RL-07 | unit (int) | Recuperación tras la ventana de 60 s | Reloj +60 s | 200 | AR §8 | M |
| BE-RL-08 | unit (int) | `TRUST_PROXY=1` toma la IP de `X-Forwarded-For`; con 0 se ignora | - | Según config | AR §13 | A |
| BE-RL-09 | unit (int) | `RATE_LIMIT_*` por env | - | Se aplican | AR §10 | B |
| BE-RL-10 | unit (int) | Flujo normal (6 intentos, `state`, recarga, un `ALREADY_GUESSED`) no dispara el límite por nonce | - | Sin 429. **Posible defecto de diseño**; el test lo confirma o refuta | RQ §5 | A |
| BE-RL-11 [AJ] | unit (int) | `ALREADY_GUESSED` cuenta para el límite por nonce y por IP | Repeticiones | 429 a partir del límite | DEC-13, DEC-18 | M |

### 2.9 Backend - almacén y caché

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| BE-STO-01 | unit | `LruCache` límite en bytes, expulsa el menos reciente | - | Correcto | AR §9 | M |
| BE-STO-02 | unit | Clip mayor que el límite no se cachea | - | Se sirve sin cachear | AR §9 | B |
| BE-STO-03 | unit | `FsClipStore` sin path traversal | `clipKey` `../` | Rechaza claves fuera de `[0-9a-f]{16}` | DEC-07 | A |
| BE-STO-04 | unit | `S3ClipStore` con cliente simulado | Mock | `GetObject` correcto; error -> `STORAGE_ERROR` | DEC-08 | M |
| BE-STO-05 | unit | Hit de caché no llama al store | Spy | 1 lectura | AR §9 | M |

### 2.10 shared (`catalog.ts`, `rules.ts`, `date.ts`)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SH-CAT-01 [MOD] | unit | Catálogo válido mínimo y `catalog.example.json` (con `source.youtubeId` de 11 caracteres y `durationSec`) | - | Sin errores | AR §6 | A |
| SH-CAT-02 | unit | Ids de canción duplicados | - | Error con el id | AR §6 | A |
| SH-CAT-03 [AJ] | unit | Id de canción: mayúsculas, espacios, `_`, vacío, acentos | - | Error (`[a-z0-9-]+`) | DEC-29 | A |
| SH-CAT-04 [AJ] | unit | Id de juego: `[A-Za-z0-9-]+` admite mayúsculas; duplicado o `_`/espacio -> error | - | Según DEC-29 | DEC-29 | M |
| SH-CAT-05 | unit | `clipKey` duplicado | - | Error | AR §6 | A |
| SH-CAT-06 | unit | `clipKey` mal formado (15/17 hex, mayúsculas, no hex, vacío) | - | Error | AR §6 | A |
| SH-CAT-07 | unit | Juego inexistente | - | Error | AR §6 | A |
| SH-CAT-08 | unit | `games` vacío en una canción | - | Error (DEC-26) | AR §6 | A |
| SH-CAT-09 | unit | `startSec` negativo | - | Error; 0 y decimales válidos | AR §6 | A |
| SH-CAT-10 | unit | `startSec` NaN/Infinity/no numérico | - | Error | AR §6 | M |
| SH-CAT-11 | unit | Falta campo obligatorio, `version`!=1, raíz no objeto, `null` | - | Error descriptivo | AR §6 | A |
| SH-CAT-12 | unit | Ids repetidos en `games` de una canción | - | Error o normalización (definir) | AR §6 | M |
| SH-CAT-13 | unit | Acumula todos los errores | 3 fallos | 3 errores | AR §6 | B |
| SH-CAT-14 | unit | Una sola canción habilitada / todas deshabilitadas | - | Válido | CA-5 | M |
| SH-CAT-15 [NUEVO] | unit | `source.youtubeId` válido: 11 caracteres `[A-Za-z0-9_-]`, incluyendo uno que empieza por `-` | - | Sin error | DEC-41 | A |
| SH-CAT-16 [NUEVO] | unit | `source.youtubeId` inválido: 10 y 12 caracteres, vacío, con espacio, `/`, `"`, `<`, `.`, unicode, no string, ausente | - | Error en cada uno (defensa del embed) | DEC-41, AR §8 | A |
| SH-CAT-17 [NUEVO] | unit | `source.durationSec`: ausente válido; número finito > 0 válido; 0, negativo, NaN, Infinity, string -> error | - | Según regla | DEC-40 | A |
| SH-CAT-18 [NUEVO] | unit | Regla `tooShort(durationSec, startSec)` = `durationSec < startSec + 16 + 0.1` en el límite exacto. Para `startSec=0`: 16,1 no es corta; 16,0999 sí; 16,0 sí; 0,5 sí. Para `startSec=5`: 21,1 no es corta; 21,0999 sí | Usar la propia constante `16 + 0.1` en el test (riesgo de coma flotante) | Límites correctos | DEC-40 | A |
| SH-CAT-19 [NUEVO] | unit | Canción `enabled:true` y corta -> error del validador que nombra la canción; `enabled:false` y corta -> válido | - | Error / válido | DEC-40 | A |
| SH-CAT-20 [NUEVO] | unit | Canción `enabled:true` sin `durationSec` -> válido (duración desconocida, no se considera corta) | - | Sin error | DEC-40 | M |
| SH-CAT-21 [NUEVO] | unit | `tooShort` cambia con `startSec` editado a mano (duración 20 s: `startSec 0` no corta, `startSec 5` corta) | - | Derivado, nunca persistido | DEC-40 | M |
| SH-RUL-01 | unit | `CLIP_SECONDS=[1,2,4,7,11,16]`, `MAX_ATTEMPTS=6` | - | Exactos | RQ §3 | A |
| SH-DAT-01 | unit | `shared/date.ts` para los instantes de BE-DAY-10..14 | - | Mismos resultados | DEC-09 | A |
| SH-DAT-02 | unit | Independiente de TZ del proceso/navegador | TZ variable | Misma fecha | CL | M |
| SH-SRC-01..05 [NUEVO] | unit | `shared/search.ts`: `normalizeText` (acentos, mayúsculas, espacios) y `matchesAllWords` (cada palabra en algún campo, orden indiferente, consulta vacía no coincide, texto literal sin regex) | - | Según caso | DEC-17 | A |
| SH-DAT-03 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |

### 2.11 Scripts de catálogo (sin red; todo con directorio temporal)

Regla de corta (`duration.ts`, DEC-40), medición con `ffprobe` simulado:

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-DUR-01 [NUEVO] | unit | Parseo de la salida de `ffprobe` (duración en segundos con decimales) a número | Salida simulada `183.420000` | `183.42` | DEC-40 | A |
| SC-DUR-02 [NUEVO] | unit | Salida de `ffprobe` inválida (`N/A`, vacía, texto, negativa, 0) | Mock | No devuelve número (resultado "no medible"); no lanza excepción no controlada | DEC-40 | A |
| SC-DUR-03 [NUEVO] | unit | Rutas absolutas para ffprobe: `youtubeId` que empieza por `-` (`-BRQ_XVwg-M`) | Mock registra argv | El argumento de fichero es ruta absoluta (no empieza por `-`); no se interpreta como opción | AR §8 | A |
| SC-DUR-04 [NUEVO] | unit | Argv de ffprobe como array (sin shell); ruta con espacios y `;` | Mock | Sin inyección | AR §8 | M |
| SC-DUR-05 [NUEVO] | unit | `ffprobe` no instalado / código de salida != 0 | Mock spawn con error | Mensaje claro; no se modifica el catálogo | DEC-40 | M |
| SC-DUR-06 [NUEVO] | unit | Localizar la fuente en `data/work/<youtubeId>.*` ignorando `.part`, `.ytdl`, `.json` | Dir temporal con varios ficheros | Elige el medio válido; si no hay, "sin fuente" | DEC-16 | M |
| SC-DUR-07 [NUEVO] | unit (cond.) | Medición real con ffprobe sobre tonos de 7,4 s y 40 s generados con ffmpeg | ffmpeg presente | 7,4 ±0,05 y 40 ±0,05; skip explícito si falta | DEC-40 | M |

Detección y desactivación en `draft` y `build`:

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-DR-01 [MOD] | unit | `draft` añade vídeos nuevos con `startSec:0`, `reviewed:false`, `clipKey` válido y único, `source.youtubeId`, `source.durationSec` medida. Si el título no permite deducir el juego: `games: []` y `validate` falla (DEC-26) | Catálogo vacío | Entradas según regla | DEC-26, DEC-40 | A |
| SC-DR-02 | unit | `draft` idempotente | Dos veces | Sin duplicados ni cambios | AR §6 | A |
| SC-DR-03 [MOD] | unit | `draft` nunca pisa entradas existentes. Única excepción permitida: completar `source.durationSec` ausente y poner `enabled:false` si es corta; título, juegos, `startSec`, `reviewed`, `clipKey` intactos | Entrada editada y revisada | Solo cambian esos dos campos | AR §6, DEC-40 | A |
| SC-DR-04 | unit | `draft` evita colisión de `clipKey` | Generador forzado | Reintenta | AR §6 | M |
| SC-DR-05 | unit | Títulos repetidos dan ids distintos y válidos | - | Sufijo | AR §6 | A |
| SC-DR-06 | unit | Juego nuevo se añade sin duplicar | - | Catálogo válido | AR §6 | M |
| SC-DR-07 [NUEVO] | unit | `draft` mide solo fuentes sin `durationSec` (no vuelve a llamar a ffprobe para las medidas) | Mock cuenta llamadas | 0 llamadas para entradas ya medidas | DEC-40 | M |
| SC-DR-08 [NUEVO] | unit | Fuente corta nueva: entrada con `enabled:false`, `durationSec` guardada, aviso en consola, **código de salida 0**; no activa nunca nada por sí mismo (una larga queda en el `enabled` por defecto) | Fuentes de 7,4 s y 40 s | Corta desactivada; larga como el resto | DEC-40, RQ §4 | A |
| SC-DR-09 [NUEVO] | unit | `draft` con fuente no medible (ffprobe falla) deja `durationSec` ausente y avisa; no desactiva ni falla | Mock | Catálogo sin cambios de `enabled` | DEC-40 | M |
| SC-FF-01 | unit | Args master: `-ss startSec -t 16`, `loudnorm` | - | Esperados | AR §6 | A |
| SC-FF-02 [RETIRADO, ver §0.2] | unit | Args clips para N en `CLIP_SECONDS` | - | `-t N`, fundido 50 ms, `-b:a 128k`, estéreo, 44100 | CA-2, DEC-06 | A |
| SC-FF-03 | unit | Args sin metadatos | - | `-map_metadata -1 -id3v2_version 0 -write_xing 0 -fflags +bitexact` | DEC-06 | A |
| SC-FF-04 | unit | Salida `data/out/clips/<clipKey>/<n>.mp3` (n=1..6) | - | Correcta, sin id ni título | DEC-07, DEC-24 | A |
| SC-FF-05 | unit | Args seguros ante rutas con espacios/comillas/`;` | - | Sin inyección | AR §8 | M |
| SC-FF-06 [RETIRADO, ver §0.2] | unit | Fundido en clip de 1 s sin negativos | - | `st >= 0` | DEC-06 | M |
| SC-BU-01 | unit | Recompila solo si cambian `startSec` o fuente | Manifest simulado | Correcto | AR §6 | M |
| SC-BU-02 [MOD] | unit | `build` ignora `enabled:false` (incluidas las cortas ya desactivadas) | - | No genera sus clips ni mide | AR §6 | M |
| SC-BU-03 [NUEVO] | unit | `build` mide SIEMPRE la fuente antes de cortar (incluso con `durationSec` guardada y distinta); si la medida real dice corta, desactiva la canción con `catalogStore.update` y actualiza `durationSec` | Catálogo con `durationSec` desfasada | Canción desactivada, medida real guardada | DEC-40 | A |
| SC-BU-04 [NUEVO] | unit | `build` con una corta activa y otras largas: no genera clips de la corta, SÍ genera los de las demás, aviso en consola y **código de salida 0** | 1 corta + 2 largas | Largas construidas; corta `enabled:false`; sin error | DEC-40, RQ §4 | A |
| SC-BU-05 [NUEVO] | unit | `build` no modifica ningún otro campo de la canción corta ni de otras entradas; no activa nada | Catálogo con revisiones | Solo `enabled` y `durationSec` | DEC-40 | A |
| SC-VA-01 [MOD] | unit | `validate` falla con clips faltantes (5 de 6), catálogo inválido o canción `enabled` con `games: []` | Dir sintético | Código != 0 con mensaje | AR §6 | A |
| SC-VA-02 | unit | Tamaños distintos entre canciones para el mismo intento | - | Falla | DEC-06 | A |
| SC-VA-03 | unit | Tamaños idénticos | - | Pasa | DEC-06 | A |
| SC-VA-04 | unit | ffprobe simulado: tolerancia −30/+60 ms | Mock | −29 y +59 pasan; −31 y +61 fallan | CA-2 | A |
| SC-VA-05 | unit | ffprobe simulado con etiquetas | Mock | Falla | RQ §2 | A |
| SC-VA-06 | unit (cond.) | `validate` real contra fixtures (−30/+60 ms) | ffmpeg presente | Pasa; si no, skip | AR §11 | M |
| SC-VA-07 [NUEVO] | unit | `validate` FALLA si una canción `enabled` es corta (cubre la reactivación manual en el JSON); el mensaje nombra la canción y su duración | Catálogo con corta activa | Código != 0 | DEC-40 | A |
| SC-VA-08 [NUEVO] | unit | `validate` PASA si la canción corta está desactivada, y no exige sus clips | Corta `enabled:false` | Código 0 | DEC-40 | A |
| SC-VA-09 [NUEVO] | unit | `validate` con canción activa sin `durationSec`: no la considera corta | - | Pasa por este motivo | DEC-40 | M |

`catalogStore` (DEC-37):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-CS-01 [NUEVO] | unit | `update(mutator)` lee el fichero en ese momento, aplica el cambio y escribe | Dir temporal | Cambio persistido, resto intacto | DEC-37 | A |
| SC-CS-02 [NUEVO] | unit | Escritura atómica: se escribe `catalog.json.tmp-<pid>` en el MISMO directorio, `fsync` y `rename`; tras la operación no queda ningún `.tmp` | Spy sobre `fs` | Orden write -> fsync -> rename; sin restos | DEC-37 | A |
| SC-CS-03 [NUEVO] | unit | Fallo a mitad de escritura (error al escribir/rename) deja el `catalog.json` original intacto y el `.tmp` limpiado; la cola sigue operativa | Mock que falla | Original idéntico byte a byte | DEC-37 | A |
| SC-CS-04 [NUEVO] | unit | Operaciones encoladas: 20 `update` concurrentes (`Promise.all`) incrementando un contador | - | Resultado = 20, sin pérdida de actualizaciones | DEC-37 | A |
| SC-CS-05 [NUEVO] | unit | Lectura-modificación-escritura real: una edición externa de `catalog.json` entre dos `update` se conserva (no se pisa con una copia cargada al inicio) | Escribir el fichero entre updates | Ambos cambios presentes | DEC-37 | A |
| SC-CS-06 [NUEVO] | unit | `.bak`: la primera escritura de cada arranque copia el original a `catalog.json.bak`; las siguientes no lo sobrescriben | 3 updates | `.bak` = original previo a la 1.ª escritura | DEC-37 | A |
| SC-CS-07 [NUEVO] | unit | Un `mutator` que lanza excepción no escribe nada, no crea `.bak`, y la cola sigue funcionando | - | Fichero intacto; el siguiente `update` funciona | DEC-37 | A |
| SC-CS-08 [NUEVO] | unit | Lectura tolerante: catálogo inválido (`games: []`, canción activa corta, `youtubeId` malo) se carga igualmente | Catálogo inválido | Se devuelve el contenido y los errores del validador sin lanzar | AR §6.1 | A |
| SC-CS-09 [NUEVO] | unit | JSON corrupto o vacío / fichero inexistente | - | Error claro (no `undefined` silencioso); no sobrescribe el fichero corrupto | DEC-37 | M |
| SC-CS-10 [NUEVO] | unit | `draft` y `build` usan `catalogStore.update` (no escriben `catalog.json` directamente) | Spy / grep | Todas las escrituras pasan por el store | DEC-37 | M |
| SC-CS-11 [NUEVO] | unit | Escritura preserva campos desconocidos y el orden de claves razonable (sin reordenar ni perder `source.*`) | Campo extra | Se conserva | DEC-37 | M |
| SC-CS-12 [NUEVO] | unit | Permisos y rutas: el store solo escribe dentro del directorio del catálogo; nunca fuera de `--data-dir` | Dir temporal | Sin escrituras fuera | DEC-36 | A |

Utilidad común `slugify`/`uniqueId` (DEC-39):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-ID-01 [NUEVO] | unit | `slugify`: acentos, mayúsculas, símbolos, espacios, "Pokemon Ruby / Sapphire / Emerald" | - | Solo `[a-z0-9-]`, sin guiones dobles ni extremos | DEC-39 | A |
| SC-ID-02 [NUEVO] | unit | `uniqueId`: colisión con ids existentes añade sufijo y es estable | Ids existentes | Único y válido | DEC-39 | A |
| SC-ID-03 [NUEVO] | unit | Un nombre que no produce slug (`???`, solo símbolos) | - | Resultado definido y válido (fallback) o error; nunca id vacío | DEC-39 | M |
| SC-ID-04 [NUEVO] | unit | `draft` y admin usan la MISMA función (un test cruza ambos: mismo nombre -> mismo id) | - | Ids iguales | DEC-39 | A |
| SC-ID-05 [NUEVO] | unit | Id generado cumple los formatos de DEC-29 (juego y canción) | - | Pasa el validador | DEC-29 | M |

Resto del script:

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| SC-PT-01 | unit | `parseTitle` formato típico | - | Título y juego(s) | RQ §4 | A |
| SC-PT-02 | unit | Varios juegos, "OST", "(Extended)", unicode | - | Sin excepción | RQ §4 | M |
| SC-PT-03 | unit | No parseable | - | Título completo, `games: []`; nunca lanza | DEC-26 | A |
| SC-PT-04 | unit | Cadena vacía | - | Seguro | RQ §4 | B |
| SC-FE-01..03 [NUEVO] | unit | `fetch` con yt-dlp simulado: una playlist guarda sus entradas en `playlist.json` y las descarga; una URL de vídeo suelto (el JSON no trae `entries`) cuenta como una lista de un vídeo; el formato pedido es `bestaudio[ext=m4a]/bestaudio` (YouTube da 403 a parte de las descargas webm) | `--data-dir` temporal | `playlist.json` correcto y descarga pedida | AR §6 | M |
| SC-UP-01 | unit | `upload` ejecuta `validate` primero; si falla no sube | Cliente S3 simulado | 0 subidas | AR §6 | A |
| SC-UP-02 | unit | Clips y por último `catalog.json` | Mock orden | Catálogo el último | AR §6 | A |
| SC-UP-03 | unit | Nunca sube `data/work/` | - | 0 claves de work | DEC-16 | A |
| SC-UP-04 [AJ] | unit | Sube solo clips nuevos o con md5 distinto (`ObjectStore.list` devuelve `{key,md5}`, DEC-23) | Remoto parcial | Diferencia | DEC-23 | M |
| SC-UP-05 | unit | `--prune` | - | Según flag | AR §6 | M |
| SC-UP-06 [NUEVO] | unit | `upload` no sube clips de canciones desactivadas (cortas) y el `catalog.json` subido las mantiene `enabled:false` | Corta desactivada | 0 claves de esa canción | DEC-40 | M |
| SC-CLI-01 | unit | Subcomando desconocido / falta URL en `fetch` | - | Uso y código != 0 | AR §6 | B |
| SC-SIM-01..02 [NUEVO] | unit | `chromagram`: un La de 440 Hz concentra la energía en la clase 0 con norma 1 por ventana; el silencio da ceros sin NaN | Audio sintético | Cumple | DEC-56 | M |
| SC-SIM-03..06 [NUEVO] | unit | `similarity`: misma melodía con otro volumen > 0,95; con 8 s de desfase > 0,9 en los dos sentidos; melodías distintas < 0,5; menos de 3 s → 0 | Audio sintético | Cumple | DEC-56 | A |
| SC-SIM-07..08 [NUEVO] | unit | `findSimilarPairs`: solo parejas ≥ umbral, de mayor a menor; vacío o una entrada → sin parejas | - | Cumple | DEC-56 | A |
| SC-SIM-09 [NUEVO] | unit (cond.) | `ffmpegDecoder` real: devuelve los segundos pedidos desde `startSec` con nombre que empieza por "-"; fichero inexistente → error que nombra ffmpeg | ffmpeg instalado | Cumple (se omite sin ffmpeg) | DEC-56 | M |
| SC-SIM-10..16 [NUEVO] | unit | `similar <juegoId>` con decodificador simulado y `--data-dir` temporal: lista la pareja con puntuación; solo el juego pedido y las activas (`--all` añade las desactivadas, marcadas); decodifica desde `startSec` 90 s; `--threshold`; aviso de las que no tienen audio; juego inexistente, sin juego, umbral no válido o sin catálogo → código != 0 | - | Cumple | DEC-56 | A |
| SC-GI-01 | unit | `.gitignore` cubre `node_modules`, `dist`, `.env*` (salvo `.env.example` de cada paquete, DEC-34), `scripts/catalog/data/`, `e2e/test-results`, `*.mp3` fuera de `e2e/fixtures` | - | `git check-ignore` confirma | AR §12 | M |
| SC-GI-02 [NUEVO] | unit | `git check-ignore` confirma `scripts/catalog/admin-ui/dist`, `scripts/catalog/admin-ui/node_modules` y que `catalog.json.bak` / `catalog.json.tmp-*` dentro de `data/` quedan ignorados | - | Ignorados | DEC-37, DEC-38 | M |
| SC-GI-03 [NUEVO] | unit | Los scripts raíz (`install:all`, `test`, `typecheck`) incluyen `scripts/catalog/admin-ui` | Leer `package.json` | Presente (DEC-38) | DEC-38 | B |
| SC-ISO-01 [NUEVO] | unit | Aislamiento: nada de `frontend/` ni `backend/` importa de `scripts/catalog/admin*`; `admin-ui` no importa de `frontend/` salvo `shared/` | Análisis estático de imports | Sin imports cruzados prohibidos | DEC-38 | M |
| SC-ISO-02 [NUEVO] | unit (cond.) | El bundle de `frontend` (`vite build`) no contiene código ni cadenas del admin (`X-Admin-Token`, `/api/songs/`) | Build disponible | Ausentes | DEC-38 | B |

### 2.12 Servidor del admin (`scripts/catalog/src/admin/*`, `unit (int)`)

Entorno: servidor `node:http` real en `127.0.0.1:0`, `--data-dir` temporal con `catalog.json` y `work/` sintéticos. Cada test arranca con un catálogo de fixture limpio. Las peticiones incluyen por defecto `Host: 127.0.0.1:<puerto>`.

Seguridad (DEC-36):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-SRV-01 [NUEVO] | unit (int) | Solo escucha en `127.0.0.1`: `server.address().address === '127.0.0.1'`; no es `0.0.0.0` ni `::` | - | Cumple | DEC-36 | A |
| AD-SRV-02 [NUEVO] | unit (int) | `Host` permitido: `127.0.0.1:<puerto>` y `localhost:<puerto>` | - | 200 en `/api/session` y `/api/catalog` | DEC-36 | A |
| AD-SRV-03 [NUEVO] | unit (int) | `Host` ajeno -> `403 FORBIDDEN` en TODAS las rutas (`/`, `/assets/*`, `/api/session`, `/api/catalog`, `/api/songs/:id/audio`, mutaciones): `evil.com`, `evil.com:<puerto>`, `127.0.0.1.evil.com`, `localhost.evil.com:<puerto>`, `127.0.0.1:otroPuerto`, `[::1]:<puerto>`, `0.0.0.0:<puerto>`, vacío, ausente (HTTP/1.0), `Host` duplicado | Peticiones crudas con `net`/`http.request` | 403 y sin lectura/escritura de datos | DEC-36 | A |
| AD-SRV-04 [NUEVO] | unit (int) | `GET /api/session` devuelve `{token}` aleatorio por arranque: dos servidores -> tokens distintos; longitud mínima 128 bits (>=16 bytes en hex/base64) | - | Distintos y suficientes | DEC-36 | A |
| AD-SRV-05 [NUEVO] | unit (int) | `/api/session` no emite cabeceras CORS (`Access-Control-Allow-Origin` ausente) y un `OPTIONS` preflight con `Origin` ajeno no concede permiso | `Origin: http://evil.com` | Sin ACAO; el navegador no puede leer el token | DEC-36, DEC-38 | A |
| AD-SRV-06 [NUEVO] | unit (int) | Mutaciones (`PATCH /api/songs/:id`, `POST /api/games`, `PATCH /api/games/:id`) sin `X-Admin-Token` o con token incorrecto (vacío, de otro arranque, prefijo del correcto, mayúsculas cambiadas) | Fichero antes/después | 403 `FORBIDDEN`; `catalog.json` byte a byte igual y sin `.bak` | DEC-36 | A |
| AD-SRV-07 [NUEVO] | unit (int) | Mutación con token correcto y con `Origin` ajeno pero sin token válido | - | 403; con token y sin Origin -> 200 | DEC-36 | A |
| AD-SRV-08 [NUEVO] | unit (int) | Comparación del token en tiempo constante (se usa `timingSafeEqual` o equivalente) | Inspección/spy | Sin comparación `===` directa (revisión) | DEC-36 | B |
| AD-SRV-09 [NUEVO] | unit (int) | Mutaciones solo con `Content-Type: application/json`; `text/plain`, `application/x-www-form-urlencoded` o ausente | Token correcto | 4xx (`VALIDATION_ERROR`), sin cambios (impide formularios cruzados) | AR §8 | A |
| AD-SRV-10 [NUEVO] | unit (int) | Cuerpo > 16 KB y JSON malformado | Token correcto | 413 / 400 `VALIDATION_ERROR`; sin caída del servidor; sin cambios | AR §8 | A |
| AD-SRV-11 [NUEVO] | unit (int) | Métodos no soportados (`DELETE /api/songs/:id`, `PUT`) y rutas inexistentes | - | 404 `NOT_FOUND` o 405; sin efecto en disco | AR §6.1 | M |
| AD-SRV-12 [NUEVO] | unit (int) | Fugas: las respuestas de error no incluyen rutas absolutas del sistema de ficheros ni stack | Provocar errores | Mensajes genéricos | AR §8 | M |
| AD-SRV-13 [NUEVO] | unit (int) | `--data-dir` es respetado: tras operaciones de lectura/escritura/audio el directorio real `scripts/catalog/data` no se toca (centinela con mtime/hash) y todo `.bak`/`.tmp` aparece solo en el temporal | Centinela en el real | Real intacto | DEC-36 | A |
| AD-SRV-14 [NUEVO] | unit (int) | Servidor se cierra limpiamente (`close`) y libera el puerto; puerto ocupado -> error claro | - | Sin handles abiertos | AR §6.1 | M |

Catálogo del admin (`GET /api/catalog`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-CAT-01 [NUEVO] | unit (int) | Forma de la respuesta: `games[{id,name,songCount}]` y `songs[AdminSong]` con `durationSec`, `tooShort`, `hasSource`, `errors` | Fixture de 5 canciones | Campos y tipos correctos | AR §6.1 | A |
| AD-CAT-02 [NUEVO] | unit (int) | `tooShort` derivado (no persistido): 7,4 s -> true; 16,1 -> false; 16,0999 -> true; sin `durationSec` -> false; con `startSec` manual el cálculo cambia | - | Correcto; no existe campo `tooShort` en `catalog.json` | DEC-40 | A |
| AD-CAT-03 [NUEVO] | unit (int) | `hasSource`: true si existe `work/<youtubeId>.*`; false si no; ignora `.part`/`.ytdl`; id con `-` inicial | Ficheros en `work/` | Correcto | AR §6.1 | A |
| AD-CAT-04 [NUEVO] | unit (int) | `errors` por canción: `games: []` -> mensaje de `validateCatalog` en ESA canción; canción válida -> `[]`; una canción corta activa -> error de corta | Catálogo inválido | Errores asignados a la canción correcta | AR §6.1, DEC-26 | A |
| AD-CAT-05 [NUEVO] | unit (int) | Lectura tolerante: catálogo inválido NO hace fallar el endpoint (200 con errores) | `games:[]`, `youtubeId` malo | 200 | AR §6.1 | A |
| AD-CAT-06 [NUEVO] | unit (int) | `songCount` por juego (cuenta definida y documentada: todas las canciones que lo listan, activas o no); juego creado sin canciones -> 0 | Fixture | Cuenta correcta | AR §6.1 | M |
| AD-CAT-07 [NUEVO] | unit (int) | El servidor no cachea: tras una edición externa del fichero, la siguiente petición lo refleja | Editar fichero entre peticiones | Cambio visible | AR §6.1, DEC-37 | A |
| AD-CAT-08 [NUEVO] | unit (int) | `catalog.json` corrupto o inexistente | - | Error controlado (500/`SERVER_ERROR` con mensaje), sin sobrescribir | DEC-37 | M |

Edición de canciones (`PATCH /api/songs/:id`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-PAT-01 [NUEVO] | unit (int) | `title` cambia el título; el `id` y `clipKey` NO cambian (DEC-39); el resto de canciones y campos intactos | Token correcto | `AdminSong` actualizada; disco coherente | DEC-39 | A |
| AD-PAT-02 [NUEVO] | unit (int) | `title` vacío, solo espacios, no string, demasiado largo | - | 400 `VALIDATION_ERROR`; sin cambios | AR §6.1 | A |
| AD-PAT-03 [NUEVO] | unit (int) | `title` con espacios extremos se recorta; con unicode y comillas se conserva | - | Guardado correcto | AR §6.1 | M |
| AD-PAT-04 [NUEVO] | unit (int) | `games` con varios juegos existentes | - | Guardado en el orden recibido | RQ §4 | A |
| AD-PAT-05 [NUEVO] | unit (int) | `games` con juego inexistente | - | 400; sin cambios | AR §6.1 | A |
| AD-PAT-06 [RETIRADO, ver §0.4] | unit (int) | `games` con ids repetidos | - | 400; sin cambios | AR §6.1 | A |
| AD-PAT-07 [NUEVO] | unit (int) | `games: []` (vaciar juegos): comportamiento definido y documentado (se permite para poder dejarla pendiente y `errors` la marca, o se rechaza con 400) | - | Coherente con la decisión; nunca persiste un estado que el admin no pueda corregir | DEC-26 | M |
| AD-PAT-08 [NUEVO] | unit (int) | `games` no array o con elementos no string | - | 400 | AR §6.1 | M |
| AD-PAT-09 [NUEVO] | unit (int) | `enabled: true/false` en canción larga | - | Persistido | AR §6.1 | A |
| AD-PAT-10 [NUEVO] | unit (int) | **Activar una canción corta** (`enabled:true`) | Corta | `409 TOO_SHORT`; sin cambios en disco | DEC-40 | A |
| AD-PAT-11 [NUEVO] | unit (int) | Desactivar una canción corta o ya desactivada | - | 200 idempotente | DEC-40 | M |
| AD-PAT-12 [NUEVO] | unit (int) | Atomicidad de la petición: `{title:"X", enabled:true}` sobre una corta | - | 409 y NI el título cambia (todo o nada) | DEC-37, DEC-40 | A |
| AD-PAT-13 [NUEVO] | unit (int) | `reviewed: true/false` | - | Persistido | AR §6.1 | A |
| AD-PAT-14 [NUEVO] | unit (int) | `enabled` o `reviewed` no booleanos (`"true"`, 1, null) | - | 400 | AR §6.1 | M |
| AD-PAT-15 [NUEVO] | unit (int) | `startSec` en el cuerpo (con o sin otros campos) | - | Ignorado o rechazado (documentar cuál), nunca modifica `startSec` | RQ §4, AR §6.1 | A |
| AD-PAT-16 [NUEVO] | unit (int) | Campos no editables en el cuerpo (`id`, `clipKey`, `source`, `youtubeId`, `durationSec`, `tooShort`, `errors`, `__proto__`, `constructor`) | - | Ignorados; sin contaminación de prototipo; disco intacto | DEC-39, AR §8 | A |
| AD-PAT-17 [NUEVO] | unit (int) | Cuerpo vacío `{}` | - | 400 o no-op documentado | AR §6.1 | B |
| AD-PAT-18 [NUEVO] | unit (int) | Canción inexistente | - | 404 `NOT_FOUND`; el `id` con caracteres raros (`../`, `%00`) -> 404 | AR §6.1 | A |
| AD-PAT-19 [NUEVO] | unit (int) | Activar una canción con `games: []` | - | Comportamiento definido (permitido, `errors` la marca y `validate` falla; o 409/400); documentado | DEC-26 | M |
| AD-PAT-20 [NUEVO] | unit (int) | Primera escritura crea `catalog.json.bak` con el original; las siguientes no lo tocan; `catalog.json` queda válido y sin `.tmp` | - | Cumple | DEC-37 | A |

Juegos (`POST /api/games`, `PATCH /api/games/:id`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-GAM-01 [NUEVO] | unit (int) | Crear juego: `{name}` -> `{id,name}`; id = slug único; aparece en `GET /api/catalog` con `songCount:0` | - | Correcto | DEC-39 | A |
| AD-GAM-02 [NUEVO] | unit (int) | El id coincide con el que generaría `draft` para el mismo nombre (SC-ID-04) | - | Iguales | DEC-39 | A |
| AD-GAM-03 [NUEVO] | unit (int) | Nombres que producen el mismo slug (`"Ruby"` / `"RUBY!"`) | Juego `ruby` existente | Segundo recibe id con sufijo; o se rechaza por nombre duplicado (documentar) | DEC-39 | M |
| AD-GAM-04 [NUEVO] | unit (int) | Nombre vacío, solo espacios, no string, muy largo | - | 400 `VALIDATION_ERROR` | AR §6.1 | A |
| AD-GAM-05 [NUEVO] | unit (int) | Nombre duplicado de un juego existente (mayúsculas/espacios distintos) | - | 400; sin cambios | AR §6.1 | A |
| AD-GAM-06 [NUEVO] | unit (int) | Nombre que no produce slug (`???`) | - | Id de fallback válido o 400, nunca id vacío | SC-ID-03 | M |
| AD-GAM-07 [NUEVO] | unit (int) | Renombrar: `PATCH /api/games/:id {name}` cambia SOLO `name`; el `id` y las canciones que lo referencian no cambian | Canciones con ese juego | Disco: mismo id, nuevo name | DEC-39 | A |
| AD-GAM-08 [NUEVO] | unit (int) | Renombrar a nombre vacío o igual al de OTRO juego | - | 400; sin cambios | AR §6.1 | A |
| AD-GAM-09 [NUEVO] | unit (int) | Renombrar al mismo nombre que ya tiene | - | 200 idempotente | AR §6.1 | B |
| AD-GAM-10 [NUEVO] | unit (int) | Juego inexistente en `PATCH` | - | 404 | AR §6.1 | A |
| AD-GAM-11 [NUEVO] | unit (int) | `id` en el cuerpo de `PATCH /api/games/:id` | - | Ignorado; id inmutable | DEC-39 | A |
| AD-GAM-12 [NUEVO] | unit (int) | No existen endpoints de borrar o fusionar juegos | `DELETE /api/games/:id` | 404/405; sin efecto | AR §14 | M |
| AD-GAM-13 [NUEVO] | unit (int) | Un juego sin canciones activas deja de aparecer en el `/catalog` del backend (integración con DEC-32) | Catálogo del admin -> backend con `FsClipStore` | Ausente | DEC-32, DEC-39 | M |
| AD-GAM-14 [NUEVO] | unit (int) | Mutaciones de juegos requieren token (403 sin él) | - | 403; sin cambios | DEC-36 | A |

Audio (`GET /api/songs/:id/audio`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-AUD-01 [NUEVO] | unit (int) | Sin `Range`: `200`, `Content-Length` = tamaño real, `Accept-Ranges: bytes`, `Content-Type` `audio/*` según extensión (`.webm`, `.m4a`, `.opus`, `.mp3`) | Fuente de 1 MB | Cabeceras y bytes idénticos al fichero | RQ §4 | A |
| AD-AUD-02 [NUEVO] | unit (int) | `Range: bytes=0-` -> `206`, `Content-Range: bytes 0-N-1/N`, cuerpo completo | - | Correcto | RQ §4 | A |
| AD-AUD-03 [NUEVO] | unit (int) | `bytes=a-b` interior | a=100,b=199 | `206`, 100 bytes, `Content-Range: bytes 100-199/N` y bytes iguales | RQ §4 | A |
| AD-AUD-04 [NUEVO] | unit (int) | `bytes=a-` abierto y `b` mayor que el tamaño (se recorta a `N-1`) | - | `206` con recorte correcto | RQ §4 | A |
| AD-AUD-05 [NUEVO] | unit (int) | Sufijo `bytes=-K` (últimos K bytes); `K` mayor que el tamaño -> todo el fichero | - | `206` correcto | RQ §4 | A |
| AD-AUD-06 [NUEVO] | unit (int) | Rango fuera del fichero (`a >= N`) | - | `416` con `Content-Range: bytes */N` | AR §6.1 | A |
| AD-AUD-07 [NUEVO] | unit (int) | Rangos inválidos: `a > b`, `bytes=abc`, `bytes=`, `items=0-1`, multi-rango `bytes=0-1,5-6` | - | `416` (o `200` completo para multi-rango); sin caída y sin lectura fuera de límites; decisión documentada | AR §6.1 | M |
| AD-AUD-08 [NUEVO] | unit (int) | Fichero de 0 bytes | - | Respuesta definida (200 vacío o 416), sin excepción | AR §6.1 | B |
| AD-AUD-09 [NUEVO] | unit (int) | Canción inexistente / sin fuente en `work/` | - | 404 `NOT_FOUND` | AR §6.1 | A |
| AD-AUD-10 [NUEVO] | unit (int) | Localización por id vía catálogo, nunca por ruta del cliente: `/api/songs/..%2F..%2Fetc%2Fpasswd/audio`, `%2e%2e`, `\`, `%00` | Fichero centinela fuera de `work/` | 404; el centinela no se lee | AR §8 | A |
| AD-AUD-11 [NUEVO] | unit (int) | `youtubeId` hostil en un catálogo corrupto (`../../centinela`, `a/b`) | Catálogo tolerante cargado | No sale de `work/`; 404 | AR §8 | A |
| AD-AUD-12 [NUEVO] | unit (int) | `youtubeId` que empieza por `-` (p. ej. `-BRQ_XVwg-M`) se sirve y se resuelve | Fichero `work/-BRQ_XVwg-M.webm` | 200 | AR §8 | A |
| AD-AUD-13 [NUEVO] | unit (int) | Dos ficheros candidatos (`<id>.webm` y `<id>.webm.part`) | - | Sirve el completo, ignora `.part`/`.ytdl` | DEC-16 | M |
| AD-AUD-14 [NUEVO] | unit (int) | Streaming: fuente de 50 MB (fichero disperso) responde sin cargar todo en memoria; rango final correcto | Fichero grande | Memoria acotada (RSS no crece ~50 MB) o `createReadStream` espiado | AR §6.1 | M |
| AD-AUD-15 [NUEVO] | unit (int) | El audio NO exige `X-Admin-Token` (un `<audio>` no puede enviarlo) pero SÍ exige `Host` correcto | - | 200 con Host válido; 403 con Host ajeno | DEC-36 | A |
| AD-AUD-16 [NUEVO] | unit (int) | Cliente que corta la conexión a mitad: el servidor no queda colgado ni lanza error no controlado | Abort | Sigue sirviendo peticiones | AR §6.1 | M |

Estáticos y sesión:

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-STA-01 [NUEVO] | unit (int) | `GET /` sirve `admin-ui/dist/index.html`; `GET /assets/*` sirve ficheros con `Content-Type` correcto | `dist` de fixture | 200 | DEC-38 | A |
| AD-STA-02 [NUEVO] | unit (int) | Path traversal: `/assets/../../package.json`, `/%2e%2e/`, `/assets/%2e%2e%2f`, ruta absoluta | Centinela fuera de `dist` | 404/403; no se lee | AR §8 | A |
| AD-STA-03 [NUEVO] | unit (int) | `data/` (catálogo, `work/`) nunca se sirve como estático (`/catalog.json`, `/work/x.webm`) | - | 404 | AR §8 | A |
| AD-STA-04 [NUEVO] | unit (int) | `dist` ausente | Sin `dist` | Mensaje claro, sin caída | DEC-38 | M |
| AD-STA-05 [NUEVO] | unit (int) | Ruta de la UI desconocida (`/foo`) | - | 404 o `index.html` (documentar); las `/api/*` desconocidas siempre 404 JSON | AR §6.1 | B |

CLI (`npm run cli -- admin`):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AD-CLI-01 [NUEVO] | unit | `admin` ejecuta `vite build` de `admin-ui` antes de servir (spawn simulado) y sirve `admin-ui/dist` | Mock spawn | Se invoca el build; si falla, termina con código != 0 y no arranca | DEC-38 | A |
| AD-CLI-02 [NUEVO] | unit | Faltan dependencias de `admin-ui` | `node_modules` ausente | Termina con mensaje que contiene `npm --prefix scripts/catalog/admin-ui install` | DEC-38 | A |
| AD-CLI-03 [NUEVO] | unit | `--port`: por defecto 5180; válido, `0`, `abc`, `-1`, `70000` | - | Acepta rango válido; inválido -> error de uso | AR §6.1 | M |
| AD-CLI-04 [NUEVO] | unit | `--data-dir`: por defecto `scripts/catalog/data`; ruta relativa/absoluta; inexistente -> error claro (o se documenta que se crea) | Dir temporal | Usa la ruta pedida | DEC-36 | A |
| AD-CLI-05 [NUEVO] | unit | Imprime la URL `http://127.0.0.1:<puerto>`; no abre navegador ni red | Spy `open`/`child_process` | Solo log | AR §6.1 | M |
| AD-CLI-06 [NUEVO] | unit | Puerto ocupado | Otro servidor en el puerto | Error claro, código != 0 | AR §6.1 | M |
| AD-CLI-07 [NUEVO] | unit | Señal `SIGINT` cierra el servidor y espera a la cola de `catalogStore` | - | Sin escrituras a medias | DEC-37 | M |

### 2.13 UI del admin (`scripts/catalog/admin-ui`, vitest + Testing Library; prefijo `AU-`)

Filtros y búsqueda (módulo puro, AR §6.1):

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AU-FIL-01 [NUEVO] | unit | Filtro por juego (varios juegos por canción) | Catálogo cliente | Canciones que listan ese juego | AR §6.1 | A |
| AU-FIL-02 [NUEVO] | unit | Activadas / desactivadas / todas | - | Correcto | AR §6.1 | A |
| AU-FIL-03 [NUEVO] | unit | Revisadas / pendientes / todas | - | Correcto | AR §6.1 | A |
| AU-FIL-04 [NUEVO] | unit | Filtro "cortas" (`tooShort`) y "con errores" (`errors.length>0`) | - | Correcto | DEC-40 | A |
| AU-FIL-05 [NUEVO] | unit | Texto sobre título, nombre de juego y `videoTitle`; sin distinguir mayúsculas ni acentos | "pokemon" vs "Pokémon" | Coincide | AR §6.1, DEC-17 | A |
| AU-FIL-06 [NUEVO] | unit | Combinación AND de varios filtros y texto | - | Intersección | AR §6.1 | A |
| AU-FIL-07 [NUEVO] | unit | Texto con caracteres especiales de regex `(`, `*`, `\`; vacío; solo espacios | - | Sin excepción | AR §6.1 | M |
| AU-FIL-08 [NUEVO] | unit | Sin resultados; catálogo vacío | - | Lista vacía, sin error | AR §6.1 | M |
| AU-FIL-09 [NUEVO] | unit | 1500 canciones | Dataset generado | < 100 ms | AR §6.1 | B |
| AU-FIL-10 [NUEVO] | unit | El módulo es puro (no muta la entrada) | `Object.freeze` | Sin mutación | AR §6.1 | B |
| AU-FIL-11 [NUEVO] | unit | Texto con palabras de juego y título a la vez ("ruby town"); combinación sin coincidencias ("diamond littleroot") → vacío | Catálogo de prueba | Según caso | DEC-17 | A |

Interfaz:

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| AU-UI-01 [NUEVO] | unit | Lista las canciones con título, juegos, estado activa/desactivada y revisada/pendiente | API simulada | Visibles | RQ §4 | A |
| AU-UI-02 [NUEVO] | unit | Al cargar, obtiene el token con `GET /api/session` (mismo origen) y lo envía como `X-Admin-Token` en TODAS las mutaciones; las lecturas no lo exigen | `fetch` simulado | Cabecera presente | DEC-38 | A |
| AU-UI-03 [NUEVO] | unit | Falla `/api/session` o la mutación responde 403 | Mock | Mensaje de error claro; reintenta obtener sesión una vez; sin bucle | DEC-36 | M |
| AU-UI-04 [NUEVO] | unit | Canción corta: marca visible "Demasiado corta (7,4 s)" (decimal con coma, 1 decimal) y control "activar" deshabilitado; pulsar no envía `PATCH` | `tooShort:true`, 7,4 s | Marca y bloqueo | DEC-40, RQ §4 | A |
| AU-UI-05 [NUEVO] | unit | Si el servidor responde `409 TOO_SHORT`, se muestra el mensaje y el estado vuelve a desactivada | Mock 409 | Revertido | DEC-40 | A |
| AU-UI-06 [NUEVO] | unit | Desactivar una corta ya desactivada no está disponible; una larga se activa/desactiva con `PATCH {enabled}` | - | Correcto | AR §6.1 | A |
| AU-UI-07 [NUEVO] | unit | Editar título: envía `PATCH {title}`; título vacío bloqueado en cliente sin petición; error 400 mostrado | - | Correcto | AR §6.1 | A |
| AU-UI-08 [NUEVO] | unit | Editar juegos: selección múltiple, envía `PATCH {games:[...]}`; el selector solo ofrece juegos existentes | - | Correcto | RQ §4 | A |
| AU-UI-09 [NUEVO] | unit | Crear juego: `POST /api/games {name}`; el nuevo aparece como opción; nombre vacío o duplicado muestra error | - | Correcto | DEC-39 | A |
| AU-UI-10 [NUEVO] | unit | Renombrar juego: `PATCH /api/games/:id {name}`; el id no cambia en las canciones; error de duplicado mostrado | - | Correcto | DEC-39 | A |
| AU-UI-11 [NUEVO] | unit | Marcar revisada / pendiente | - | `PATCH {reviewed}` | AR §6.1 | A |
| AU-UI-12 [NUEVO] | unit | NO existe ningún campo, botón ni atajo para editar `startSec` ("usar posición actual"); ningún `PATCH` lo incluye | Barrido de todas las acciones | Ausente | RQ §4, AR §6.1 | A |
| AU-UI-13 [NUEVO] | unit | No existen acciones de borrar/fusionar juegos ni de oír los 6 fragmentos | - | Ausentes | AR §14 | M |
| AU-UI-14 [NUEVO] | unit | Reproductor del tema completo: `<audio controls>` con `src` = `/api/songs/<id>/audio` (id codificado); permite seek (control nativo); sin `build` | `hasSource:true` | `src` correcto | RQ §4 | A |
| AU-UI-15 [NUEVO] | unit | `hasSource:false`: reproductor deshabilitado con aviso "sin fuente descargada" | - | Sin `<audio>` o deshabilitado | AR §6.1 | A |
| AU-UI-16 [NUEVO] | unit | Errores por canción (`errors[]`, p. ej. `games: []`) visibles y filtrables | Canción inválida | Marca de error con el mensaje | AR §6.1, DEC-26 | A |
| AU-UI-17 [NUEVO] | unit | Tras cada cambio recarga la lista (`GET /api/catalog`); al recuperar el foco de la ventana (`focus`/`visibilitychange`) también | Eventos simulados | Recarga | AR §6.1 | A |
| AU-UI-18 [NUEVO] | unit | Respuesta 4xx/5xx o fallo de red en una edición: mensaje, estado de la fila revertido, sin pérdida del resto | Mock | Coherente | AR §6.1 | A |
| AU-UI-19 [NUEVO] | unit | Edición en curso y recarga por foco: no pisa el texto que el usuario está escribiendo en otra fila | - | Se conserva el borrador | AR §6.1 | M |
| AU-UI-20 [NUEVO] | unit | Interfaz en español; títulos y juegos mostrados tal cual | - | Aserciones | RQ §6 | B |
| AU-UI-21 [NUEVO] | unit | Accesibilidad básica: botones con nombre, estado "desactivado" anunciado con `aria-disabled`/`disabled`, foco visible | - | Cumple | RQ §6 | B |
| AU-UI-22 [NUEVO] | unit | Contadores por juego (`songCount`) y total mostrados | - | Correctos | AR §6.1 | M |

### 2.14 Frontend - juego (lógica, apertura del diario, filtro)

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-GAM-01 | unit | Reductor: nueva -> miss -> skip -> win | `GameView` simuladas | Refleja la última vista | RQ §3 | A |
| FE-GAM-02 | unit | Skip y buscador deshabilitados en `won`/`lost` | Terminada | Sin acciones | CA-7 | A |
| FE-GAM-03 | unit | Solución solo con `solution` presente | playing / won | Oculta / visible | CA-1, CA-7 | A |
| FE-GAM-04 | unit | Duración mostrada = `clipSeconds[attempt]` | - | Correcta | CA-2 | M |
| FE-GAM-05 | unit | Se guarda siempre el último token | - | Último | AR §4 | A |
| FE-GAM-06 | unit | `game` -> "juego acertado"; `miss` -> "juego incorrecto" | - | Textos | CA-3 | A |
| FE-GAM-07 | unit | `TOKEN_INVALID` al recuperar: descarta y ofrece partida nueva | API mock | `notice.kind = 'invalid-token'` | CL | A |
| FE-GAM-08 | unit | `GAME_OVER` desde servidor: refresca con `state` | API mock | Coherente | CA-7 | M |
| FE-GAM-09 [AJ] | unit | 429: `notice.kind = 'rate-limited'`, respeta `Retry-After`, sin bucle | Mock | Mensaje y botón reactivado | DEC-28 | M |
| FE-GAM-10 | unit | Ilimitado: cambiar filtro con partida en curso no la altera; la siguiente usa el nuevo | - | Correcto | CL | A |
| FE-GAM-11 | unit | Diario terminado en `daily:<hoy>`: resultado, sin botón jugar y **cero llamadas** a la API | Storage sembrado | 0 llamadas | CL, AR §7 | A |
| FE-GAM-12 | unit | Diario sin estado: `POST /games` con `{mode:"daily"}`; si `date` difiere, manda la del servidor | Reloj desviado | Según AR §7 | AR §7 | A |
| FE-GAM-13 | unit | Diario en curso: `POST /games/state`; `TOKEN_INVALID` -> partida nueva | - | Correcto | AR §7 | A |
| FE-GAM-14 | unit | Ilimitado en curso se recupera; al terminar se limpia | - | OK | RQ §3 | M |
| FE-GAM-15 | unit | Día nuevo: `daily:<ayer>` no bloquea `daily:<hoy>` | - | Jugable | CL | A |
| FE-GAM-16 | unit | El diario no muestra filtro ni lee `heardle:filter` | - | Sin `games` en la petición | RQ §3 | A |
| FE-GAM-17 | unit | Fecha de hoy con `shared/date.ts` en Madrid | TZ = Tokyo | Fecha Madrid | CL | A |
| FE-GAM-18 [AJ] | unit | `ALREADY_GUESSED`: `notice.kind='already-guessed'`, intentos/`results`/token intactos | Mock 409 | Aviso, sin cambios | DEC-28, DEC-18 | A |
| FE-GAM-19 | unit | Tras recargar, los `guesses` vuelven y se aplican al buscador | - | Marcados | DEC-18 | A |
| FE-FIL-01 | unit | Ilimitado: filtro vacío deshabilita "Empezar" y muestra `role="alert"` "Elige al menos un juego para poder empezar." | Filtro `[]` | `disabled`; 0 llamadas | DEC-28 | A |
| FE-FIL-02 | unit | Ilimitado con un juego: cuerpo `{mode:"unlimited",games:[id]}` | - | Correcto | RQ §3 | A |
| FE-FIL-03 | unit | Filtro persiste en `heardle:filter` | - | Restaurado | RQ §3 | A |
| FE-FIL-04 | unit | Ids inexistentes se descartan | - | Sin romper | RQ §3 | M |
| FE-FIL-05 | unit | `localStorage` corrupto | Basura | Defaults | AR §7 | A |
| FE-FIL-06 | unit | `EMPTY_FILTER` -> `notice.kind='empty-filter'`; `UNKNOWN_GAME` -> `'unknown-game'` | Mock | Mensajes | DEC-28 | M |
| FE-FIL-07 | unit | Filtro vacío no bloquea el diario | - | Jugable | CA-4 | A |

### 2.15 Frontend - buscador, compartir, estadísticas, red, audio

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-SRC-01 | unit | Búsqueda por título | - | Coincidentes | DEC-17 | A |
| FE-SRC-02 | unit | Búsqueda por nombre de juego | "ruby" | Todas las del juego | DEC-17 | A |
| FE-SRC-03 | unit | Sin mayúsculas ni acentos | - | Coincide | DEC-17 | A |
| FE-SRC-04 | unit | Sobre TODO el catálogo | Filtro={A} | Aparece canción de B | DEC-17 | A |
| FE-SRC-05 | unit | Cada opción muestra título y todos sus juegos | - | Visibles | DEC-17 | M |
| FE-SRC-06 [RETIRADO, ver §0.4] | unit | Multi-juego una vez | - | Sin duplicados | DEC-17 | A |
| FE-SRC-07 | unit | Seleccionar envía solo `songId` | Spy | `{token,songId}` | DEC-17 | A |
| FE-SRC-08 | unit | Sin resultados / vacío / espacios | - | Sin errores | DEC-17 | M |
| FE-SRC-09 | unit | Caracteres de regex | - | Sin excepción | DEC-17 | M |
| FE-SRC-10 | unit | 1500 canciones | - | < 50 ms | AR §16 | B |
| FE-SRC-11 | unit | No se envía texto libre | - | Solo opciones | DEC-17 | M |
| FE-SRC-12 | unit | Canciones de `guesses` marcadas y no seleccionables (clic y Enter) | `guesses=[x,y]` | Sin petición | DEC-18 | A |
| FE-SRC-13 | unit | Una intentada sigue apareciendo marcada | - | Visible y deshabilitada | DEC-18 | A |
| FE-SRC-14 | unit | Marcado por `songId` | Dos del mismo juego | Solo la intentada | DEC-18 | M |
| FE-SRC-15 | unit | Tras skip no se marca; tras guess se añade | - | Correcto | DEC-18 | M |
| FE-SRC-16 [NUEVO] | unit | Juego y texto a la vez: "ruby town" devuelve las canciones de Ruby con "town"; "ruby twinleaf" no devuelve nada | `mkCatalog()` | Según caso | DEC-17 | A |
| FE-SRC-17 [NUEVO] | unit | Teclado en el buscador: ↓ sin activa va a la primera, ↑ sin activa a la última, ambas dan la vuelta; la opción activa se desplaza a la vista (`scrollIntoView({block:"nearest"})`) | `mkCatalog()`, búsqueda "town" | Opción activa y scroll correctos | RQ §6 (accesibilidad) | M |
| FE-SRC-18 [NUEVO] | unit | El buscador muestra todos los resultados (60 coincidencias → 60 opciones) y no hay aviso "y N más" | Catálogo de 60 canciones | Todas visibles en la lista con scroll | DEC-48 | M |
| FE-SHR-01 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-SHR-02 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-SHR-03 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-SHR-04 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-SHR-05 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-SHR-06 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-01 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-02 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-03 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-04 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-05 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-06 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-07 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-08 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-09 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-10 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-11 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-STA-12 [MOD, ver §0.1] | unit | Partida EN CURSO: ninguna clave de `localStorage` (ni `unlimited` ni `daily:<fecha>`) contiene título, id ni **`youtubeId`** de la objetivo. Una vez terminada, `DailyRecord.view` sí puede contener `solution.youtubeId` (es post-final) | En curso / terminada | En curso: sin coincidencias; terminada: solo dentro de `solution` | CA-1, DEC-41 | A |
| FE-API-01 | unit | Arranque en frío: backoff y recuperación | Fake timers | Hasta ~90 s | DEC-14 | A |
| FE-API-02 | unit | Tras ~90 s: error con reintento | - | Botón funcional | CA-8 | A |
| FE-API-03 | unit | Una sola llamada a `/health`; sin `setInterval` de ping; sin `StrictMode` que la duplique (DEC-33) | Spy | 1 llamada | DEC-14, DEC-33 | A |
| FE-API-04 | unit | Sin reintentos de POST de acción tras 4xx | - | Según política | DEC-14 | M |
| FE-API-05 | unit | Sin reintento automático tras `ALREADY_GUESSED` ni `GAME_OVER` | - | 1 petición | DEC-18 | M |
| FE-AUD-01 | unit | Clip: `fetch` a Blob y `createObjectURL`; un fetch por intento | - | 1 petición | DEC-05 | A |
| FE-AUD-02 [MOD] | unit | `audio.play()` síncrono en el handler del clic, también con la suscripción `subscribe` activa (la barra no retrasa el `play`) | Mock Audio | Misma pila del evento | DEC-05, DEC-42 | A |
| FE-AUD-03 | unit | Clip 410/404: nuevo ticket y reintento una vez | - | Recupera | DEC-04 | M |
| FE-AUD-04 | unit | `revokeObjectURL` al cambiar de intento | Spy | Sin fugas | DEC-05 | B |
| FE-UI-01 | unit | Textos en español; títulos y juegos tal cual | - | Aserciones | RQ §6 | B |

### 2.15b Frontend - rediseño visual (DEC-46; rama `feature/rediseno-ui`)

Marcas de la rama: [NUEVO] caso nuevo; [MOD] caso cuyo contenido cambia por el diseño. Todos con vitest + Testing Library; la onda, los colores y el logo no necesitan navegador.

| ID | Nivel | Descripción | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|
| FE-DSN-01 [NUEVO] | unit | Mapa de colores por juego: conocidos usan el mapa; un juego nuevo recibe un color de la paleta de reserva, estable por id; ids raros (`__proto__`, vacío) no lanzan | Color válido siempre | DEC-46 | A |
| FE-DSN-02 [NUEVO] | unit | `shortGameName` quita el prefijo "Pokémon " (con o sin acento) | Nombre corto | DEC-46 | M |
| FE-DSN-03 [NUEVO] | unit | `formatClock` (m:ss truncado, sin NaN) y `formatDayLabel` ("06 OCT") | Formatos exactos | DEC-46 | M |
| FE-DSN-04 [NUEVO] | unit | Logo: h1 en una línea con fuente del logo; `@font-face` con el .ttf del repo; contorno azul; el .ttf es TrueType con glifo "é"; licencia en README | Cumple | DEC-46 | A |
| FE-DSN-05 [NUEVO] | unit | `index.html` carga Rubik, Space Mono y Lilita One | Cumple | DEC-46 | B |
| FE-DSN-06..08 [NUEVO] | unit | Player: "INTENTO n/6", lectura `m:ss / m:ss`, escala de segundos, lente y 3 luces; botón play con nombre "Reproducir N s"/"Pausar"/"Cargando audio..."; "Saltar +N s" y "(último intento)"; táctil ≥ 44 px; error de audio con reintento; sin NaN | Cumple | DEC-46, RQ §6 | A |
| FE-DSN-09 [NUEVO] | unit | Resultado: "¡ACERTASTE EN EL INTENTO n!" / "¡LA CANCIÓN SE ESCAPÓ!", REGISTRADA / SIN INTENTOS, "Era…" solo en derrota, fila de 6 marcas con descripción accesible, botón rojo del embed | Cumple | DEC-46, DEC-41 | A |
| FE-DSN-10 [NUEVO] | unit | Historial: solo los intentos usados al terminar (01..n); icono y etiqueta accesible por resultado; juego sin prefijo y "juego correcto" solo en ámbar; en curso, fila "Escuchando N s…" y pendientes con su duración | Cumple | DEC-46 | A |
| FE-DSN-11 [NUEVO] | unit | Cabecera: logo h1, subtítulo "RETO DEL DÍA · dd MES" / "MODO LIBRE" y conmutador Diario/Libre (nombre accesible "Partida libre") | Cumple | DEC-46 | A |
| FE-DSN-12 [NUEVO] | unit | Leyenda "CLAVE" oculta en móvil (`hidden`) y visible en escritorio (`lg:flex`) | Cumple | DEC-46 | M |
| FE-DSN-12 [MOD] | unit | La leyenda (CLAVE) se ve solo desde xl (1280 px): entre 1024 y 1279 px su columna se cede al historial, que con pistas activas truncaba los títulos | `App` renderizada | Clases `hidden xl:flex` | DEC-46 | M |
| FE-DSN-13 [NUEVO] | unit | Filtro del modo libre: "n DE m JUEGOS", contador por juego y total de canciones distintas, cuadradito de color, sin total con el filtro vacío | Cumple | DEC-46 | A |
| FE-WF-01..08 [NUEVO] | unit | `computePeaks`: 48 barras; solo lee muestras con índice < `unlockedSec * sampleRate` (Proxy que registra lecturas); el audio posterior no cambia el resultado; normalización; buffer corto; varios canales; silencio; sin muestras → null; `unlockedSec` ≤ 0 | Cumple | DEC-46, CA-1 | A |
| FE-WF-09..12 [NUEVO] | unit | Componente de onda: picos reales en las desbloqueadas y planas en las bloqueadas; neutra sin datos; barras reproducidas distintas; decorativa y sin NaN | Cumple | DEC-46 | A |
| FE-WF-13 [NUEVO] | unit | `ClipPlayer.onDecoded`: entrega solo el buffer del intento actual; suelta el anterior (null) al preparar otro y tras un prepare fallido; en la ruta `<audio>` siempre null | Cumple | DEC-46 | A |
| FE-WF-14 [NUEVO] | unit | Tablero: con buffer decodificado con muestras la onda es real y solo normaliza con el audio desbloqueado; sin muestras (jsdom) es neutra | Cumple | DEC-46 | A |
| FE-DSN-07 (tablero) [NUEVO] | unit | Pulsar play y luego "Pausar" para la fuente sin cerrar el contexto | Cumple | DEC-46 | M |
| FE-PLY-11..15 [NUEVO] | unit | Pausa y reanudación con Web Audio: `pause()` para la fuente y emite la posición; `play()` relanza con `start(t0, offset)` y fundido recalculado para el tramo restante; doble pausa y pausa sin sonar no hacen nada; al acabar el fragmento, cambiar de intento, `stop()` u offset < 50 ms del final → desde 0; si ya suena, `play()` reinicia; una interrupción del sistema cuenta como pausa | Cumple | DEC-45, DEC-46 | A |
| FE-PLY-18 [NUEVO] | unit | `pause()` sin chasquido: rampa de ganancia a 0 en 10 ms y `stop(t + 0.01)`; la posición guardada es la de pulsar; la fuente apagada libera nodos sin emitir ni cortar la reanudación; dentro del fundido final no hay rampa nueva | Cumple | DEC-45, DEC-46 | M |
| FE-PLY-19 [NUEVO] | unit | Sonando, un `prepare` nuevo emite `{playing:false, positionSec:0}` al empezar y cancela el rAF mientras se descarga | Cumple | DEC-46 | M |
| FE-DSN-16 [NUEVO] | unit | Botón rojo: "Reanudar" en pausa a mitad de clip, "Reproducir N s" en 0 o al acabar, "Pausar" sonando | Cumple | DEC-46 | M |
| FE-PLY-16 [NUEVO] | unit | Ruta `<audio>`: `pause()`/`play()` sin reiniciar `currentTime`; `ended` y cambio de intento reinician | Cumple | DEC-46 | A |
| FE-PLY-17 [NUEVO] | unit | Tablero: Pausar deja barra y lectura en la posición pausada; Reproducir continúa desde ahí; nombre accesible Reproducir N s / Pausar | Cumple | DEC-46 | A |
| FE-WA-18 [MOD] | unit | La interfaz pública del player pasa a `prepare/play/pause/stop/subscribe/dispose` (`pause` es nuevo) | Cumple | DEC-46 | M |
| FE-DSN-04 / FE-DSN-05 [MOD] | unit | La fuente del logo documenta origen y estado de la licencia en el README (decisión del usuario); Rubik, Space Mono y Lilita One se sirven desde `@fontsource/*` y `index.html` no llama a Google Fonts | Cumple | DEC-46 | M |
| FE-DSN-14 [NUEVO] | unit | `AttemptList` y `SongSearch` no recalculan los índices del catálogo con las mismas props (repintado por frame) | Cumple | DEC-46 | M |
| FE-DSN-15 [NUEVO] | unit | El conmutador Diario/Libre y sus ancestros no usan `overflow-hidden` (aro de foco no recortado); extremos redondeados en los botones | Cumple | DEC-46, WCAG 2.4.7 | A |
| FE-GAM-04 / AttemptList [MOD] | unit | La fila de intento actual ya no dice "Intento 4" sino "Escuchando 7 s…" (cambio deliberado del diseño; el "INTENTO n/6" pasa a la carcasa del reproductor) | Cumple | DEC-46 | M |

Textos que el diseño cambia sin tocar tests: el botón "Partida libre" pasa a mostrar "Libre" (mantiene el nombre accesible "Partida libre"); la etiqueta "juego acertado" sigue siendo la accesible (`sr-only`) y en pantalla se lee "juego correcto".

### 2.11b Scripts de catálogo - silencio inicial (DEC-47)

| ID | Nivel | Descripción | Resultado esperado | P |
|---|---|---|---|---|
| SC-SIL-01 [NUEVO] | unit | `parseLeadingSilence`: silencio que empieza en 0 (o -0,001) → `silence_end`; que no empieza al principio → 0; sin silencedetect → 0; sin fin → 10 s; solo el primero; acotado a [0, 10] | Cumple | A |
| SC-SIL-02 [NUEVO] | unit | Argumentos: `-t 10`, `silencedetect=noise=-50dB:d=0.1`, ruta absoluta (ids con "-"), salida nula, ruta con espacios/comillas como un solo argumento | Cumple | A |
| SC-SIL-03 [NUEVO] | unit | `measureLeadingSilence` lee stderr del runner; ffmpeg ausente → error que lo nombra | Cumple | M |
| SC-SIL-04 [NUEVO] | unit | `autoStartSec`: floor a 0,01 s menos 0,05 s, nunca negativo (0,47→0,42; 0,05→0; 10→9,95) | Cumple | A |
| SC-SIL-05 [NUEVO] | unit | `applyLeadingSilence`: `startSec` 0 sin marca → automático; `startSecManual` o `startSec` ≠ 0 → intacto (se guarda la medida); una sola vez | Cumple | A |
| SC-SIL-06..07 [NUEVO] | unit | `draft`: fija `startSec` de las nuevas; idempotente; existentes con `startSec` 0 pasan a automático; manual respetado; fallo de medida no aborta; la regla de corta usa el `startSec` efectivo | Cumple | A |
| SC-SIL-08..09 [NUEVO] | unit | `build`: mide las activas sin medida y recompila con el nuevo `startSec`; segundo build no mide ni corta; borrar la medida fuerza otra; manual respetado; desactivadas y cortas no se miden; fallo de silencedetect no aborta | Cumple | A |
| SC-SIL-10 [NUEVO] | unit (cond.) | Con ffmpeg real sobre ficheros sintéticos: ~0,5 s y ~2,4 s medidos (±50 ms), tono sin silencio → 0, silencio > 10 s → 10, nombre con "-" y espacios | Cumple (se omite sin ffmpeg) | A |
| SC-DR-03 / SC-BU-05 / SC-CLP-01 [MOD] | unit | Las entradas ahora también reciben `source.leadingSilenceSec` (0 con el runner simulado) y la cuenta de llamadas a ffmpeg de `build` excluye la medición del silencio | Cumple | M |

### 2.16 Frontend - barra de reproducción (DEC-42)

`ClipProgressBar({ clipSeconds, unlockedSec, positionSec, playing })`; escala fija 16 s; marcas en 1/2/4/7/11 s y fin en 16.

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-BAR-01 [NUEVO] | unit | Posición de las marcas sobre la escala lineal de 16 s | `clipSeconds=[1,2,4,7,11,16]` | Marcas en 6,25 %, 12,5 %, 25 %, 43,75 %, 68,75 % y 100 % (tolerancia ±0,1 %) | DEC-42, RQ §3 | A |
| FE-BAR-02 [NUEVO] | unit | Zona desbloqueada para cada intento 0..5 | `unlockedSec = clipSeconds[a]` | Ancho = `unlockedSec/16` (6,25 %, 12,5 %, 25 %, 43,75 %, 68,75 %, 100 %) | DEC-42 | A |
| FE-BAR-03 [NUEVO] | unit | La parte bloqueada se distingue de la desbloqueada (clase/atributo `data-locked` o estilo distinto) y la desbloqueada del intento actual se distingue de los segmentos anteriores si el diseño lo hace | - | Diferenciación comprobable por DOM | DEC-42, RQ §3 | A |
| FE-BAR-04 [NUEVO] | unit | Cabezal en `positionSec` dentro de la zona (p. ej. 3 s con 7 s desbloqueados) | `positionSec=3` | Posición 18,75 % | DEC-42 | A |
| FE-BAR-05 [NUEVO] | unit | El cabezal se limita a la zona desbloqueada: `positionSec` mayor que `unlockedSec` (retardo del codificador MP3, p. ej. 1,04 con 1 s) | `positionSec=1.04`, `unlockedSec=1` | Cabezal en 6,25 % (nunca fuera) | DEC-42 | A |
| FE-BAR-06 [NUEVO] | unit | Valores límite de `positionSec`: negativo, `NaN`, `Infinity`, 0 | - | 0 % / tope; sin excepción ni NaN en estilos | DEC-42 | A |
| FE-BAR-07 [NUEVO] | unit | Accesibilidad: `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=unlockedSec`, `aria-valuenow` = posición limitada | - | Atributos correctos | DEC-42 | A |
| FE-BAR-08 [NUEVO] | unit | `playing=false`: el cabezal queda en reposo (0 o última posición según diseño, documentado) y no hay animación | - | Coherente | DEC-42 | M |
| FE-BAR-09 [NUEVO] | unit | La barra solo usa datos públicos: sus props son `clipSeconds`, `unlockedSec`, `positionSec`, `playing`; no recibe `solution` ni token | Inspección de props | Sin datos de la canción | DEC-42, CA-1 | M |
| FE-BAR-10 [NUEVO] | unit | Cambio de intento (skip): la zona desbloqueada crece y el cabezal se reinicia | Re-render con nuevos props | Correcto | DEC-42 | A |
| FE-BAR-11 [NUEVO] | unit | Con la partida terminada (`attempt=6`/`status!=='playing'`) la barra no se muestra o queda en estado final (documentar); no falla con `clipSeconds[6]` indefinido | status `won`/`lost` | Sin excepción | DEC-42 | M |
| FE-BAR-12 [NUEVO] | unit | Modo oscuro y móvil: la barra usa clases/variables de tema y no desborda (sin ancho fijo en px) | jsdom | Sin estilos de ancho fijo | RQ §6 | B |

`ClipPlayer.subscribe(listener) -> unsubscribe`, con `requestAnimationFrame` falso y audio falso:

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-PLY-01 [NUEVO] | unit | Al reproducir, el listener recibe `{playing:true, positionSec}` en cada frame con `positionSec = audio.currentTime` | Audio falso | Emisiones por frame | DEC-42 | A |
| FE-PLY-02 [NUEVO] | unit | Al pausar y al terminar (`ended`) emite `{playing:false, positionSec}` y detiene el `requestAnimationFrame` | - | Emisión final y 0 frames pendientes | DEC-42 | A |
| FE-PLY-03 [NUEVO] | unit | `unsubscribe` deja de emitir y cancela el frame pendiente; llamarlo dos veces no falla | - | Sin fugas | DEC-42 | A |
| FE-PLY-04 [NUEVO] | unit | Varios listeners reciben las mismas emisiones; quitar uno no afecta al otro | - | Correcto | DEC-42 | M |
| FE-PLY-05 [NUEVO] | unit | Sin reproducción no hay `requestAnimationFrame` activo (no consume CPU) | Spy rAF | 0 frames | DEC-42 | M |
| FE-PLY-06 [NUEVO] | unit | Repetir el clip (segunda reproducción) reinicia las emisiones desde 0 | - | `positionSec` desde 0 | DEC-42 | M |
| FE-PLY-07 [NUEVO] | unit | Cambio de intento: al cargar un clip nuevo el listener recibe `{playing:false, positionSec:0}` y los listeners siguen suscritos | - | Coherente | DEC-42 | M |
| FE-PLY-08 [NUEVO] | unit | Desmontar el componente que usa `subscribe` cancela suscripción y frame | Unmount | Sin llamadas posteriores | DEC-42 | A |
| FE-PLY-09 [NUEVO] | unit | Listener que lanza excepción no impide que se emita a los demás ni rompe el player | - | Aislado | DEC-42 | B |
| FE-PLY-10 [NUEVO] | unit | `stop()` (p. ej. al pulsar "Escuchar la canción completa") emite `{playing:false}` y la reproducción se detiene | - | Estado final | DEC-41, DEC-42 | A |

### 2.17 Frontend - canción completa (DEC-41) y CSP

`FullSongEmbed({ youtubeId })` dentro de `ResultPanel`.

| ID | Nivel | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|
| FE-EMB-01 [NUEVO] | unit | Partida en curso (`status:'playing'`): no hay botón ni iframe | `GameView` playing | Ausentes | DEC-41, RQ §3 | A |
| FE-EMB-02 [NUEVO] | unit | Defensa: aunque llegara `solution` con `status:'playing'` (estado inconsistente), no se renderiza `FullSongEmbed` | Vista artificial | Ausente | DEC-41 | M |
| FE-EMB-03 [NUEVO] | unit | Partida ganada y perdida: aparece el botón "Escuchar la canción completa" y **no** hay iframe | `solution.youtubeId` | Botón sin iframe | DEC-41 | A |
| FE-EMB-04 [NUEVO] | unit | Antes de pulsar: ningún `<iframe>` en el DOM ni petición a `youtube`/`youtube-nocookie` (spy a `fetch`, `createElement`, `Image`) | - | 0 | DEC-41, RQ §3 | A |
| FE-EMB-05 [NUEVO] | unit | Tras pulsar: iframe con `src` exactamente `https://www.youtube-nocookie.com/embed/<youtubeId>` | - | URL correcta | DEC-41 | A |
| FE-EMB-06 [NUEVO] | unit | Atributos del iframe: `referrerpolicy="strict-origin-when-cross-origin"`, `allow="encrypted-media; picture-in-picture; fullscreen"`, `title` descriptivo en español, `allowfullscreen` | - | Presentes | AR §8 | A |
| FE-EMB-07 [NUEVO] | unit | `youtubeId` con `-` inicial y `_` se usa tal cual; con caracteres peligrosos (`"><script>`, `/`, espacio, 12 caracteres) no se renderiza iframe (o se codifica con `encodeURIComponent`); nunca inyecta HTML ni cambia el host | Ids hostiles | Sin iframe a otro dominio ni atributos rotos | AR §8 | A |
| FE-EMB-08 [NUEVO] | unit | Al pulsar el botón se detiene el clip (`player.stop()`) | Audio sonando | Parado | DEC-41 | A |
| FE-EMB-09 [NUEVO] | unit | Pulsar el botón dos veces no crea dos iframes | - | Un solo iframe | DEC-41 | M |
| FE-EMB-10 [NUEVO] | unit | Diario terminado reabierto desde `localStorage` (`DailyRecord.view` con `solution`): botón visible, sin iframe, 0 llamadas a la API | Storage sembrado | Correcto | DEC-41, CL | A |
| FE-EMB-11 [NUEVO] | unit | `DailyRecord.view` antiguo sin `solution.youtubeId` (guardado antes de esta iteración): se muestra la solución (título y juegos) y NO el botón (o botón oculto); sin excepción | Vista sin `youtubeId` | Degradación segura | DEC-41 | A |
| FE-EMB-12 [NUEVO] | unit | "Nueva partida" o cambio de modo desmonta el iframe (no sigue sonando) | Iframe abierto | Iframe eliminado | DEC-41 | A |
| FE-EMB-13 [NUEVO] | unit | La solución (título y juegos) permanece visible con el iframe abierto y no depende de que cargue el vídeo (RQ §8) | Iframe presente | Texto de la solución visible | RQ §8 | A |
| FE-EMB-14 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - |
| FE-CSP-01 [NUEVO] | unit | `frontend/vercel.json` contiene el rewrite a `index.html` Y una cabecera `Content-Security-Policy` cuyo valor es exactamente `frame-src https://www.youtube-nocookie.com` | Leer y parsear el JSON | Presente, sin otras directivas (no hay CSP global, AR §8) | AR §8 | A |
| FE-CSP-02 [NUEVO] | unit | La CSP no rompe lo existente: no incluye `default-src`/`script-src`/`connect-src`/`media-src` (que bloquearían API, blobs de audio o Vite) | - | Solo `frame-src` | AR §8 | M |

## 3. E2E Playwright

Entorno del juego: backend real en driver `fs`, `NODE_ENV=test`, semilla y fecha fijables (nunca en producción). Catálogos sintéticos:
- **Catálogo M (mono)**: 1 canción `enabled`.
- **Catálogo R**: ≥5 canciones en 3 juegos (A con 2, B con 2, multi-juego A+B, una deshabilitada). Cada canción con `source.youtubeId` único de 11 caracteres, uno de ellos empezando por `-`.

Entorno del admin: proceso `npm run cli -- admin --port <libre> --data-dir <tmp>` con un `catalog.json` y `work/` de fixture (tonos generados con ffmpeg: uno de 40 s para seek, uno de 7,4 s corto). Una vez por test se copia el fixture a un directorio nuevo. Los proyectos de admin y de juego son independientes. Las peticiones a YouTube se interceptan siempre con `page.route` (stub HTML), sin depender de la red.

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-01 [MOD, ver §0.1] | e2e | Diario | Diario ganado en el intento 1 | Catálogo M | Solución revelada, bloqueo, racha 1 | CA-7 | A |
| E2E-02 [MOD, ver §0.1] | e2e | Diario | Diario perdido (6 intentos) | Catálogo R | Solución; sin más acciones; X | CA-7 | A |
| E2E-03 | e2e | Diario | Skips alargan el clip 1->2->4->7->11->16 s | `duration` del Blob | `[1,2,4,7,11,16]` ±0,1 s | CA-2 | A |
| E2E-04 [MOD, ver §0.1] | e2e | Diario | Acierto intermedio tras fallos | Objetivo conocida | Compartir 🟥/🟨/⬛ y 🟩 | RQ §3 | A |
| E2E-05 | e2e | Diario | Recarga con diario terminado | Terminado | Resultado, 0 peticiones a `/games*` | CL | A |
| E2E-06 | e2e | Diario | Dos contextos el mismo día | Catálogo R | Misma solución | CA-4 | A |
| E2E-07 | e2e | Diario | Sin filtro en diario; el filtro del ilimitado no lo altera | - | Intacto | CA-4 | A |
| E2E-08 | e2e | Diario | Recarga a mitad de partida | 2 intentos | Solo `POST /games/state` | CL | A |
| E2E-09 [MOD, ver §0.1] | e2e | Diario | Cambio de día con reloj simulado | Partida de ayer | Nueva de hoy; racha continúa | CL | M |
| E2E-10 | e2e | Ilimitado | Partida completa y nueva | - | Permite otra | RQ §3 | A |
| E2E-11 | e2e | Ilimitado | Recarga a mitad | - | Recupera | CL | A |
| E2E-12 | e2e | Ilimitado | Token manipulado o caducado | `page.evaluate` | Se descarta, sin crash | CL | A |
| E2E-13 | e2e | Filtro | Filtro vacío deshabilita "Empezar" | - | Sin petición | CA-5 | A |
| E2E-14 | e2e | Filtro | Pool de una canción | - | Se juega y gana | CA-5 | A |
| E2E-15 | e2e | Filtro | Filtro persiste; diario jugable con filtro vacío | - | Correcto | RQ §3 | M |
| E2E-16 | e2e | Filtro | Cambio de filtro a mitad de partida | - | La actual no cambia; la siguiente sí | CL | A |
| E2E-17 | e2e | Feedback | Fallo con juego correcto | Filtro {A} | "juego acertado" | CA-3 | A |
| E2E-18 | e2e | Feedback | Fallo con juego incorrecto | - | "juego incorrecto" | CA-3 | A |
| E2E-19 [RETIRADO, ver §0.4] | e2e | Feedback | Multi-juego | - | Acierto de juego | RQ §3 | M |
| E2E-20 | e2e | Buscador | Buscar por título y por juego | - | Opciones con sus juegos | DEC-17 | A |
| E2E-21 | e2e | Buscador | Con filtro {A}, el buscador muestra B; en diario todo | - | Lista completa | DEC-17 | A |
| E2E-22 | e2e | Buscador | Sin acentos ni mayúsculas | - | Encuentra | DEC-17 | M |
| E2E-23 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - | - |
| E2E-24 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - | - |
| E2E-25 [RETIRADO] | - | Retirado: compartir/estadísticas eliminados (decisión 2026-10-04, ver §0.1) | - | - | - | - | - |
| E2E-26 [MOD] | e2e | Fuga | Antes de terminar: registrar respuestas (cuerpo, cabeceras, audio en hex), HTML/JS servido, `localStorage`, `sessionStorage`, cookies, IndexedDB, DOM y `src` del audio. Buscar `clipKey`, `startSec`, `source`, fichero, `videoTitle`, `durationSec` y **`youtubeId` de la objetivo**. Es legítimo que el título aparezca en `/api/catalog`, en el desplegable y en `guesses` propias; el `youtubeId` NO es legítimo en ningún sitio antes de terminar | Catálogo R | Cero coincidencias de `youtubeId` y del resto en `/api/games*`, clips, storage, DOM y bundle JS | CA-1, DEC-41 | A |
| E2E-27 | e2e | Fuga | URL del audio opaca; sin `ID3` | - | Cumple | CA-1 | A |
| E2E-28 | e2e | Fuga | Reabrir URL del clip | - | 410 | RQ §2 | A |
| E2E-29 | e2e | Fuga | Fixtures y rutas del bucket no accesibles | - | 404 | RQ §2 | M |
| E2E-30 | e2e | Fuga | Blob del intento N = `CLIP_SECONDS[N]` | - | 1 petición por intento | CA-2 | A |
| E2E-31 [MOD] | e2e | Fuga | Tras terminar aparece la solución (título y juegos) y el botón "Escuchar la canción completa" | - | Visibles; sin iframe todavía | CA-7, DEC-41 | A |
| E2E-32 | e2e | Fuga | Snapshots antes/después | - | La solución solo tras el fin | CA-1 | M |
| E2E-33 | e2e | Arranque en frío | `/health` retrasado y 503 x3 | `page.route` | "Conectando con el servidor…" y se recupera (texto de DEC-57) | CA-8 | A |
| E2E-34 | e2e | Arranque en frío | 503 permanente | Reloj acelerado | Error con reintento | CA-8 | M |
| E2E-35 | e2e | Arranque en frío | Sin pings periódicos | `fastForward` 2 min | 1 petición a `/health` | RQ §9 | A |
| E2E-36 | e2e | Red | Fallo transitorio en `guess` | Abort una vez | Mensaje, sin perder intento | CA-8 | M |
| E2E-37 | e2e | Rate-limit | Spam superando el límite | `RATE_LIMIT_*` bajo | Mensaje de 429 y recuperación | RQ §5 | M |
| E2E-38 | e2e | Móvil/oscuro | WebKit iPhone: flujo completo | `devices['iPhone 13']` | `play()` tras tap | CA-8 | A |
| E2E-39 | e2e | Móvil/oscuro | `colorScheme` dark/light | - | Estilos correctos | CA-8 | A |
| E2E-40 | e2e | Móvil/oscuro | 375x667 sin scroll horizontal | - | Layout correcto | CA-8 | M |
| E2E-41 | e2e | Audio | Sin autoplay antes del gesto | - | Sin `play()` previo | RQ §6 | M |
| E2E-42 | e2e | Audio | Repetir el clip sin red | - | 0 peticiones | DEC-05 | M |
| E2E-43 | e2e | Multi-pestaña | Terminar en una, actuar en otra | - | `GAME_OVER` coherente | CL | B |
| E2E-44 [MOD, ver §0.1] | e2e | Navegadores | E2E-01, 02, 26, 45, 50 y 54 en Chromium, Firefox y WebKit | - | Pasan en los tres | CA-8 | M |
| E2E-45 | e2e | Intentada | X marcada y no seleccionable | - | Sin petición al pulsar | DEC-18 | A |
| E2E-46 | e2e | Intentada | Forzar `ALREADY_GUESSED` | - | 409; aviso; sin consumir | DEC-18 | A |
| E2E-47 | e2e | Intentada | `guesses` sobreviven a la recarga | - | Marcada | DEC-18 | A |
| E2E-48 | e2e | Diario | Primera apertura: un `POST /games {"mode":"daily"}`; recarga usa `state` | - | Conteo correcto | AR §7 | A |
| E2E-49 | e2e | Diario | Reloj del navegador desviado | - | Resultado de la fecha del servidor | CL | M |

Barra de reproducción (DEC-42):

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-50 [NUEVO] | e2e | Barra | Al pulsar reproducir aparece la barra (`role="progressbar"`) con 6 segmentos y marcas en 1/2/4/7/11/16 s; las posiciones de las marcas coinciden con 6,25/12,5/25/43,75/68,75/100 % del ancho (±1 %) | Partida diaria en curso | Barra visible y marcas correctas | DEC-42, RQ §3 | A |
| E2E-51 [NUEVO] | e2e | Barra | La zona desbloqueada crece con cada intento (skips 1->2->4->7->11->16 s): ancho = `s/16` del total (±1 %) y `aria-valuemax` = segundos desbloqueados; la parte bloqueada tiene estilo distinto | - | Ancho y atributo correctos en los 6 intentos | DEC-42, CA-2 | A |
| E2E-52 [NUEVO] | e2e | Barra | Durante la reproducción el cabezal avanza en tiempo real (posiciones crecientes en 3 muestreos) y nunca supera la zona desbloqueada; al terminar el clip queda en reposo | Clip de 4 s | Cabezal monótono, <= tope, parado al final | DEC-42 | A |
| E2E-53 [NUEVO] | e2e | Barra | Móvil WebKit (375 px) y `colorScheme:'dark'`: barra visible sin desbordar, contraste legible, marcas no solapadas | iPhone, dark | Layout correcto | RQ §6 | M |

Canción completa (DEC-41) y CSP:

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-54 [NUEVO] | e2e | Embed | Ganar: aparece el botón "Escuchar la canción completa"; antes de pulsarlo no hay iframe (`page.frames().length === 1`) ni peticiones a `youtube.com`, `youtube-nocookie.com`, `ytimg.com`, `googlevideo.com` (contadas con `page.route`) | Catálogo M | 0 iframes y 0 peticiones | DEC-41 | A |
| E2E-55 [NUEVO] | e2e | Embed | Perder: igual que E2E-54 | Catálogo R | Igual | DEC-41 | A |
| E2E-56 [NUEVO] | e2e | Embed | Tras pulsar: aparece un iframe con `src` `https://www.youtube-nocookie.com/embed/<youtubeId de la solución>`, `referrerpolicy` y `allow` correctos; se hace UNA petición a `youtube-nocookie.com` (stub); el clip de audio se detiene | Clip sonando antes | Correcto | DEC-41 | A |
| E2E-57 [NUEVO] | e2e | Embed | Reabrir un diario terminado (recarga): botón visible, sin iframe ni peticiones a YouTube hasta pulsar, 0 peticiones a la API | Diario terminado | Correcto | DEC-41, CL | A |
| E2E-58 [NUEVO] | e2e | Embed | Vídeo no disponible: el stub devuelve la página de error de YouTube / 404 | Embed abierto | La solución (título y juegos) sigue visible y la app no falla (RQ §8) | RQ §8 | M |
| E2E-59 [NUEVO] | e2e | CSP | Servir la app con las cabeceras reales de `frontend/vercel.json` (`page.route` sobre el documento añade la `Content-Security-Policy` leída del fichero). Abrir el embed: se permite el iframe a `www.youtube-nocookie.com`; un iframe inyectado a otro origen (`youtube.com`) dispara `securitypolicyviolation`; la app (API, audio Blob, estilos) sigue funcionando | - | Embed permitido, otros bloqueados, sin regresiones | AR §8 | A |
| E2E-60 [NUEVO] | e2e | Fuga | El `youtubeId` de la objetivo aparece en la red SOLO en la respuesta que termina la partida (y en `state` posteriores). Las respuestas anteriores, `/api/catalog` y el HTML/JS del bundle no lo contienen. Verificar con los 11 caracteres exactos | Catálogo R | Primera aparición = respuesta final | DEC-41, CA-1 | A |
| E2E-61 [NUEVO] | e2e | Embed | Ilimitado: tras abrir el embed, "Nueva partida" elimina el iframe (frames = 1) y la nueva partida no contiene `youtubeId` en red ni DOM | - | Iframe eliminado y sin fuga | DEC-41 | A |

Admin del catálogo (proyecto aparte, servidor real contra directorio temporal):

| ID | Nivel | Módulo | Descripción | Precondiciones | Resultado esperado | Cubre | P |
|---|---|---|---|---|---|---|---|
| E2E-62 [NUEVO] | e2e | Admin | Abrir la URL del admin: lista las canciones del fixture con título, juegos, estado activa/desactivada, revisada/pendiente y contadores por juego; arranque con `--data-dir` temporal y el `data/` real sin tocar (centinela con hash antes/después) | Fixture de 8 canciones | Datos correctos; real intacto | RQ §4, DEC-36 | A |
| E2E-63 [NUEVO] | e2e | Admin | Editar título de una canción; recargar la página | - | Cambio persistido en `catalog.json` del directorio temporal, `id` y `clipKey` iguales, `.bak` creado | DEC-37, DEC-39 | A |
| E2E-64 [NUEVO] | e2e | Admin | Editar juegos: asignar varios a una canción; crear juego nuevo (id slug); renombrarlo | - | Disco con `games` correctos, id estable tras renombrar, juego visible en el selector | DEC-39, RQ §4 | A |
| E2E-65 [NUEVO] | e2e | Admin | Activar/desactivar y marcar revisada una canción larga | - | Persistido; filtros "activadas/desactivadas" y "revisadas/pendientes" coherentes | RQ §4 | A |
| E2E-66 [NUEVO] | e2e | Admin | Canción corta (7,4 s): marca visible "Demasiado corta (7,4 s)", botón activar deshabilitado; intento directo `PATCH enabled:true` vía `request` con token -> `409 TOO_SHORT` y el fichero no cambia | Fixture con corta | Bloqueada en UI y API | DEC-40 | A |
| E2E-67 [NUEVO] | e2e | Admin | Filtros combinados (juego + desactivadas + pendientes + cortas + con errores) y búsqueda por título, juego y título del vídeo, sin acentos ni mayúsculas | - | Resultados correctos y contador de la lista | AR §6.1 | M |
| E2E-68 [NUEVO] | e2e | Admin | Oír el tema completo con seek: pulsar play en `<audio>`, mover a ~30 s (la fuente dura 40 s) y reanudar | Fuente de 40 s | La petición lleva `Range` y recibe `206`; `currentTime` ≈ 30 s; sin ejecutar `build` | RQ §4 | A |
| E2E-69 [NUEVO] | e2e | Admin | Edición externa de `catalog.json` mientras el admin está abierto (simula `draft`/`build`); recuperar el foco de la página | Evento `focus` | La lista se refresca con el cambio externo; una edición posterior en el admin no pierde el cambio externo | DEC-37 | A |
| E2E-70 [NUEVO] | e2e | Admin | Seguridad: (a) petición con `Host: evil.com` -> 403; (b) `fetch` con `PATCH` desde otro origen local (página en otro puerto) sin token -> bloqueada y sin cambios en disco; (c) leer `/api/session` desde otro origen no es posible (sin CORS) | Segundo servidor estático en otro puerto | 403 / bloqueo; fichero intacto | DEC-36 | A |
| E2E-71 [NUEVO] | e2e | Admin | Catálogo inválido (`games: []` tras `draft`): el admin carga igualmente, marca el error en esa canción y el filtro "con errores" la muestra; al asignarle un juego el error desaparece y `validate` (si hay ffmpeg) pasa | Fixture inválido | Corregible desde la UI | DEC-26, AR §6.1 | A |
| E2E-72 [NUEVO] | e2e | Admin | No existe ningún control para `startSec`, borrar/fusionar juegos ni oír los 6 fragmentos (búsqueda por rol/texto en toda la UI) | - | Ausentes | RQ §4, AR §14 | M |

## 4. Tests existentes afectados

Existen la suite `e2e/` (E2E-01..49) y el código. Afectados por esta iteración:

| ID | Estado | Motivo | Cambio requerido |
|---|---|---|---|
| E2E-26 | requiere actualización | Ahora el `youtubeId` viaja en `solution`; hay que prohibirlo antes de terminar | Añadir su búsqueda (11 caracteres exactos) en red, storage, DOM y bundle; fixture con `youtubeId` por canción |
| E2E-31 | requiere actualización | La pantalla final incluye el botón "Escuchar la canción completa" | Aserción del botón y de que aún no hay iframe |
| E2E-44 | requiere actualización | Matriz de navegadores ampliada | Añadir E2E-50 y E2E-54 |
| Fixtures de catálogo de `e2e/fixtures` | requiere actualización | `source.youtubeId` (11 caracteres) y `source.durationSec` obligatorios para el validador | Añadir ambos campos; incluir una canción con `youtubeId` que empieza por `-` |
| E2E-01..25, 27..30, 32..43, 45..49 | válido sin cambios | No cambian de comportamiento | Revisar que el layout con la barra no rompe los selectores |
| Unitarios backend de vista/solución (`BE-LEAK-02/03/10`, `BE-CAT-06`) | requiere actualización | `solution.youtubeId` | Aserciones de claves exactas |
| `SC-DR-01/03`, `SC-BU-02`, `SC-VA-01` | requiere actualización | `draft`/`build` miden duración y `validate` rechaza cortas activas | Ver filas modificadas |

## 5. Matriz de cobertura

| Requisito | Casos |
|---|---|
| RQ §2 Solución no deducible | BE-TOK-08..14, 16..18, BE-TKT-02..08, BE-LEAK-01..16, BE-HDR-01..08, SC-FF-03, SC-VA-02/05, E2E-26..30, 60 |
| RQ §3 6 intentos, duraciones, skip | SH-RUL-01, BE-ENG-08..14, BE-TKT-11, BE-HDR-11, SC-FF-02, FE-GAM-04, E2E-03, 30 |
| RQ §3 Diario común sin filtro | BE-DAY-01..07, 10..20, SH-DAT-01..03, FE-GAM-11..17, FE-FIL-07, E2E-01..09, 48, 49 |
| RQ §3 Ilimitado con filtro | BE-DAY-18, BE-CAT-01..05, BE-TOK-16, FE-FIL-01..06, FE-GAM-10, E2E-10..16 |
| RQ §3 Intento repetido no permitido | BE-ENG-16, 18..24, BE-LEAK-11..12, BE-RL-11, FE-GAM-18..19, FE-SRC-12..15, E2E-45..47 |
| RQ §3 Feedback parcial | BE-ENG-02..07, FE-GAM-06, E2E-17..19 |
| RQ §3 Estadísticas | FE-STA-01..12, SH-DAT-03, E2E-25 |
| RQ §3 Barra de reproducción (DEC-42) | FE-BAR-01..12, FE-PLY-01..10, FE-AUD-02, E2E-50..53 |
| RQ §3 Canción completa al terminar (DEC-41) | BE-ENG-25..26, BE-LEAK-02/03/10/13..16, SH-CAT-15..16, FE-EMB-01..14, FE-CSP-01..02, FE-SHR-04, E2E-31, 54..61 |
| DEC-17 Buscador | FE-SRC-01..11, BE-ENG-06, E2E-20..22 |
| RQ §3 Compartir | FE-SHR-01..06, FE-EMB-14, E2E-23..24 |
| RQ §4 Catálogo y script | SH-CAT-*, SC-* |
| RQ §4 Canciones cortas (DEC-40) | SH-CAT-17..21, SC-DUR-01..07, SC-DR-03/07..09, SC-BU-02..05, SC-VA-07..09, SC-UP-06, BE-CAT-10..11, AD-CAT-02, AD-PAT-10..12, AU-UI-04..06, AU-FIL-04, E2E-66 |
| RQ §4 Admin local (DEC-36..39) | AD-SRV-*, AD-CAT-*, AD-PAT-*, AD-GAM-*, AD-AUD-*, AD-STA-*, AD-CLI-*, AU-*, SC-CS-*, SC-ID-*, SC-ISO-*, E2E-62..72 |
| RQ §5 Rate-limit y arranque en frío | BE-RL-01..11, FE-API-01..03, E2E-33..37 |
| RQ §6 UI, iOS, oscuro | FE-AUD-02, FE-UI-01, FE-BAR-12, AU-UI-20..21, E2E-38..41, 53 |
| RQ §9 Sin keep-alive | FE-API-03, E2E-35 |
| CA-1 | BE-TOK-11, BE-LEAK-05..07, 11..16, FE-STA-12, FE-BAR-09, E2E-26, 32, 60 |
| CA-2 | BE-TKT-09/11, BE-HDR-07/11, SC-FF-02, SC-VA-04, E2E-03, 30, 51 |
| CA-3 | BE-ENG-02..03, FE-GAM-06, E2E-17..18 |
| CA-4 | BE-DAY-01..07, 19, E2E-06..07, FE-FIL-07 |
| CA-5 | BE-CAT-03..04, BE-DAY-07, FE-FIL-01, E2E-13..14 |
| CA-6 | FE-SHR-01..06, FE-EMB-14, E2E-23..24 |
| CA-7 | BE-ENG-09..13, 25..26, BE-LEAK-02..04, FE-GAM-02, E2E-01..02, 31 |
| CA-8 | FE-API-01..02, E2E-33..34, 38..40, 44, 53 |
| CL token inválido/recarga | BE-TOK-05, BE-CAT-07, FE-GAM-07/13, E2E-08, 11..12 |
| CL diario ya jugado | FE-GAM-11, FE-EMB-10, E2E-05, 57 |
| CL cambio de filtro | FE-GAM-10, E2E-16 |
| CL canción ya intentada | BE-ENG-16/18, FE-GAM-18, FE-SRC-12, E2E-45..46 |
| CL zona horaria | BE-DAY-10..15, 20, SH-DAT-01..03, BE-TOK-15, FE-STA-05..06, FE-GAM-17, E2E-09, 49 |
| CL vídeo retirado o no embebible (RQ §8) | FE-EMB-13, E2E-58 |
| AR §8 Seguridad del embed y CSP | SH-CAT-16, FE-EMB-06..07, FE-CSP-01..02, E2E-59 |
| AR §8 Seguridad del admin | AD-SRV-01..14, AD-AUD-10..11, AD-STA-02..03, AD-PAT-16, E2E-70 |

Cobertura de errores de la API del juego (AR §5):

| Código | Casos |
|---|---|
| VALIDATION_ERROR | BE-VAL-01..05, BE-DAY-02, BE-HDR-13 |
| EMPTY_FILTER | BE-CAT-03/04, FE-FIL-06 |
| UNKNOWN_GAME | BE-CAT-05 |
| UNKNOWN_SONG | BE-ENG-15, 21 |
| TOKEN_INVALID | BE-TOK-03..07, 13..14, 18, BE-CAT-07, FE-GAM-07, E2E-12 |
| GAME_OVER | BE-ENG-13, 21, 26, FE-GAM-08, E2E-43 |
| ALREADY_GUESSED | BE-ENG-16, 18..22, BE-LEAK-11, BE-RL-11, FE-GAM-18, E2E-46 |
| CLIP_TICKET_USED | BE-TKT-02..03, BE-HDR-07, E2E-28 |
| CLIP_TICKET_INVALID | BE-TKT-06, BE-HDR-08 |
| RATE_LIMITED | BE-RL-01..11, FE-GAM-09, E2E-37 |
| STORAGE_ERROR | BE-STO-04, BE-HDR-12 |
| CATALOG_UNAVAILABLE | BE-CAT-08..09, 11 |
| NOT_FOUND | BE-HDR-14 |

Cobertura de errores del admin local (AR §6.1):

| Código | Casos |
|---|---|
| VALIDATION_ERROR (400) | AD-PAT-02/05/06/08/14, AD-GAM-04/05/08, AD-SRV-09/10 |
| FORBIDDEN (403) | AD-SRV-03/06/07, AD-GAM-14, AD-AUD-15, E2E-70 |
| NOT_FOUND (404) | AD-PAT-18, AD-GAM-10, AD-AUD-09/10/11, AD-STA-02/03 |
| TOO_SHORT (409) | AD-PAT-10/12, AU-UI-05, E2E-66 |
| 416 | AD-AUD-06/07 |

## 6. Dependencias de entorno y datos

- Node (versión de claude-test), vitest 4, Testing Library + jsdom, Playwright con Chromium, Firefox y WebKit (`npx playwright install --with-deps`).
- Dependencias de `scripts/catalog/admin-ui` instaladas (`npm --prefix scripts/catalog/admin-ui install`). Sin ellas, `AD-CLI-02` es el comportamiento esperado, no un fallo.
- Fixtures versionadas (`e2e/fixtures`, `backend/test/fixtures`, `scripts/catalog/test/fixtures`):
  - Catálogo R: 3 juegos (A, B, C); canciones solo en A, solo en B, multi-juego A+B, una deshabilitada, y un juego con una sola canción. Ids de 13 y 22 caracteres, `clipKey` de 16 hex. Cada canción con `source.youtubeId` único de 11 caracteres (uno empieza por `-`), `videoTitle` y `durationSec`.
  - Catálogo M: una sola canción `enabled`.
  - Clips sintéticos de tonos, CBR 128 kbps, estéreo, 44,1 kHz, sin ID3/Xing, 6 por canción, con tamaños idénticos por intento. Para BE-LEAK-08 y SC-VA-02, un juego con tamaños distintos.
  - **Fixture del admin**: directorio de datos con `catalog.json` de 8 canciones (largas, una corta de 7,4 s, una con `games: []`, una desactivada, una con `startSec` manual, una con `youtubeId` que empieza por `-`) y `work/<youtubeId>.webm|.m4a` de tonos de 40 s y 7,4 s generados con ffmpeg. Un fichero `.part` de ruido y un centinela fuera de `work/` para pruebas de path traversal. Se copia a un directorio temporal nuevo en cada test.
  - `dist` mínimo de `admin-ui` (HTML + un asset) para AD-STA-*; en E2E se usa el build real.
  - Stub HTML para las peticiones a `youtube-nocookie.com` en E2E (página 200, página de error 404/153).
- Variables de test: `GAME_TOKEN_SECRET` (32+ bytes base64) y un segundo secreto, `DAILY_SEED` fija, `STORAGE_DRIVER=fs`, `STORAGE_DIR` a fixtures, `CLIP_TICKET_TTL_SEC` corto, `RATE_LIMIT_*` reducidos en e2e.
- Reloj inyectable en backend (`now()`) para `tickets`, `token`, `daily` y rate-limit. En frontend, `vi.useFakeTimers`, un `requestAnimationFrame` falso y `page.clock`. En e2e, reloj de backend fijable solo con `NODE_ENV=test`.
- Mocks de proceso para scripts: `spawn` de `ffprobe`/`ffmpeg`/`vite build` inyectable (SC-DUR, AD-CLI). La medición real (SC-DUR-07, SC-VA-06) exige ffmpeg/ffprobe instalados y se omite de forma explícita si no están.
- Vectores de referencia de BE-DAY-05 y de fechas Madrid calculados de forma independiente.
- Seguridad de la suite: todos los tests del admin y de `catalogStore` usan directorios temporales (`fs.mkdtemp`); un hook global falla el test si `scripts/catalog/data/` cambia (hash/mtime de centinela).
- Puertos: el admin y los servidores auxiliares usan puerto libre (`0`) para no colisionar en paralelo.

## 7. Riesgos y limitaciones

1. Shazam/grabación no testeables (aceptado).
2. El rate-limit por nonce de 12/min puede chocar con el uso normal (BE-RL-10). Si falla, es defecto de diseño a decidir con el arquitecto.
3. Tickets usados en memoria: tras reinicio un ticket vivo puede reusarse una vez (BE-TKT-14, solo documenta).
4. S3 de Supabase real, egress, horas de Render, arranque en frío real y `trust proxy` en Render no se prueban en local. Verificación manual en el primer despliegue (incluye que `shared/` sea visible en Render y Vercel).
5. La prueba de fuga demuestra ausencia de cadenas conocidas, no de canales laterales (tamaños sí; tiempos de respuesta no).
6. Limitaciones aceptadas (AR §8): token antiguo reutilizable y apertura de partidas diarias nuevas en otro navegador para sondear.
7. WebKit en Linux no es Safari iOS real: el autoplay y el embed de YouTube hay que verificarlos a mano en un iPhone (CA-8).
8. Cambios de catálogo a mitad de día cambian la canción del diario para partidas nuevas (DEC-09). Ahora cualquier desactivación en el admin (incluida la automática de cortas) altera el conjunto `enabled`, así que conviene publicar tras `build`/`upload` cerca de las 00:00 de Madrid.
9. yt-dlp y la subida real a Supabase no se prueban sin red; solo argumentos y parseo.
10. **YouTube real no se prueba**: el embed se verifica con un stub. No se detecta un vídeo retirado, privado o con embed desactivado (AR §13, fuera de alcance). La política de cookies de `youtube-nocookie` y el comportamiento del reproductor real requieren verificación manual.
11. **CSP bajo Vite/Playwright**: `vite preview` no aplica `vercel.json`. E2E-59 simula las cabeceras leyendo el fichero, pero no prueba que Vercel las sirva realmente. Verificar tras el primer despliegue en Vercel (cabecera presente en `curl -I`).
12. **Coma flotante en la regla de corta** (`startSec + 16 + 0.1`): los límites de SH-CAT-18 y AD-CAT-02 pueden fallar por precisión (p. ej. 21,1). Usar la misma expresión del código en el test y evitar comparar con literales calculados a mano.
13. **Admin y `localhost`**: el servidor escucha solo en IPv4 `127.0.0.1`. Un navegador que resuelva `localhost` a `::1` puede no conectar, y `[::1]` se rechaza a propósito (AD-SRV-03). Documentarlo en el README del script.
14. **Concurrencia entre procesos** (admin + `draft`/`build`): ventana de milisegundos sin bloqueo (DEC-37). SC-CS-04/05 y E2E-69 cubren la cola interna y la lectura-modificación-escritura, no la carrera real entre procesos.
15. **Datos reales no usados**: el catálogo local real (109 canciones, 3 cortas, 82 fuentes < 16 s) no entra en la suite. Hace falta una pasada manual del admin contra una copia de `data/` (`--data-dir` sobre una copia) antes de cerrar la iteración.
16. **Estados antiguos en `localStorage`**: los `DailyRecord.view` guardados antes de DEC-41 no tienen `solution.youtubeId` (FE-EMB-11). Es la única migración de datos de cliente de esta iteración.
17. Ambigüedades que el desarrollador debe resolver, porque los casos asumen una elección (documentar la decisión en el propio test):
    - Qué hace `draft` con ids duplicados (SC-DR-05).
    - Si `startSec` en el cuerpo de `PATCH /api/songs/:id` se ignora o se rechaza (AD-PAT-15; la UI nunca lo envía).
    - Si `songCount` cuenta solo canciones activas o todas (AD-CAT-06).
    - Si `games: []` se permite al editar una canción en el admin (AD-PAT-07) y si se puede activar una canción con `games: []` (AD-PAT-19). El validador la rechaza, pero el admin existe precisamente para corregirla.
    - Nombres de juego duplicados con el mismo slug: sufijo o 400 (AD-GAM-03/05/06, SC-ID-03).
    - Rangos inválidos y multi-rango en el audio del admin (AD-AUD-07).
    - Si el `Host` ajeno se rechaza también en rutas estáticas (AD-SRV-03 asume que sí, en todas).
    - Comportamiento de `draft` con una fuente no medible (SC-DUR-02, SC-DR-09): se asume "sin `durationSec`, aviso, sin desactivar".
    - Una canción `enabled` sin `durationSec` no se considera corta (SH-CAT-20, SC-VA-09); `build` la mide y, si es corta, la desactiva.
    - Si el backend debe arrancar con una canción activa y corta en el catálogo (BE-CAT-11 asume que no, porque usa el validador compartido).
    - Qué muestra la barra con la partida terminada (FE-BAR-11) y si el cabezal vuelve a 0 al parar (FE-BAR-08).
    - Cómo degrada la UI con `DailyRecord.view` antiguo sin `youtubeId` (FE-EMB-11).

## 8. Orden de ejecución recomendado

1. `shared` (SH-*), `token`, `tickets`, `daily`, `engine`, `catalog` (BE-*, unit).
2. `catalogStore`, `duration.ts`, `slugify` (SC-CS, SC-DUR, SC-ID), luego `draft`/`build`/`validate`/`upload`.
3. Servidor del admin (AD-SRV primero: seguridad; después AD-CAT/PAT/GAM/AUD/STA/CLI).
4. UI del admin (AU-FIL, AU-UI).
5. Integración backend (BE-LEAK, BE-HDR, BE-RL).
6. Frontend: FE-GAM, FE-SRC/SHR/STA/API, FE-BAR y FE-PLY, FE-EMB y FE-CSP.
7. E2E del juego: primero E2E-01, 13, 26, 45, 50, 54 y 60 (humo, fuga, intento repetido, barra y embed), después el resto y por último la matriz de navegadores (E2E-44).
8. E2E del admin: E2E-62, 66, 70 (humo y seguridad) y después E2E-63..65, 67..69, 71..72.
9. Pasada manual (riesgos 7, 10, 11, 15).

Recuento aproximado: 18 BE-TOK, 14 BE-TKT, 20 BE-DAY (2 retirados), 11 BE-CAT, 26 BE-ENG, 16 BE-LEAK, 14 BE-HDR, 12 BE-VAL/CFG, 11 BE-RL, 5 BE-STO, 29 SH, ~75 SC, 14 AD-SRV, 8 AD-CAT, 20 AD-PAT, 14 AD-GAM, 16 AD-AUD, 5 AD-STA, 7 AD-CLI, 32 AU, ~85 FE previos, 12 FE-BAR, 10 FE-PLY, 14 FE-EMB, 2 FE-CSP, 72 E2E (49 previos + 23 nuevos).

