# Pokémon Heardle — convenciones del repo

Referencia: `REQUISITOS.md` (qué), `ARQUITECTURA.md` (cómo y decisiones DEC-nn), `TEST_PLAN.md` (casos), `DESARROLLO.md` (uso y despliegue).

## Datos reales del catálogo

- No ejecutes tests ni comandos de prueba contra `scripts/catalog/data/`: contiene el catálogo real revisado a mano y los audios descargados, y no está en git (no se puede recuperar con un checkout).
- Todo test que use el CLI o el servidor del admin pasa `--data-dir` con un directorio temporal propio (`tmp()` / `makeDataDir()` de `scripts/catalog/test/helpers/data.ts`).
- Motivo: un test de `draft` llegó a reescribir el `catalog.json` real cuando el CLI aún ignoraba `--data-dir`.

## Añadir un juego nuevo al catálogo

Al añadir la playlist de un juego nuevo, en `scripts/catalog/data/catalog.json`:

- Coloca el juego en su sitio de la lista `games`, por fecha de salida. `draft` lo añade al final, y ese orden decide cómo se listan los juegos y la pista de fecha (DEC-48, DEC-50).
- Asígnale su consola o consolas (DEC-51). No hay tabla por defecto en el script: lo hace quien añade el juego. `validate` y `upload` rechazan un juego sin consola.
- Usa un nombre homogéneo con el resto ("Pokémon X/Y") y limpia de los títulos las coletillas de la playlist ("- Pokémon X/Y OST", "(HQ)"…).
- Para quitar una canción del juego, desactívala; no la borres: si se borra, el siguiente `draft` de esa playlist la vuelve a añadir.
- Desactiva las reversiones de una misma canción y deja solo la versión base: pistas sueltas o mezclas parciales (`[vocals]`, `[beatbox]`, `[no piano]`…), medleys, salas o vagones (`[1st Room]`, `[2nd Car]`), plantas (`[B1F]`), variantes de noche, estación, `[Alt.]` o fase, interpretaciones dentro del juego ("Performed By…") y pistas `[UNUSED]`. Si no hay versión base, deja una sola variante. Motivo: suenan igual, inflan el peso del juego y hacen ambiguo el acierto. Abundan en las playlists "(Restored)". Excepción: temas distintos con el mismo prefijo ("Battle! (Gym Leader)", "Trainers' Eyes Meet (Lass)") no son reversiones.

## Tests

- Nombra cada fichero de test por el módulo o la funcionalidad que prueba (`draftCli.test.ts`, `FullSongEmbed.test.tsx`), nunca por la ronda en que se escribió (`review2`, `hardening`). Motivo: el caso debe encontrarse junto al resto de casos de su módulo.
- Un test que compare el contenido de un directorio usa un directorio padre propio, no el tmp del sistema: otros ficheros de test escriben ahí en paralelo y el resultado sería intermitente.
- Si un test falla por un defecto del código, se arregla el código. Un test solo se cambia cuando contradice una decisión registrada en `REQUISITOS.md`/`ARQUITECTURA.md`, y se actualiza también su fila en `TEST_PLAN.md`.
