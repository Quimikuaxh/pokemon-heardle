// SC-GI-01: el .gitignore del repo cubre lo acordado (REQUISITOS 4, ARQUITECTURA 12).
// Solo lectura: `git check-ignore` no modifica nada. NOTA: este test pasa desde el inicio porque el
// .gitignore se entrega junto al esqueleto; protege contra regresiones.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ignored = (p: string) => spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: ROOT }).status === 0

describe('.gitignore', () => {
  for (const p of [
    'node_modules/x/index.js',
    'backend/node_modules/x/index.js',
    'frontend/dist/index.html',
    'dist/a.js',
    '.env',
    'backend/.env',
    '.env.local',
    '.env.production',
    'scripts/catalog/.env',
    'scripts/catalog/data/catalog.json',
    'scripts/catalog/data/work/vid.m4a',
    'scripts/catalog/data/out/clips/aaaaaaaaaaaaaaaa/1.mp3',
    'e2e/test-results/a.png',
    'clip.mp3',
    'backend/test/tmp/clip.mp3',
    // SC-GI-02: UI del admin y restos del catalogStore
    'scripts/catalog/admin-ui/dist/index.html',
    'scripts/catalog/admin-ui/node_modules/react/index.js',
    'scripts/catalog/data/catalog.json.bak',
    'scripts/catalog/data/catalog.json.tmp-12345',
  ]) {
    it(`SC-GI-01 ignora ${p}`, () => {
      expect(ignored(p)).toBe(true)
    })
  }

  for (const p of ['.env.example', 'backend/.env.example', 'e2e/fixtures/tone.mp3', 'scripts/catalog/catalog.example.json', 'backend/package.json', 'shared/api.ts']) {
    it(`SC-GI-01 NO ignora ${p}`, () => {
      expect(ignored(p)).toBe(false)
    })
  }
})
