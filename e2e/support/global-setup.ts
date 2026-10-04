import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { E2E_DIR } from './env.ts'

export default function globalSetup() {
  // Los MP3 estan versionados; si faltan (checkout parcial) se regeneran con el encoder JS.
  const sample = join(E2E_DIR, 'fixtures', 'admin', 'work', 'longsrc0001.mp3')
  if (!existsSync(sample)) execFileSync('node', ['scripts/generate-fixtures.ts'], { cwd: E2E_DIR, stdio: 'inherit' })
  // El servidor del admin sirve admin-ui/dist (ignorado por git): se compila si no existe.
  const adminUi = join(E2E_DIR, '..', 'scripts', 'catalog', 'admin-ui')
  if (!existsSync(join(adminUi, 'dist', 'index.html'))) {
    execFileSync('npm', ['--prefix', adminUi, 'run', 'build'], { stdio: 'inherit' })
  }
}
