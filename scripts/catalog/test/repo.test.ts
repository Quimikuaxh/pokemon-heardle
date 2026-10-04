// SC-GI-03 (scripts raiz incluyen admin-ui) y SC-ISO-01/02 (aislamiento del admin). Solo lectura.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(p)
  }
  return out
}

const importsOf = (file: string): string[] => {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1])
}

describe('scripts raiz (SC-GI-03)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  for (const script of ['install:all', 'test', 'typecheck']) {
    it(`SC-GI-03 el script raiz "${script}" incluye scripts/catalog/admin-ui`, () => {
      expect(pkg.scripts[script]).toContain('scripts/catalog/admin-ui')
    })
  }

  it('SC-GI-03 admin-ui tiene su propio package.json con scripts test y typecheck', () => {
    const adminPkg = JSON.parse(readFileSync(join(ROOT, 'scripts/catalog/admin-ui/package.json'), 'utf8'))
    expect([typeof adminPkg.scripts.test, typeof adminPkg.scripts.typecheck, typeof adminPkg.scripts.dev]).toEqual(['string', 'string', 'string'])
  })
})

describe('aislamiento del admin (SC-ISO-01)', () => {
  it('SC-ISO-01 nada de frontend/ ni backend/ importa de scripts/catalog/admin*', () => {
    const offenders: string[] = []
    for (const pkgDir of ['frontend/src', 'backend/src', 'shared']) {
      for (const file of walk(join(ROOT, pkgDir))) {
        if (file.includes(`${sep}test${sep}`)) continue
        for (const spec of importsOf(file)) if (/scripts\/catalog\/(src\/)?admin|admin-ui/.test(spec) || /(\.\.\/)+scripts\/catalog/.test(spec)) offenders.push(`${relative(ROOT, file)} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('SC-ISO-01 admin-ui no importa de frontend/ (solo de shared/)', () => {
    const offenders: string[] = []
    for (const file of walk(join(ROOT, 'scripts/catalog/admin-ui/src'))) {
      for (const spec of importsOf(file)) {
        if (/(\.\.\/)+frontend\//.test(spec) || /(\.\.\/)+backend\//.test(spec)) offenders.push(`${relative(ROOT, file)} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('SC-ISO-01 el codigo del admin (src/admin) no importa de frontend/ ni backend/', () => {
    const offenders: string[] = []
    for (const file of walk(join(ROOT, 'scripts/catalog/src/admin'))) {
      for (const spec of importsOf(file)) if (/(\.\.\/)+(frontend|backend)\//.test(spec)) offenders.push(`${relative(ROOT, file)} -> ${spec}`)
    }
    expect(offenders).toEqual([])
  })
})

// SC-ISO-02: solo si hay un build del frontend disponible; si no, se omite de forma explicita.
const FRONTEND_DIST = join(ROOT, 'frontend/dist')
describe.skipIf(!existsSync(FRONTEND_DIST))('SC-ISO-02 el bundle del frontend no contiene el admin', () => {
  it('sin X-Admin-Token ni rutas /api/songs/ en el bundle', () => {
    const bundle = walk(FRONTEND_DIST).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(bundle).not.toContain('X-Admin-Token')
    expect(bundle).not.toContain('/api/songs/')
  })
})
