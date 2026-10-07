// SH-CON-01..03: CONSOLES y ConsoleName (DEC-50). Un unico origen: shared/rules.ts.
import { describe, it, expect, expectTypeOf } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONSOLES } from '../rules'
import type { ConsoleName } from '../rules'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

describe('shared/rules CONSOLES', () => {
  it('SH-CON-01 CONSOLES es exactamente [GB, GBC, GBA, DS, 3DS, Switch, Switch 2] y en ese orden canonico', () => {
    expect([...CONSOLES]).toEqual(['GB', 'GBC', 'GBA', 'DS', '3DS', 'Switch', 'Switch 2'])
  })

  it('SH-CON-01 sin repetidos', () => {
    expect(new Set(CONSOLES).size).toBe(CONSOLES.length)
  })

  it('SH-CON-02 ConsoleName admite exactamente esos 7 valores', () => {
    expectTypeOf<ConsoleName>().toEqualTypeOf<'GB' | 'GBC' | 'GBA' | 'DS' | '3DS' | 'Switch' | 'Switch 2'>()
    const all: ConsoleName[] = [...CONSOLES]
    expect(all.length).toBe(7)
  })
})

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'coverage', 'test', '__tests__', 'test-results', 'playwright-report', 'data', 'assets'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('un unico origen de CONSOLES (SH-CON-03)', () => {
  const sources = ['backend/src', 'scripts/catalog/src', 'scripts/catalog/admin-ui/src', 'frontend/src'].flatMap((d) => walk(join(ROOT, d)))

  it('SH-CON-03 ninguna lista literal de consolas fuera de shared/rules.ts (p. ej. "GBC")', () => {
    const offenders = sources.filter((f) => /['"]GBC['"]/.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it('SH-CON-03 todo fichero que usa CONSOLES lo importa de shared/rules', () => {
    const users = sources.filter((f) => /\bCONSOLES\b/.test(readFileSync(f, 'utf8')))
    for (const f of users) expect(readFileSync(f, 'utf8'), relative(ROOT, f)).toMatch(/shared\/rules/)
  })

  it('SH-CON-03 backend (pistas) y admin-ui (casillas) usan CONSOLES o ConsoleName', () => {
    for (const dir of ['backend/src', 'scripts/catalog/admin-ui/src']) {
      const used = walk(join(ROOT, dir)).some((f) => /\b(CONSOLES|ConsoleName)\b/.test(readFileSync(f, 'utf8')))
      expect(used, dir).toBe(true)
    }
  })
})
