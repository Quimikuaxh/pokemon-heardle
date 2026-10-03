# Desarrollo y despliegue

## Entorno local (sin Supabase)

### Instalación

1. `npm run install:all` — instala raíz, `shared/`, `backend/`, `frontend/` y `scripts/catalog/`.

### Generación de catálogo

Requisitos del sistema: `yt-dlp` y `ffmpeg`. Ver `scripts/catalog/README.md` para la instalación (`pipx install yt-dlp` en Linux y macOS; `sudo apt install ffmpeg`).

Desde la raíz o `scripts/catalog/`:
1. `npm --prefix scripts/catalog run cli -- fetch <playlistUrl>` — descarga audio de la playlist a `scripts/catalog/data/work/`.
2. `npm --prefix scripts/catalog run cli -- draft` — añade videos nuevos a `scripts/catalog/data/catalog.json`.
3. Editar `scripts/catalog/data/catalog.json` a mano: títulos, juegos, `startSec` y `enabled`.
4. `npm --prefix scripts/catalog run cli -- build` — genera clips en `scripts/catalog/data/out/clips/`.
5. `npm --prefix scripts/catalog run cli -- validate` — verifica integridad (6 clips por canción, duraciones, tamaños).

Con driver `fs` (local), el backend lee `scripts/catalog/data/out/catalog.json` y los clips. En producción, `upload` sube todo a Supabase Storage (ver despliegue).

### Backend y frontend en local

1. Backend: copiar `backend/.env.example` a `backend/.env`:
   - `GAME_TOKEN_SECRET`: `openssl rand -base64 32`
   - `DAILY_SEED`: cadena aleatoria larga, p. ej. `openssl rand -hex 32`
   - Dejar `STORAGE_DRIVER=fs`, `STORAGE_DIR=../scripts/catalog/data/out`

2. Frontend: copiar `frontend/.env.example` a `frontend/.env`. Dejar `VITE_API_URL=` vacío (Vite hace proxy de `/api` a `http://localhost:3002`).

3. `npm run dev` (raíz) — arranca backend (puerto 3002) y frontend (puerto 5173) con concurrently.

### Tests

- `npm test` — unitarios de `shared/`, `backend/`, `scripts/catalog/` y `frontend/` (vitest + Testing Library).
- `npm run typecheck` — TypeScript.
- `npm --prefix e2e test` — E2E con Playwright (requiere `npm --prefix e2e install` y `npm --prefix e2e run browsers`).
  - WebKit en Linux necesita librerías del sistema: `sudo npx playwright install-deps`.
  - Para omitir WebKit (Firefox y Chromium solamente): `npm --prefix e2e run test:no-webkit`.
  - Los fixtures (catálogo + clips de tonos) se regeneran sin ffmpeg: `npm --prefix e2e run fixtures` (requiere `lamejs`).

## Despliegue

Orden: bucket S3 → catálogo en bucket → backend en Render → frontend en Vercel.

### 1. Bucket privado en Supabase Storage

En el proyecto Supabase de claude-test (no crear proyecto nuevo; el plan free se pausa tras inactividad):

1. Storage → Buckets → "New bucket" → nombre: `heardle-audio`, privado.
2. Storage → S3 Access Keys → "Create new key".
3. Guardar en seguro: **endpoint**, **región**, **access key ID** y **secret access key** (el secreto solo se muestra una vez).
4. Formato del endpoint: `https://<ref>.supabase.co/storage/v1/s3` (p. ej. `https://abcd1234.supabase.co/storage/v1/s3`).
5. Región: vacía o `auto` (Supabase no requiere región real).

### 2. Script de catálogo: generar y subir clips

Con las claves del bucket en `scripts/catalog/.env`:
```
STORAGE_BUCKET=heardle-audio
STORAGE_S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3
STORAGE_S3_REGION=
STORAGE_S3_ACCESS_KEY_ID=<key>
STORAGE_S3_SECRET_ACCESS_KEY=<secret>
```

Desde `scripts/catalog/`:
```bash
npm --prefix scripts/catalog run cli -- validate
npm --prefix scripts/catalog run cli -- upload
```

Tras el primer `upload`, los clips y `catalog.json` están en el bucket. La siguiente vez que el backend arranque, cargará el catálogo desde el bucket.

### 3. Backend en Render

Render usa `render.yaml` en la raíz (service `pokemon-heardle-backend`, `rootDir: backend`). 

Conectar el repo a Render:
1. Dashboard → New Service → GitHub → seleccionar repositorio `pokemon-heardle` → rama `main`.
2. Auto-deploy activado para `main`.
3. Build command y start command: `render.yaml` ya los especifica (`npm ci` y `npm start`).

Variables de entorno (Render → Environment):
- `NODE_ENV=production`
- `STORAGE_DRIVER=s3`
- `ALLOWED_ORIGIN=<frontend-url>` (p. ej. `https://pokemon-heardle.vercel.app`)
- `GAME_TOKEN_SECRET=<openssl rand -base64 32>` (mismo que en local)
- `DAILY_SEED=<openssl rand -hex 32>` (mismo que en local)
- `STORAGE_BUCKET=heardle-audio` (ya en `render.yaml`)
- `STORAGE_S3_ENDPOINT=<endpoint del bucket>`
- `STORAGE_S3_REGION=` (vacío o `auto`)
- `STORAGE_S3_ACCESS_KEY_ID=<key>`
- `STORAGE_S3_SECRET_ACCESS_KEY=<secret>`

El primer despliegue tardará ~2-3 min. El backend dormirá tras 15 min de inactividad; la UI mostrará "Despertando el servidor..." cuando despierte. **No añadir health check ni cron jobs** (DEC-14): solo se despierta con tráfico real.

Nota sobre Render free: 750 h/mes compartidas por workspace con otros servicios (p. ej. Team Builder). Si ambos backends están despiertos a la vez sin keep-alive, el consumo es bajo. Nunca publicar cambios de código en ambos proyectos a la vez en Render free para evitar collision de horas.

### 4. Frontend en Vercel

Conectar el repo:
1. Vercel dashboard → Add new project → Import GitHub repo → seleccionar `pokemon-heardle`.
2. Framework: Vite.
3. Root directory: `frontend`.
4. Enable "Include files outside the Root Directory" (necesario para importar `shared/` con ruta relativa).
5. Deploy.

Variables de entorno (Vercel → Settings → Environment Variables):
- `VITE_API_URL=<backend-url>` (p. ej. `https://pokemon-heardle-backend.onrender.com`)

Production branch: `main`. Redeploy automático si `main` cambia.

El archivo `frontend/vercel.json` ya reescribe rutas SPA a `index.html`.

### 5. Verificación del primer despliegue

Después de subir catálogo, backend y frontend:

1. Abrir `<frontend-url>` en navegador. Debe mostrar "Despertando el servidor..." si el backend está durmiendo.
2. Esperar a que aparezca la pantalla de juego.
3. Iniciar una partida en modo ilimitado, elegir un juego y un intento.
4. Abrir DevTools → Network, reproducir el clip del intento 1.
   - Ver petición `GET /api/clips/:ticket`.
   - Cabeceras: `Content-Type: audio/mpeg`, `Cache-Control: no-store, private`.
   - Sin `ETag` ni `Last-Modified`.
   - `Content-Length` ≈ 41000 bytes (clip de 1 s a 128 kbps).
5. Verificar tamaño de clip en el bucket (Supabase Storage):
   - Bucket → clips → ver un clip de 1 s.
   - Tamaño local y ETag en Supabase deben coincidir (md5): DEC-23 requiere que `validate` compruebe tamaños idénticos entre canciones. Si el ETag de Supabase no coincide con el md5 local, `upload` subirá de nuevo (lentitud aceptable en el primer despliegue; en los sucesivos es un error de configuración S3).
6. Probar en iPhone u otro dispositivo móvil: autoplay del audio requiere gesto del usuario (se llama `audio.play()` tras el clic en "Reproducir").

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

`npm --prefix e2e install` — una sola vez.

`npm --prefix e2e run browsers` — descarga Chromium, Firefox y WebKit (requiere `sudo npx playwright install-deps` en Linux para WebKit; sin ellas no falla el test completo, solo skippan `webkit` y `webkit-iphone`).

`npm --prefix e2e test` — ejecuta suite desde `e2e/tests/`. Alternativamente, `npm --prefix e2e run test:no-webkit` para omitir WebKit (Chromium y Firefox).

**Arquitectura del test:**

- `playwright.config.ts` arranca tres instancias backend-frontend con catálogos distintos:
  - **R** (catálogo completo, sin rate-limit efectivo; puertos 3101/5101).
  - **M** (catálogo de 1 canción; 3102/5102).
  - **RL** (catálogo R con `RATE_LIMIT_ACTION=3` muy restrictivo; 3103/5103).

- Fixtures en `e2e/fixtures/{R,M}/`: catálogos + clips MP3 de tonos (senoidales, generados con `lamejs`, sin ffmpeg). Se regeneran solo si cambian las definiciones en `e2e/fixtures/catalogs.ts`: `npm --prefix e2e run fixtures`.

- El catálogo R define el comportamiento del ilimitado: filtro `Charlie` contiene solo canción multi-juego, `Delta` solo `Hollow Pinecone`.

- El objetivo del diario se calcula en `e2e/support/oracle.ts` con la misma fórmula HMAC que el servidor (DEC-09), sin dependencia del código de producción.

- Matriz de navegadores (E2E-44): E2E-01, E2E-02, E2E-26, E2E-45 corren en Chromium, Firefox y WebKit; E2E-38 en `webkit-iphone` (etiqueta `@mobile`).

- Limitación: E2E-09 (cambio de día) no está automatizado; E2E-49 sí, con `page.clock`.
