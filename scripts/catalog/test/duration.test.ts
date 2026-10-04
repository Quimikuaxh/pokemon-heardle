// Contrato: src/duration.ts (ver helpers/data.ts)
import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseFfprobeDuration, measureDuration, findSourceFile } from '../src/duration'
import { tmp } from './helpers/data'

describe('parseFfprobeDuration', () => {
  it('SC-DUR-01 "183.420000" -> 183.42', () => {
    expect(parseFfprobeDuration('183.420000\n')).toBeCloseTo(183.42, 6)
  })

  it('SC-DUR-01 tolera espacios, CRLF y enteros', () => {
    expect(parseFfprobeDuration('  7.4 \r\n')).toBeCloseTo(7.4, 6)
    expect(parseFfprobeDuration('40')).toBe(40)
  })

  for (const out of ['N/A', '', '   ', 'abc', '-3', '0', '0.000000', '-0.5', 'Infinity', 'NaN', '1e999', 'duration=12']) {
    it(`SC-DUR-02 salida invalida ${JSON.stringify(out)} -> null (no medible), sin lanzar`, () => {
      expect(parseFfprobeDuration(out)).toBeNull()
    })
  }
})

const okRunner = (stdout: string) => vi.fn(async (_c: string, _a: string[]) => ({ stdout }))

describe('measureDuration', () => {
  it('SC-DUR-01 llama a ffprobe y devuelve la duracion', async () => {
    const run = okRunner('7.400000\n')
    expect(await measureDuration('/abs/a.webm', run)).toBeCloseTo(7.4, 6)
    expect(run.mock.calls[0][0]).toBe('ffprobe')
  })

  it('SC-DUR-02 salida N/A -> null sin lanzar', async () => {
    expect(await measureDuration('/abs/a.webm', okRunner('N/A\n'))).toBeNull()
  })

  it('SC-DUR-03 youtubeId con "-" inicial: el argumento de fichero es una ruta absoluta (no se interpreta como opcion)', async () => {
    const run = okRunner('9\n')
    await measureDuration('-BRQ_XVwg-M.webm', run)
    const file = run.mock.calls[0][1].at(-1)!
    expect([isAbsolute(file), file.startsWith('-')]).toEqual([true, false])
  })

  it('SC-DUR-03 una ruta absoluta ya valida se pasa tal cual', async () => {
    const run = okRunner('9\n')
    await measureDuration('/tmp/work/-BRQ_XVwg-M.webm', run)
    expect(run.mock.calls[0][1].at(-1)).toBe('/tmp/work/-BRQ_XVwg-M.webm')
  })

  it('SC-DUR-04 argv como array: ruta con espacios, comillas y ; viaja intacta en un unico argumento', async () => {
    const run = okRunner('9\n')
    const evil = `/tmp/my work/it's "x"; rm -rf ~ $(whoami).webm`
    await measureDuration(evil, run)
    const args = run.mock.calls[0][1]
    expect(args.filter((a) => a === evil).length).toBe(1)
    expect(args.at(-1)).toBe(evil)
  })

  it('SC-DUR-05 ffprobe no instalado (ENOENT) -> rechaza con mensaje claro que nombra ffprobe', async () => {
    const run = vi.fn(async () => {
      throw Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' })
    })
    await expect(measureDuration('/abs/a.webm', run)).rejects.toThrow(/ffprobe/i)
  })

  it('SC-DUR-05 ffprobe sale con codigo != 0 -> rechaza con mensaje que nombra ffprobe', async () => {
    const run = vi.fn(async () => {
      throw Object.assign(new Error('Command failed'), { code: 1, stderr: 'Invalid data found' })
    })
    await expect(measureDuration('/abs/a.webm', run)).rejects.toThrow(/ffprobe/i)
  })
})

describe('findSourceFile', () => {
  const work = (files: string[]) => {
    const dir = tmp()
    mkdirSync(dir, { recursive: true })
    for (const f of files) writeFileSync(join(dir, f), 'x')
    return dir
  }

  it('SC-DUR-06 ignora .part, .ytdl y .json y elige el medio valido', () => {
    const dir = work(['abcdefghijk.webm.part', 'abcdefghijk.webm.ytdl', 'abcdefghijk.info.json', 'abcdefghijk.f251.webm.part', 'abcdefghijk.m4a'])
    expect(findSourceFile(dir, 'abcdefghijk')).toBe(join(dir, 'abcdefghijk.m4a'))
  })

  it('SC-DUR-06 sin medio valido -> undefined ("sin fuente")', () => {
    const dir = work(['abcdefghijk.webm.part', 'abcdefghijk.info.json', 'playlist.json', 'download-archive.txt'])
    expect(findSourceFile(dir, 'abcdefghijk')).toBeUndefined()
  })

  it('SC-DUR-06 no confunde ids con prefijo comun', () => {
    const dir = work(['abcdefghijkl.webm', 'abcdefghijk-x.webm'])
    expect(findSourceFile(dir, 'abcdefghijk')).toBeUndefined()
  })

  it('SC-DUR-06 encuentra ids que empiezan por "-" y devuelve ruta absoluta', () => {
    const dir = work(['-BRQ_XVwg-M.webm'])
    const found = findSourceFile(dir, '-BRQ_XVwg-M')!
    expect([found.endsWith('-BRQ_XVwg-M.webm'), isAbsolute(found)]).toEqual([true, true])
  })

  it('SC-DUR-06 directorio work inexistente -> undefined sin lanzar', () => {
    expect(findSourceFile(join(tmp(), 'no-existe'), 'abcdefghijk')).toBeUndefined()
  })
})

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// SC-DUR-07: solo con ffmpeg instalado; si no, se omite de forma explicita.
describe.skipIf(!hasFfmpeg())('SC-DUR-07 medicion real con ffprobe', () => {
  for (const seconds of [7.4, 40]) {
    it(`mide un tono de ${seconds} s (+-0,05)`, async () => {
      const file = join(tmp(), `tone-${seconds}.webm`)
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:a', 'libopus', file], { stdio: 'ignore' })
      const measured = await measureDuration(file)
      expect(Math.abs(measured! - seconds)).toBeLessThan(0.05)
    })
  }
})

describe('findSourceFile: id estricto', () => {
  for (const id of ['', '.', '..', 'corto', 'doce_chars_12', '../x']) {
    it(`SC-DUR-08 id ${JSON.stringify(id)} no devuelve ficheros de work/ (ni ocultos)`, () => {
      const work = tmp()
      writeFileSync(join(work, '.secret'), 'x')
      writeFileSync(join(work, '..webm'), 'x')
      expect(findSourceFile(work, id)).toBeUndefined()
    })
  }
})
