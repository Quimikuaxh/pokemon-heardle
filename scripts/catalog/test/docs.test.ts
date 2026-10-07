// SC-CON-08: la documentacion avisa de mover el juego nuevo a su sitio en `games` y de asignarle consolas.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

describe('documentacion del catalogo', () => {
  for (const [label, file] of [['DESARROLLO.md', ['DESARROLLO.md']], ['README del script', ['scripts', 'catalog', 'README.md']]] as Array<[string, string[]]>) {
    it(`SC-CON-08 ${label} avisa de mover el juego nuevo a su sitio en games (orden de salida)`, () => {
      expect(read(...file)).toMatch(/(mu[eé]ve|mover|coloca|colocar)[^.\n]*(sitio|posici[oó]n|orden)[^.\n]*games|games[^.\n]*(orden de salida|fecha de salida)/i)
    })

    it(`SC-CON-08 ${label} avisa de asignar consolas al juego nuevo (validate y upload lo exigen)`, () => {
      expect(read(...file)).toMatch(/consolas?/i)
      expect(read(...file)).toMatch(/(asigna|asignar|a[nñ]ade|rellena)[^.\n]*consolas?|consolas?[^.\n]*(validate|upload)/i)
    })
  }
})
