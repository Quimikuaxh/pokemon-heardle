import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

// Migracion real de supabase/migrations sobre PGlite, con los roles de Supabase creados a mano (DEC-57).
const MIGRATION = readFileSync(join(__dirname, '../../../supabase/migrations/20261107000000_heardle_rate_limit.sql'), 'utf8')
const ROLES = `create role anon nologin; create role authenticated nologin; create role service_role nologin;`

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(ROLES)
  await db.exec(MIGRATION)
})

const hit = async (checks: Array<{ bucket: string; key: string; limit: number }>, role = 'service_role') => {
  await db.exec(`set role ${role}`)
  try {
    const r = await db.query<{ retry: number }>('select public.heardle_rate_limit_hit($1::jsonb) as retry', [JSON.stringify(checks)])
    return r.rows[0].retry
  } finally {
    await db.exec('reset role')
  }
}

describe('heardle_rate_limit_hit', () => {
  it('deja pasar hasta el limite y despues devuelve los segundos de espera (1..60)', async () => {
    const check = [{ bucket: 'createGame', key: 'ip-a', limit: 3 }]
    for (let i = 0; i < 3; i++) expect(await hit(check)).toBe(0)
    const retry = await hit(check)
    expect(retry).toBeGreaterThanOrEqual(1)
    expect(retry).toBeLessThanOrEqual(60)
  })

  it('las claves y los contadores son independientes', async () => {
    for (let i = 0; i < 2; i++) expect(await hit([{ bucket: 'action', key: 'ip-a', limit: 2 }])).toBe(0)
    expect(await hit([{ bucket: 'action', key: 'ip-b', limit: 2 }])).toBe(0)
    expect(await hit([{ bucket: 'clips', key: 'ip-a', limit: 2 }])).toBe(0)
    expect(await hit([{ bucket: 'action', key: 'ip-a', limit: 2 }])).toBeGreaterThan(0)
  })

  it('cuenta en orden y para en la primera que se pasa: las siguientes no se cuentan', async () => {
    const checks = [
      { bucket: 'global', key: 'ip', limit: 1 },
      { bucket: 'action', key: 'ip', limit: 5 },
    ]
    expect(await hit(checks)).toBe(0)
    expect(await hit(checks)).toBeGreaterThan(0)
    const rows = await db.query<{ bucket: string; hits: number }>('select bucket, hits from heardle.rate_limits order by bucket')
    expect(rows.rows).toEqual([
      { bucket: 'action', hits: 1 },
      { bucket: 'global', hits: 2 },
    ])
  })

  it('una ventana de mas de 60 s se reinicia', async () => {
    const check = [{ bucket: 'createGame', key: 'ip', limit: 1 }]
    expect(await hit(check)).toBe(0)
    expect(await hit(check)).toBeGreaterThan(0)
    await db.exec(`update heardle.rate_limits set window_start = window_start - interval '61 seconds'`)
    expect(await hit(check)).toBe(0)
  })

  it('anon y authenticated no pueden ejecutarla ni leer la tabla', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(hit([{ bucket: 'global', key: 'x', limit: 1 }], role)).rejects.toThrow(/permission denied/)
      await db.exec(`set role ${role}`)
      await expect(db.query('select * from heardle.rate_limits')).rejects.toThrow(/permission denied/)
      await db.exec('reset role')
    }
  })

  it('la migracion se puede volver a aplicar', async () => {
    await db.exec(MIGRATION)
    expect(await hit([{ bucket: 'global', key: 'x', limit: 1 }])).toBe(0)
  })
})
