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

3. `npm run dev` (raíz) — arranca backend (puerto 3002) y frontend (puerto 5173) con concurrently. El backend local es el mismo manejador que la Edge Function, servido por Node (`backend/src/node/server.ts`, DEC-57).

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

Frontend en **GitHub Pages** y API en la **Edge Function `heardle`** de Supabase (DEC-57). Proyecto de Supabase compartido con claude-test y daily-pwt: ref `xvkvzrdvtcnjnbhtydfn`. Este repo solo usa el bucket `heardle-audio`, el esquema `heardle` y la función `public.heardle_rate_limit_hit`.

Orden: bucket y clips → migración → secretos → función → GitHub Pages → verificación. Render y Vercel se retiraron (DEC-57): ya no hay backend Node en producción.

### 1. Bucket privado y claves S3 (solo para `upload`)

En el proyecto de Supabase:

1. Storage → New bucket → nombre `heardle-audio`, **sin** marcar "Public bucket".
2. Storage → S3 Connection: anotar el **endpoint** (`https://<ref>.supabase.co/storage/v1/s3`) y la **región** (p. ej. `eu-west-1`).
3. Storage → S3 Access Keys → New access key. Anotar **Access key ID** y **Secret access key** (el secreto solo se muestra una vez).

Las claves S3 solo las usa el script de catálogo en tu máquina. La función lee el bucket con la `service_role`, que Supabase le inyecta sola y nunca sale de su entorno.

### 2. Subir clips y catálogo

1. `scripts/catalog/.env` (copiar de `.env.example`) con `STORAGE_BUCKET=heardle-audio` y el endpoint, región y claves del paso 1. Está en `.gitignore`.
2. Desde la raíz:
   ```bash
   npm --prefix scripts/catalog run cli -- validate
   npm --prefix scripts/catalog run cli -- upload
   ```
   `upload` valida antes de subir y sube solo lo nuevo o cambiado (por md5) y al final `catalog.json`.
3. Comprobar en Supabase → Storage → `heardle-audio` que existen `catalog/catalog.json` y `clips/<clipKey>.mp3` (256.626 bytes cada uno).

### 3. Migración del rate-limit

`supabase/migrations/20261107000000_heardle_rate_limit.sql` (idempotente) crea `heardle.rate_limits` y `public.heardle_rate_limit_hit`, ejecutable solo por `service_role`. Se aplica con la Management API (token personal en `~/.config/daily-pwt/supabase.env`, el mismo proyecto):

```bash
set -a; . ~/.config/daily-pwt/supabase.env; set +a
jq -Rs '{query: .}' supabase/migrations/20261107000000_heardle_rate_limit.sql | curl -s -X POST \
  "https://api.supabase.com/v1/projects/xvkvzrdvtcnjnbhtydfn/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' -d @-
```

Después, la auditoría de RLS y permisos de la skill `supabase`: la tabla tiene RLS y `anon`/`authenticated` no pueden ejecutar la función.

### 4. Secretos de la función

Supabase → Edge Functions → Secrets (o `POST /v1/projects/<ref>/secrets`):

Los secretos son de todo el proyecto (los ven también las funciones de daily-pwt), así que los de esta función llevan el prefijo `HEARDLE_`; `backend/src/edge/main.ts` se lo quita al leerlos.

| Secreto | Valor |
|---|---|
| `HEARDLE_GAME_TOKEN_SECRET` | el que ya está en producción (cambiarlo invalida las partidas en curso); en un proyecto nuevo, `openssl rand -base64 32` |
| `HEARDLE_DAILY_SEED` | **el que ya está en producción**: otro valor cambia la canción del día; en un proyecto nuevo, `openssl rand -hex 32` |
| `HEARDLE_ALLOWED_ORIGIN` | `https://quimikuaxh.github.io` (origen de Pages, sin ruta ni barra final) |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase y se leen sin prefijo. Cualquier otra variable de `backend/src/config.ts` se puede fijar igual, con el prefijo (p. ej. `HEARDLE_RATE_LIMIT_CLIPS`). El resto tiene valores por defecto en `backend/src/edge/main.ts` (bucket `heardle-audio`, rate-limit en Postgres, espera del catálogo de 8 s) y en `backend/src/config.ts` (límites de DEC-13).

### 5. Desplegar la función

```bash
set -a; . ~/.config/daily-pwt/supabase.env; set +a
npm run deploy:edge
```

Empaqueta `backend/src/edge/main.ts` con esbuild en `supabase/functions/heardle/index.js` (generado, no versionado) y lo despliega sin verificación de JWT: la función se protege con su token cifrado y sus tickets. Comprobar `https://xvkvzrdvtcnjnbhtydfn.supabase.co/functions/v1/heardle/api/health` → `{"ok":true,"catalog":true}`.

### 6. GitHub Pages

1. GitHub → Settings → Pages → Source = **GitHub Actions**.
2. Cada push a `main` ejecuta `.github/workflows/deploy.yml`: tipos y tests de `shared`, `backend` y `frontend`, build del frontend con `VITE_API_URL` apuntando a la función, y publicación de `frontend/dist`. URL: `https://quimikuaxh.github.io/pokemon-heardle/`.
3. La CSP del embed de YouTube va en una `<meta>` de `frontend/index.html`: Pages no deja poner cabeceras.

### 7. Verificación

1. Abrir la web: el juego aparece en menos de un segundo, sin "Conectando con el servidor…" salvo fallo.
2. Jugar el diario y una partida libre. En DevTools → Network:
   - `GET …/heardle/api/clips/…` con `Content-Type: audio/mpeg`, `Cache-Control: no-store, private`, sin `ETag`, y `Content-Length` = 16300 en el intento 1. Repetir la misma URL da 410 (o, si cae en otra instancia, otra vez el mismo prefijo: aceptado en DEC-57).
   - Ninguna petición a Google Fonts ni a YouTube hasta pulsar "Escuchar la canción completa".
3. Rate-limit: tras jugar, `select bucket, count(*) from heardle.rate_limits group by 1` tiene filas, y las claves son hashes. Comprobar también que mandar otra `X-Forwarded-For` no cambia la clave contada: si la cambia, la IP del cliente se toma de otra cabecera (`clientIp` en `backend/src/edge/main.ts`). Comprobado el 2026-11-07: el proxy la reescribe.
4. Probar en un iPhone, también con el interruptor de silencio activado (DEC-45).

### Publicar cambios de catálogo


Si el catálogo usa algo que la función desplegada aún no conoce (una consola o un campo nuevos, como `GC` y `series` en DEC-60), primero se despliega la función (`npm run deploy:edge`) y después se sube el catálogo: la función vieja lo rechazaría y la web se quedaría sin catálogo. Los clips se pueden subir antes con `upload --clips-only` (la parte lenta); el catálogo, al final, con `upload`.
`build` → `validate` → `upload` → `npm run deploy:edge` (las instancias guardan el catálogo en memoria; volver a desplegar las renueva) → opcional `upload --prune` para borrar del bucket los clips que ya no están activos. Publicar cerca de las 00:00 (Europe/Madrid): cambiar las canciones activas puede cambiar la canción del día y deja inválidas las partidas en curso cuya canción se desactive.

### Probar la función en local

Con Docker: `npx supabase start` levanta un Supabase propio en los puertos 553xx (convive con el de daily-pwt) y aplica la migración. Crear el bucket `heardle-audio`, subir un catálogo y sus clips (p. ej. `e2e/fixtures/R`), escribir `supabase/functions/.env` con `HEARDLE_GAME_TOKEN_SECRET`, `HEARDLE_DAILY_SEED` y `HEARDLE_ALLOWED_ORIGIN` (ignorado por git) y `npm run edge:local`. La API queda en `http://127.0.0.1:55321/functions/v1/heardle/api/...`; el frontend apunta ahí compilando con `VITE_API_URL`. `npx supabase stop` lo para.

## Decisiones de implementación

Documentadas en `ARQUITECTURA.md` (secciones 3-7) y `REQUISITOS.md` (sección 9). Notas operacionales:
- Token y ticket: AES-256-GCM, payload con padding fijo (DEC-02, DEC-03, DEC-04).
- Clips: MP3 CBR 128 kbps, 6 por canción. Validador comprueba tamaño idéntico (DEC-06, DEC-23).
- `.env.example` en cada paquete, no en raíz (DEC-34).
- Rate-limit con ventana de 60 s, sin Redis: en memoria en Node y en Postgres en la Edge Function (DEC-13, DEC-57).

## Reglas de implementación

Los motivos están en `ARQUITECTURA.md` (DEC-02 a DEC-04, DEC-22) y en `scripts/catalog/README.md`; aquí solo lo operativo.

- Ejecutar `upload --prune` después de volver a desplegar la función.
- No reactivar la cabecera Xing de los MP3 (es una huella por canción); `validate` ya tolera la diferencia de duración.
- No añadir pings ni cron a la API.

## Tests E2E (Playwright)

`npm run e2e` (raíz) ejecuta `e2e/`. Requisitos: `npm --prefix e2e install` y `npm --prefix e2e run browsers` (Chromium, Firefox, WebKit). WebKit en Linux necesita librerías del sistema (`sudo npx playwright install-deps`); sin ellas fallan solo los proyectos `webkit` y `webkit-iphone`, y `npm --prefix e2e run test:no-webkit` los omite.

- `playwright.config.ts` levanta un par backend (driver `fs`, `NODE_ENV=test`) + Vite: **R** (catálogo R; 3101/5101), **M** (una canción; 3102/5102) y **RL** (catálogo R con `RATE_LIMIT_ACTION=3`, solo E2E-37; 3103/5103) **X** (catálogo M con el clip corrupto en un offset intermedio, solo E2E-78; 3104/5104) y **S** (un juego principal y uno spin-off, DEC-60, E2E-102..103; 3105/5105). Los frontends usan `e2e/vite.e2e.config.ts` para cambiar el destino del proxy de `/api`.
- Fixtures en `e2e/fixtures/{R,M,admin}` (catálogos + un MP3 de 16 s por canción en `clips/<clipKey>.mp3`, versionados; tono escalonado `base + 250 Hz × segundo`, tamaño y offsets de `shared/rules.ts`). Se regeneran sin ffmpeg con `npm --prefix e2e run fixtures` (encoder JS `lamejs`); las definiciones viven en `e2e/fixtures/catalogs.ts`.
- El catálogo R (una canción = un juego, DEC-53; `consoles` en cada juego; Delta y Echo forman un grupo de selección) fija el objetivo del ilimitado con los juegos de una sola canción (`Charlie`, `Delta`, `Echo`, `Foxtrot` Switch, `Golf` Switch 2, `Zeta` Switch + Switch 2); en `Alpha`/`Bravo` el objetivo se identifica por el tono del clip (`identifyByTone`). El objetivo del diario se calcula en `e2e/support/oracle.ts` (HMAC `daily|v2|` con grupos equiprobables, sin importar código de producción).
- Admin (E2E-62..72, `tests/admin/`): cada test copia `fixtures/admin` a un directorio temporal y arranca el servidor real del admin (`support/admin-launcher.ts`) contra él; nunca se usa `scripts/catalog/data/`. Sirve `scripts/catalog/admin-ui/dist` (se compila en el `globalSetup` si falta).
- `support/webaudio.ts` instrumenta Web Audio (decodificaciones, rampa de fundido, `start`/`stop`/`resume`). Playwright desactiva la política de autoplay: el `AudioContext` nace `running`, así que "suspended antes del gesto" no es verificable en E2E; sí que no hay `start()` previo.
- Las peticiones a YouTube se interceptan siempre con `page.route` (`support/youtube.ts`); la red real no interviene.
- Matriz de navegadores (E2E-44): E2E-01, 02, 26, 45, 50 y 54 en Chromium, Firefox y WebKit; E2E-38 y 53 en `webkit-iphone` (etiqueta `@mobile`).
- Defecto conocido cubierto con `test.fail()`: E2E-78 (recuperación) falla mientras `CachedClipStore` cachee clips inválidos; al arreglarlo el test pasará a fallar y habrá que quitar la anotación.
- No automatizado: E2E-09 (cambio de día) porque el backend no permite fijar su reloj por entorno; E2E-71 no ejecuta `validate` (ffmpeg no instalado). E2E-23..25 retirados (compartir/estadísticas eliminados).
