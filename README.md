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

## Comandos (desde la raíz)

```bash
npm run install:all   # instala los cuatro paquetes (cada uno tiene .npmrc con legacy-peer-deps)
npm run dev         # backend (3002) y frontend (5173) a la vez, con concurrently
npm run e2e         # Playwright (carpeta e2e/, aun por crear)
npm test              # shared + backend + scripts/catalog + frontend
npm run typecheck     # tsc de shared, backend y scripts/catalog
npm run build         # typecheck + build de producción del frontend (frontend/dist)
```
