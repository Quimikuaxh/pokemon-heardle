# Pokémon Heardle — convenciones del repo

Referencia: `REQUISITOS.md` (qué), `ARQUITECTURA.md` (cómo y decisiones DEC-nn), `TEST_PLAN.md` (casos), `DESARROLLO.md` (uso y despliegue).

## Datos reales del catálogo

- No ejecutes tests ni comandos de prueba contra `scripts/catalog/data/`: contiene el catálogo real revisado a mano y los audios descargados, y no está en git (no se puede recuperar con un checkout).
- Todo test que use el CLI o el servidor del admin pasa `--data-dir` con un directorio temporal propio (`tmp()` / `makeDataDir()` de `scripts/catalog/test/helpers/data.ts`).
- Motivo: un test de `draft` llegó a reescribir el `catalog.json` real cuando el CLI aún ignoraba `--data-dir`.

## Tests

- Nombra cada fichero de test por el módulo o la funcionalidad que prueba (`draftCli.test.ts`, `FullSongEmbed.test.tsx`), nunca por la ronda en que se escribió (`review2`, `hardening`). Motivo: el caso debe encontrarse junto al resto de casos de su módulo.
- Un test que compare el contenido de un directorio usa un directorio padre propio, no el tmp del sistema: otros ficheros de test escriben ahí en paralelo y el resultado sería intermitente.
- Si un test falla por un defecto del código, se arregla el código. Un test solo se cambia cuando contradice una decisión registrada en `REQUISITOS.md`/`ARQUITECTURA.md`, y se actualiza también su fila en `TEST_PLAN.md`.
