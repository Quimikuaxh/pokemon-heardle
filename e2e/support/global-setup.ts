import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { E2E_DIR } from './env.ts'

// Los MP3 estan versionados; si faltan (checkout parcial) se regeneran con el encoder JS.
export default function globalSetup() {
  const sample = join(E2E_DIR, 'fixtures', 'M', 'clips', 'aaaaaaaaaaaaaaaa', '6.mp3')
  if (!existsSync(sample)) execFileSync('node', ['scripts/generate-fixtures.ts'], { cwd: E2E_DIR, stdio: 'inherit' })
}
