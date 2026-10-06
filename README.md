# Pokémon Heardle

Adivina la canción de un juego de Pokémon a partir de fragmentos de 1/2/4/7/11/16 s. Modo diario (una canción común al día, zona Europe/Madrid) y partida libre con filtro por juego.

- Requisitos: `REQUISITOS.md`. Arquitectura y decisiones: `ARQUITECTURA.md`. Plan de pruebas: `TEST_PLAN.md`.
- Entorno local, despliegue y notas de implementación: `DESARROLLO.md`.
- Generar el catálogo y los clips: `scripts/catalog/README.md`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `shared/` | TS puro compartido por ruta relativa: DTOs, validador de catálogo, reglas, fecha de Madrid |
| `backend/` | Express 5 + TypeScript. Partida en token cifrado, audio solo vía ticket de un solo uso |
| `frontend/` | React + Vite + Tailwind 4, en español, responsive, modo oscuro automático |
| `scripts/catalog/` | CLI (yt-dlp + ffmpeg) para generar `catalog.json` y los clips |
| `scripts/catalog/admin-ui/` | UI React del admin local del catálogo (no se despliega) |

## Comandos (desde la raíz)

```bash
npm run install:all   # instala todos los paquetes (cada uno tiene .npmrc con legacy-peer-deps)
npm run dev         # backend (3002) y frontend (5173) a la vez, con concurrently
npm run admin       # admin local del catálogo en http://127.0.0.1:5180 (ver scripts/catalog/README.md)
npm run e2e         # Playwright (carpeta e2e/, aun por crear)
npm test              # shared + backend + scripts/catalog + frontend + admin-ui
npm run typecheck     # tsc de shared, backend, scripts/catalog y admin-ui
npm run build         # typecheck + build de producción del frontend y de admin-ui (dist/ de cada uno)
```

## Tipografías

- Interfaz: Rubik, Space Mono y Lilita One, alojadas en el proyecto con `@fontsource/*` (licencia OFL; sin peticiones a Google Fonts).
- Logo: **Pokemon Solid** (`frontend/src/assets/fonts/PokemonSolid.ttf`).
  - Origen: dafont.com/pokemon.font, familia "Pokemon" (variantes Solid y Hollow), actualizada en 2007.
  - En esa página el autor y la licencia no constan claramente.
  - Uso: proyecto de fans sin ánimo de lucro (no comercial), bajo responsabilidad del propietario del proyecto.
  - El logo es un único componente (`frontend/src/components/Logo.tsx`), fácil de sustituir.
