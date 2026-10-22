# Desarrollo y despliegue

## Entorno local (sin Supabase)

### Instalación

1. `npm run install:all` — instala raíz, `shared/`, `backend/`, `frontend/`, `scripts/catalog/` y `scripts/catalog/admin-ui/`.

### Generación de catálogo

Requisitos del sistema: `yt-dlp` y `ffmpeg`. Ver `scripts/catalog/README.md` para la instalación (`pipx install yt-dlp` en Linux y macOS; `sudo apt install ffmpeg`).

Desde la raíz o `scripts/catalog/`:
1. `npm --prefix scripts/catalog run cli -- fetch <playlistUrl>` — descarga audio de la playlist a `scripts/catalog/data/work/`.
2. `npm --prefix scripts/catalog run cli -- draft` — añade videos nuevos a `scripts/catalog/data/catalog.json` y mide la duración de las fuentes descargadas. Las que duran menos de 16,1 s (`startSec` + 16 s + margen) quedan desactivadas (`enabled: false`) y marcadas como cortas; no hacen fallar el flujo.
3. `npm run admin` — admin local (http://127.0.0.1:5180): escuchar el tema completo, activar/desactivar, editar título, juego, consolas y grupo de selección, marcar revisada. Las cortas no se pueden activar. `startSec` no se edita en el admin (siempre 0 salvo edición manual del JSON).
4. `npm --prefix scripts/catalog run cli -- build` — mide otra vez las fuentes activas (desactiva las cortas) y genera clips en `scripts/catalog/data/out/clips/`.
5. `npm --prefix scripts/catalog run cli -- validate` — verifica integridad (un `<clipKey>.mp3` por canción con 614 tramas MPEG-1 L3 128 kbps sin reservoir ni Xing, duración 16 s; falla si hay una corta activada).

Al añadir un juego nuevo: `draft` lo deja al final de `games` y sin consolas. Mueve el juego a su sitio en `games` (orden de salida, por fecha) y asigna sus consolas (admin o `catalog.json`): `validate` y `upload` rechazan un juego con canciones activas sin consolas. El detalle, incluido cómo asignar `selectionGroup`, está en `scripts/catalog/README.md`.

Para encontrar duplicados de un juego con canciones de varias fuentes: `npm --prefix scripts/catalog run cli -- similar <juegoId>` (detalle en `scripts/catalog/README.md`).

Todos los subcomandos aceptan `--data-dir <ruta>` (por defecto `scripts/catalog/data`). Con driver `fs` (local), el backend lee `scripts/catalog/data/out/catalog/catalog.json` y los clips. En producción, `upload` sube todo a Supabase Storage (ver despliegue).

### Backend y frontend en local

1. Backend: copiar `backend/.env.example` a `backend/.env`:
   - `GAME_TOKEN_SECRET`: `openssl rand -base64 32`
   - `DAILY_SEED`: cadena aleatoria larga, p. ej. `openssl rand -hex 32`
   - Dejar `STORAGE_DRIVER=fs`, `STORAGE_DIR=../scripts/catalog/data/out`

2. Frontend: copiar `frontend/.env.example` a `frontend/.env`. Dejar `VITE_API_URL=` vacío (Vite hace proxy de `/api` a `http://localhost:3002`).

3. `npm run dev` (raíz) — arranca backend (puerto 3002) y frontend (puerto 5173) con concurrently.

### Compartir el entorno local con ngrok

Sirve para probar desde el móvil o que otra persona juegue sin desplegar.

1. Instalar ngrok (binario oficial, sin sudo): descargar `ngrok-v3-stable-linux-amd64.tgz` de ngrok.com y extraer `ngrok` en `~/.local/bin`.
2. Una sola vez: `ngrok config add-authtoken <token>` (token del panel de ngrok, cuenta gratuita).
3. Con `npm run dev` en marcha: `ngrok http 5173`. Comparte la URL `https://….ngrok-free.app` que muestra.

Solo se expone el puerto de Vite: el backend queda detrás de su proxy `/api`, así que no hay que tocar `ALLOWED_ORIGIN`. `frontend/vite.config.ts` admite los dominios de ngrok en `server.allowedHosts`; sin eso Vite responde "Blocked request". No expongas el admin (puerto 5180): no tiene login y escribe en el catálogo real.

### Tests

- `npm test` — unitarios de `shared/`, `backend/`, `scripts/catalog/` (incluye el servidor del admin), `frontend/` y `scripts/catalog/admin-ui/` (vitest + Testing Library). Los tests del script y del admin trabajan siempre en directorios temporales (`--data-dir`): nunca deben tocar `scripts/catalog/data/`.
- `npm run typecheck` — TypeScript.
- `npm --prefix e2e test` — E2E con Playwright (requiere `npm --prefix e2e install` y `npm --prefix e2e run browsers`).
  - WebKit en Linux necesita librerías del sistema: `sudo npx playwright install-deps`.
  - Para omitir WebKit (Firefox y Chromium solamente): `npm --prefix e2e run test:no-webkit`.
  - Los fixtures (catálogo + clips de tonos) se regeneran sin ffmpeg: `npm --prefix e2e run fixtures` (requiere `lamejs`).

## Migración al clip único (DEC-44)

Si el bucket y `data/out/` tienen aún el layout antiguo (`clips/<clipKey>/<n>.mp3`), el orden es: `build` (genera el fichero nuevo y borra la carpeta antigua) → `validate` → `upload` sin `--prune` → desplegar y reiniciar el backend nuevo (el merge a `main` va después del `upload`) → `upload --prune`. Detalle en `scripts/catalog/README.md`.

## Despliegue

Reutiliza las cuentas del Team Builder (Supabase, Render y Vercel). No se crea ningún proyecto de Supabase nuevo: el audio va a un bucket privado del proyecto existente.

Orden obligatorio: bucket y claves → subir clips y catálogo → backend en Render → frontend en Vercel → `ALLOWED_ORIGIN` → verificación. El backend lee el catálogo del bucket al arrancar: si arranca antes de que exista, `/health` responde 503 hasta reiniciarlo.

### 1. Bucket privado y claves S3 en Supabase

En el proyecto de Supabase del Team Builder:

1. Storage → New bucket → nombre `heardle-audio`, **sin** marcar "Public bucket".
2. Storage → S3 Connection: anotar el **endpoint** (`https://<ref>.supabase.co/storage/v1/s3`) y la **región** del proyecto (p. ej. `eu-west-1`). La región es obligatoria; el backend no arranca con ella vacía.
3. Storage → S3 Access Keys → New access key. Anotar **Access key ID** y **Secret access key** (el secreto solo se muestra una vez).

Usa estas claves S3, nunca la `service_role`: las claves S3 solo dan acceso a Storage; la `service_role` daría acceso a la base de datos del Team Builder.

### 2. Subir clips y catálogo

1. `scripts/catalog/.env` (copiar de `.env.example`) con `STORAGE_BUCKET=heardle-audio` y el endpoint, región y claves del paso 1. Está en `.gitignore`.
2. Desde la raíz:
   ```bash
   npm --prefix scripts/catalog run cli -- validate
   npm --prefix scripts/catalog run cli -- upload
   ```
   `upload` valida antes de subir y sube solo lo nuevo o cambiado (por md5) y al final `catalog.json`.
3. Comprobar en Supabase → Storage → `heardle-audio` que existen `catalog/catalog.json` y `clips/<clipKey>.mp3` (256.626 bytes cada uno).

### 3. Backend en Render

1. Render → New → Web Service → repositorio `pokemon-heardle`, rama `main`, plan Free. `render.yaml` fija `rootDir: backend`, `npm ci` y `npm start` (alternativa: New → Blueprint, que lee `render.yaml`).
2. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `STORAGE_DRIVER` | `s3` |
   | `STORAGE_BUCKET` | `heardle-audio` |
   | `STORAGE_S3_ENDPOINT` | endpoint del paso 1 |
   | `STORAGE_S3_REGION` | región del paso 1 |
   | `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | claves del paso 1 |
   | `GAME_TOKEN_SECRET` | nuevo, `openssl rand -base64 32` (no reutilizar el de local) |
   | `DAILY_SEED` | nuevo, `openssl rand -hex 32` |
   | `ALLOWED_ORIGIN` | URL de Vercel del paso 4, sin barra final (se rellena después) |

   `DAILY_SEED` no se cambia nunca una vez publicado: cambiarlo cambia la canción del día. Cambiar `GAME_TOKEN_SECRET` invalida las partidas en curso.
3. Comprobar `https://<servicio>.onrender.com/api/health` → `{"ok":true,"catalog":true}`.

Render free: 750 h/mes compartidas con el backend del Team Builder; cada servicio solo consume mientras está despierto (se duerme tras 15 min sin tráfico). No añadir health checks externos ni cron que lo mantengan despierto.

### 4. Frontend en Vercel

1. Vercel → Add New → Project → importar `pokemon-heardle`.
2. Root Directory: `frontend`; Framework: Vite; mantener activado "Include files outside the Root Directory in the Build Step" (el frontend importa `shared/`).
3. Variable `VITE_API_URL` = URL de Render, sin `/api` ni barra final (p. ej. `https://pokemon-heardle-backend.onrender.com`). Se incrusta al compilar: si cambia, hay que redesplegar.
4. Deploy. Production Branch: `main`.

### 5. Cerrar CORS

En Render, `ALLOWED_ORIGIN` = URL de producción de Vercel (p. ej. `https://pokemon-heardle.vercel.app`), sin barra final, y redesplegar el backend.

### 6. Verificación

1. Abrir la URL de Vercel: si el backend duerme, aparece "Despertando el servidor…" hasta ~1 min.
2. Jugar el diario y una partida libre. En DevTools → Network:
   - `GET /api/clips/…` con `Content-Type: audio/mpeg`, `Cache-Control: no-store, private`, sin `ETag`, y `Content-Length` = 16300 en el intento 1.
   - Ninguna petición a Google Fonts ni a YouTube hasta pulsar "Escuchar la canción completa".
3. Probar en un iPhone, también con el interruptor de silencio activado (DEC-45).
4. Volver a ejecutar `upload` sin cambios: debe subir 0 clips. Si los vuelve a subir todos, el ETag de Supabase no coincide con el md5 local (DEC-23).

### Publicar cambios de catálogo

`build` → `validate` → `upload` → reiniciar el backend en Render (Manual Deploy → Restart) → opcional `upload --prune` para borrar del bucket los clips que ya no están activos. Publicar cerca de las 00:00 (Europe/Madrid): cambiar las canciones activas puede cambiar la canción del día y deja inválidas las partidas en curso cuya canción se desactive.

## Decisiones de implementación

Documentadas en `ARQUITECTURA.md` (secciones 3-7) y `REQUISITOS.md` (sección 9). Notas operacionales:
- Token y ticket: AES-256-GCM, payload con padding fijo (DEC-02, DEC-03, DEC-04).
- Clips: MP3 CBR 128 kbps, 6 por canción. Validador comprueba tamaño idéntico (DEC-06, DEC-23).
- `.env.example` en cada paquete, no en raíz (DEC-34).
- Rate-limit en memoria con ventana de 60 s, sin Redis (DEC-13).

## Reglas de implementación

Los motivos están en `ARQUITECTURA.md` (DEC-02 a DEC-04, DEC-22) y en `scripts/catalog/README.md`; aquí solo lo operativo.

- Ejecutar `upload --prune` después de reiniciar el backend.
- No reactivar la cabecera Xing de los MP3 (es una huella por canción); `validate` ya tolera la diferencia de duración.
- No añadir pings ni cron al backend en Render.

## Tests E2E (Playwright)

`npm run e2e` (raíz) ejecuta `e2e/`. Requisitos: `npm --prefix e2e install` y `npm --prefix e2e run browsers` (Chromium, Firefox, WebKit). WebKit en Linux necesita librerías del sistema (`sudo npx playwright install-deps`); sin ellas fallan solo los proyectos `webkit` y `webkit-iphone`, y `npm --prefix e2e run test:no-webkit` los omite.

- `playwright.config.ts` levanta tres pares backend (driver `fs`, `NODE_ENV=test`) + Vite: **R** (catálogo R; 3101/5101), **M** (una canción; 3102/5102) y **RL** (catálogo R con `RATE_LIMIT_ACTION=3`, solo E2E-37; 3103/5103) y **X** (catálogo M con el clip corrupto en un offset intermedio, solo E2E-78; 3104/5104). Los frontends usan `e2e/vite.e2e.config.ts` para cambiar el destino del proxy de `/api`.
- Fixtures en `e2e/fixtures/{R,M,admin}` (catálogos + un MP3 de 16 s por canción en `clips/<clipKey>.mp3`, versionados; tono escalonado `base + 250 Hz × segundo`, tamaño y offsets de `shared/rules.ts`). Se regeneran sin ffmpeg con `npm --prefix e2e run fixtures` (encoder JS `lamejs`); las definiciones viven en `e2e/fixtures/catalogs.ts`.
- El catálogo R (una canción = un juego, DEC-53; `consoles` en cada juego; Delta y Echo forman un grupo de selección) fija el objetivo del ilimitado con los juegos de una sola canción (`Charlie`, `Delta`, `Echo`, `Foxtrot` Switch, `Golf` Switch 2, `Zeta` Switch + Switch 2); en `Alpha`/`Bravo` el objetivo se identifica por el tono del clip (`identifyByTone`). El objetivo del diario se calcula en `e2e/support/oracle.ts` (HMAC `daily|v2|` con grupos equiprobables, sin importar código de producción).
- Admin (E2E-62..72, `tests/admin/`): cada test copia `fixtures/admin` a un directorio temporal y arranca el servidor real del admin (`support/admin-launcher.ts`) contra él; nunca se usa `scripts/catalog/data/`. Sirve `scripts/catalog/admin-ui/dist` (se compila en el `globalSetup` si falta).
- `support/webaudio.ts` instrumenta Web Audio (decodificaciones, rampa de fundido, `start`/`stop`/`resume`). Playwright desactiva la política de autoplay: el `AudioContext` nace `running`, así que "suspended antes del gesto" no es verificable en E2E; sí que no hay `start()` previo.
- Las peticiones a YouTube se interceptan siempre con `page.route` (`support/youtube.ts`); la red real no interviene.
- Matriz de navegadores (E2E-44): E2E-01, 02, 26, 45, 50 y 54 en Chromium, Firefox y WebKit; E2E-38 y 53 en `webkit-iphone` (etiqueta `@mobile`).
- Defecto conocido cubierto con `test.fail()`: E2E-78 (recuperación) falla mientras `CachedClipStore` cachee clips inválidos; al arreglarlo el test pasará a fallar y habrá que quitar la anotación.
- No automatizado: E2E-09 (cambio de día) porque el backend no permite fijar su reloj por entorno; E2E-71 no ejecuta `validate` (ffmpeg no instalado). E2E-23..25 retirados (compartir/estadísticas eliminados).
