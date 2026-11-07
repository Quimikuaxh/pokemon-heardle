// Empaqueta la Edge Function `heardle` (src/edge/main.ts) en un solo fichero ESM para Deno (DEC-57).
// Salida: ../supabase/functions/heardle/index.js (generada, ignorada por git).
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

await build({
  entryPoints: [`${root}src/edge/main.ts`],
  outfile: `${root}../supabase/functions/heardle/index.js`,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  // Deno resuelve los modulos node: por si mismo; Buffer no es global en el runtime de Supabase.
  external: ['node:*'],
  banner: { js: "import { Buffer } from 'node:buffer';\nglobalThis.Buffer ??= Buffer;" },
  legalComments: 'none',
  logLevel: 'info',
})
