// Contrato: shared/catalog.ts exporta
//   validateCatalog(input: unknown):
//       { ok: true; catalog: Catalog } | { ok: false; errors: string[] }
// Nunca lanza, acumula todos los errores y cada error es un string descriptivo
// que menciona el id/valor ofensor cuando existe.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateCatalog, tooShort, seriesOf } from '../catalog'

function base(): any {
  return {
    version: 1,
    generatedAt: '2026-10-03T12:00:00Z',
    games: [
      { id: 'rse', name: 'Pokemon Ruby / Sapphire / Emerald', consoles: ['GBA'] },
      { id: 'dp', name: 'Pokemon Diamond / Pearl', consoles: ['DS'] },
    ],
    songs: [
      {
        id: 'rse-littleroot-town',
        title: 'Littleroot Town',
        games: ['rse'],
        clipKey: '9f3a1c0e5b7d2a46',
        startSec: 0,
        enabled: true,
        reviewed: false,
        source: { youtubeId: 'xxxxxxxxxxx', videoTitle: 'video original', durationSec: 183.42 },
      },
      {
        id: 'dp-twinleaf-town',
        title: 'Twinleaf Town',
        games: ['dp'],
        clipKey: '0123456789abcdef',
        startSec: 12.5,
        enabled: true,
        reviewed: true,
        source: { youtubeId: 'yyyyyyyyyyy', videoTitle: 'otro video' },
      },
    ],
  }
}

const errorsOf = (r: any): string[] => (r.ok ? [] : r.errors)

describe('shared/catalog validateCatalog', () => {
  it('SH-CAT-01 acepta un catalogo valido minimo', () => {
    expect(validateCatalog(base()).ok).toBe(true)
  })

  it('SH-CAT-01 acepta scripts/catalog/catalog.example.json', () => {
    const p = fileURLToPath(new URL('../../scripts/catalog/catalog.example.json', import.meta.url))
    const json = JSON.parse(readFileSync(p, 'utf8'))
    const r = validateCatalog(json)
    expect(errorsOf(r)).toEqual([])
  })

  it('SH-CAT-02 rechaza ids de cancion duplicados y nombra el id', () => {
    const c = base()
    c.songs[1].id = c.songs[0].id
    const r = validateCatalog(c)
    expect(r.ok).toBe(false)
    expect(errorsOf(r).some((e) => e.includes('rse-littleroot-town'))).toBe(true)
  })

  for (const bad of ['Littleroot', 'little root', 'little_root', '', 'pokémon-é', 'a/b', 'A-b']) {
    it(`SH-CAT-03 rechaza id de cancion invalido ${JSON.stringify(bad)}`, () => {
      const c = base()
      c.songs[0].id = bad
      expect(validateCatalog(c).ok).toBe(false)
    })
  }

  it('SH-CAT-04 rechaza id de juego duplicado', () => {
    const c = base()
    c.games[1].id = 'rse'
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SH-CAT-04 rechaza id de juego con formato invalido', () => {
    const c = base()
    c.games[0].id = 'RSE Game'
    c.songs[0].games = ['RSE Game']
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SH-CAT-05 rechaza clipKey duplicado', () => {
    const c = base()
    c.songs[1].clipKey = c.songs[0].clipKey
    const r = validateCatalog(c)
    expect(r.ok).toBe(false)
    expect(errorsOf(r).some((e) => e.includes(c.songs[0].clipKey))).toBe(true)
  })

  for (const [label, key] of [
    ['15 hex', '0123456789abcde'],
    ['17 hex', '0123456789abcdef0'],
    ['mayusculas', '0123456789ABCDEF'],
    ['no hex', '0123456789abcdeg'],
    ['vacio', ''],
    ['numero', 1234567890123456],
    ['null', null],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-06 rechaza clipKey mal formado (${label})`, () => {
      const c = base()
      c.songs[0].clipKey = key
      expect(validateCatalog(c).ok).toBe(false)
    })
  }

  it('SH-CAT-07 rechaza cancion que referencia un juego inexistente', () => {
    const c = base()
    c.songs[0].games = ['no-existe']
    const r = validateCatalog(c)
    expect(r.ok).toBe(false)
    expect(errorsOf(r).some((e) => e.includes('no-existe'))).toBe(true)
  })

  it('SH-CAT-08 games vacio en una cancion -> error que nombra la cancion y dice "exactamente un juego"', () => {
    const c = base()
    c.songs[0].games = []
    const r = validateCatalog(c)
    expect(r.ok).toBe(false)
    const e = errorsOf(r).filter((x) => x.includes('rse-littleroot-town'))
    expect(e.join('\n')).toMatch(/exactamente un juego/i)
  })

  for (const [label, games] of [
    ['dos juegos distintos', ['rse', 'dp']],
    ['dos iguales', ['rse', 'rse']],
    ['tres juegos', ['rse', 'dp', 'rse']],
  ] as Array<[string, string[]]>) {
    it(`SH-CAT-08 games con ${label} -> error que nombra la cancion y dice "exactamente un juego"`, () => {
      const c = base()
      c.songs[0].games = games
      const r = validateCatalog(c)
      expect(r.ok).toBe(false)
      expect(errorsOf(r).filter((x) => x.includes('rse-littleroot-town')).join('\n')).toMatch(/exactamente un juego/i)
    })
  }

  it('SH-CAT-09 rechaza startSec -1', () => {
    const c = base()
    c.songs[0].startSec = -1
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SH-CAT-09 rechaza startSec -0.001', () => {
    const c = base()
    c.songs[0].startSec = -0.001
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SH-CAT-09 acepta startSec 0 y decimales positivos', () => {
    const c = base()
    c.songs[0].startSec = 0
    c.songs[1].startSec = 0.001
    expect(validateCatalog(c).ok).toBe(true)
  })

  for (const [label, v] of [
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['string', '5'],
    ['null', null],
    ['undefined', undefined],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-10 rechaza startSec ${label}`, () => {
      const c = base()
      c.songs[0].startSec = v
      expect(validateCatalog(c).ok).toBe(false)
    })
  }

  for (const [label, mutate] of [
    ['version distinta de 1', (c: any) => (c.version = 2)],
    ['falta version', (c: any) => delete c.version],
    ['falta games', (c: any) => delete c.games],
    ['falta songs', (c: any) => delete c.songs],
    ['cancion sin title', (c: any) => delete c.songs[0].title],
    ['cancion sin clipKey', (c: any) => delete c.songs[0].clipKey],
    ['cancion sin enabled', (c: any) => delete c.songs[0].enabled],
  ] as Array<[string, (c: any) => void]>) {
    it(`SH-CAT-11 rechaza sin lanzar: ${label}`, () => {
      const c = base()
      mutate(c)
      const r = validateCatalog(c)
      expect(r.ok).toBe(false)
      expect(errorsOf(r).length).toBeGreaterThan(0)
    })
  }

  for (const [label, v] of [
    ['null', null],
    ['undefined', undefined],
    ['array', []],
    ['string', 'catalog'],
    ['numero', 42],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-11 raiz no objeto (${label}) devuelve error sin lanzar`, () => {
      expect(() => validateCatalog(v)).not.toThrow()
      expect(validateCatalog(v).ok).toBe(false)
    })
  }

  it('SH-CAT-12 games ["a","a"] y games ["a","b"] son error (DEC-53); ya no hay normalizacion', () => {
    for (const games of [['rse', 'rse'], ['rse', 'dp']]) {
      const c = base()
      c.songs[0].games = games
      expect(validateCatalog(c).ok, JSON.stringify(games)).toBe(false)
    }
  })

  it('SH-CAT-13 acumula todos los errores, no solo el primero', () => {
    const c = base()
    c.songs[0].clipKey = 'zz'
    c.songs[0].startSec = -5
    c.songs[1].games = []
    const r = validateCatalog(c)
    expect(errorsOf(r).length).toBeGreaterThanOrEqual(3)
  })

  it('SH-CAT-14 una sola cancion habilitada es valido', () => {
    const c = base()
    c.songs[1].enabled = false
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SH-CAT-14 todas deshabilitadas es valido (lo gestiona el backend)', () => {
    const c = base()
    c.songs.forEach((s: any) => (s.enabled = false))
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SH-CAT-01 el ejemplo versionado incluye source.durationSec', () => {
    const p = fileURLToPath(new URL('../../scripts/catalog/catalog.example.json', import.meta.url))
    const json = JSON.parse(readFileSync(p, 'utf8'))
    expect(json.songs.every((s: any) => typeof s.source.durationSec === 'number')).toBe(true)
  })

  for (const id of ['dQw4w9WgXcQ', '-BRQ_XVwg-M', '___________', '-----------', 'AbCdEfGhIjK']) {
    it(`SH-CAT-15 source.youtubeId valido ${JSON.stringify(id)}`, () => {
      const c = base()
      c.songs[0].source.youtubeId = id
      expect(errorsOf(validateCatalog(c))).toEqual([])
    })
  }

  for (const [label, id] of [
    ['10 caracteres', 'abcdefghij'],
    ['12 caracteres', 'abcdefghijkl'],
    ['vacio', ''],
    ['con espacio', 'abcde fghij'],
    ['con /', 'abcde/fghij'],
    ['con comillas', 'abcde"fghij'],
    ['con <', 'abcde<fghij'],
    ['con punto', 'abcde.fghij'],
    ['unicode', 'abcdeéfghij'],
    ['inyeccion', '"><script>1'],
    ['no string (numero)', 12345678901],
    ['null', null],
    ['ausente', undefined],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-16 source.youtubeId invalido (${label})`, () => {
      const c = base()
      if (id === undefined) delete c.songs[0].source.youtubeId
      else c.songs[0].source.youtubeId = id
      const r = validateCatalog(c)
      expect(r.ok).toBe(false)
    })
  }

  it('SH-CAT-16 el error de youtubeId nombra la cancion', () => {
    const c = base()
    c.songs[0].source.youtubeId = 'corto'
    expect(errorsOf(validateCatalog(c)).some((e) => e.includes('rse-littleroot-town'))).toBe(true)
  })

  it('SH-CAT-17 source.durationSec ausente es valido', () => {
    const c = base()
    delete c.songs[0].source.durationSec
    expect(validateCatalog(c).ok).toBe(true)
  })

  for (const v of [16.1, 183.42, 0.001, 1e6]) {
    it(`SH-CAT-17 durationSec ${v} (finito > 0) es valido`, () => {
      const c = base()
      c.songs[1].enabled = false // una duracion pequena no debe invalidar por la regla de corta si esta desactivada
      c.songs[1].source.durationSec = v
      expect(validateCatalog(c).ok).toBe(true)
    })
  }

  for (const [label, v] of [
    ['0', 0],
    ['negativo', -5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['string', '183'],
    ['null', null],
    ['objeto', {}],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-17 durationSec invalido (${label})`, () => {
      const c = base()
      c.songs[1].enabled = false
      c.songs[1].source.durationSec = v
      expect(validateCatalog(c).ok).toBe(false)
    })
  }

  const LIMIT = 16 + 0.1
  for (const [label, dur, start, short] of [
    ['startSec 0: 16,1 no es corta', LIMIT, 0, false],
    ['startSec 0: 16,0999 es corta', LIMIT - 0.0001, 0, true],
    ['startSec 0: 16,0 es corta', 16, 0, true],
    ['startSec 0: 0,5 es corta', 0.5, 0, true],
    ['startSec 0: 183 no es corta', 183, 0, false],
    ['startSec 5: 21,1 no es corta', 5 + LIMIT, 5, false],
    ['startSec 5: 21,0999 es corta', 5 + LIMIT - 0.0001, 5, true],
  ] as Array<[string, number, number, boolean]>) {
    it(`SH-CAT-18 tooShort: ${label}`, () => {
      expect(tooShort(dur, start)).toBe(short)
    })
  }

  it('SH-CAT-18 tooShort con duracion desconocida (undefined) no es corta', () => {
    expect(tooShort(undefined, 0)).toBe(false)
  })

  it('SH-CAT-19 cancion enabled y corta -> error que nombra la cancion', () => {
    const c = base()
    c.songs[0].source.durationSec = 7.4
    const r = validateCatalog(c)
    expect(r.ok).toBe(false)
    expect(errorsOf(r).some((e) => e.includes('rse-littleroot-town'))).toBe(true)
  })

  it('SH-CAT-19 el error de corta incluye la duracion medida', () => {
    const c = base()
    c.songs[0].source.durationSec = 7.4
    expect(errorsOf(validateCatalog(c)).join('\n')).toMatch(/7[.,]4/)
  })

  it('SH-CAT-19 cancion enabled:false y corta -> valido', () => {
    const c = base()
    c.songs[0].enabled = false
    c.songs[0].source.durationSec = 7.4
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SH-CAT-20 cancion enabled sin durationSec -> valido (duracion desconocida no es corta)', () => {
    const c = base()
    delete c.songs[0].source.durationSec
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SH-CAT-21 tooShort es derivado de startSec: 20 s con startSec 0 no es corta y con startSec 5 si', () => {
    expect(tooShort(20, 0)).toBe(false)
    expect(tooShort(20, 5)).toBe(true)
  })

  it('SH-CAT-21 la regla se aplica al validar con el startSec editado a mano', () => {
    const c = base()
    c.songs[0].source.durationSec = 20
    expect(validateCatalog(c).ok).toBe(true)
    c.songs[0].startSec = 5
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SH-CAT-21 el validador no exige ni acepta un campo tooShort persistido como fuente de verdad', () => {
    const c = base()
    c.songs[0].source.durationSec = 7.4
    c.songs[0].tooShort = false // persistido y falso: la regla derivada manda
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SH-CAT-22 source.leadingSilenceSec ausente o numero finito >= 0 es valido; startSecManual booleano es valido', () => {
    const c = base()
    expect(validateCatalog(c).ok).toBe(true)
    c.songs[0].source.leadingSilenceSec = 0
    c.songs[1].source.leadingSilenceSec = 2.46
    c.songs[0].startSecManual = true
    expect(validateCatalog(c).ok).toBe(true)
  })

  for (const [label, value] of [['negativo', -0.1], ['NaN', NaN], ['Infinity', Infinity], ['string', '0.5'], ['null', null]] as Array<[string, unknown]>) {
    it(`SH-CAT-22 source.leadingSilenceSec invalido (${label})`, () => {
      const c = base()
      c.songs[0].source.leadingSilenceSec = value
      const r = validateCatalog(c)
      expect(r.ok).toBe(false)
      expect(errorsOf(r).some((e) => e.includes('rse-littleroot-town') && e.includes('leadingSilenceSec'))).toBe(true)
    })
  }

  for (const value of ['si', 1, null]) {
    it(`SH-CAT-22 startSecManual no booleano (${JSON.stringify(value)}) es invalido`, () => {
      const c = base()
      c.songs[0].startSecManual = value
      expect(validateCatalog(c).ok).toBe(false)
    })
  }

  it('SH-CAT-22 la regla de corta usa el startSec efectivo (el automatico incluido)', () => {
    const c = base()
    c.songs[0].source.durationSec = 16.3
    expect(validateCatalog(c).ok).toBe(true)
    c.songs[0].startSec = 0.45
    expect(validateCatalog(c).ok).toBe(false)
  })

  // ---- DEC-51: Game.consoles ----
  const withGame = (patch: Record<string, unknown>) => {
    const c = base()
    c.games[0] = { ...c.games[0], ...patch }
    return c
  }

  it('SH-CAT-22 Game.consoles ausente es valido en shared', () => {
    const c = base()
    delete c.games[0].consoles
    delete c.games[1].consoles
    expect(validateCatalog(c).ok).toBe(true)
  })

  for (const consoles of [['GBA'], ['Switch', 'Switch 2'], ['Switch 2'], ['GB', 'GBC'], ['GB', 'GBC', 'GBA', 'DS', '3DS', 'Switch', 'Switch 2']]) {
    it(`SH-CAT-23 consoles valida ${JSON.stringify(consoles)} (orden canonico)`, () => {
      expect(errorsOf(validateCatalog(withGame({ consoles })))).toEqual([])
    })
  }

  it('SH-CAT-24 consoles: [] -> error que nombra el juego', () => {
    const r = validateCatalog(withGame({ consoles: [] }))
    expect(r.ok).toBe(false)
    expect(errorsOf(r).join('\n')).toContain('rse')
  })

  for (const [label, consoles] of [
    ['PS5', ['PS5']],
    ['minusculas', ['switch']],
    ['sin espacio', ['Switch2']],
    ['cadena vacia', ['']],
    ['mezcla valida e invalida', ['GBA', 'Wii']],
    ['string', 'GBA'],
    ['numero', 3],
    ['objeto', { 0: 'GBA' }],
    ['null', null],
    ['elemento numerico', [1]],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-25 consoles invalidas (${label}) -> error que nombra el juego`, () => {
      const r = validateCatalog(withGame({ consoles }))
      expect(r.ok).toBe(false)
      expect(errorsOf(r).join('\n')).toContain('rse')
    })
  }

  it('SH-CAT-26 consoles desordenada (["Switch 2","Switch"]) -> error "orden canonico"', () => {
    const r = validateCatalog(withGame({ consoles: ['Switch 2', 'Switch'] }))
    expect(r.ok).toBe(false)
    expect(errorsOf(r).join('\n')).toMatch(/orden can[oó]nico/i)
  })

  it('SH-CAT-26 desordenada entre consolas no adyacentes (["DS","GB"]) tambien', () => {
    expect(validateCatalog(withGame({ consoles: ['DS', 'GB'] })).ok).toBe(false)
  })

  it('SH-CAT-27 consoles con repetidos -> error', () => {
    expect(validateCatalog(withGame({ consoles: ['GBA', 'GBA'] })).ok).toBe(false)
  })

  // ---- DEC-54: Game.selectionGroup ----
  const grouped = (patches: Record<string, Record<string, unknown>>) => {
    const c = base()
    c.games.push({ id: 'dp2', name: 'Pokemon Diamond 2', consoles: ['DS'] }, { id: 'c', name: 'Cadena', consoles: ['DS'] })
    for (const [id, patch] of Object.entries(patches)) {
      const g = c.games.find((x: any) => x.id === id)
      Object.assign(g, patch)
    }
    return c
  }

  it('SH-CAT-28 selectionGroup ausente es valido', () => {
    expect(validateCatalog(base()).ok).toBe(true)
  })

  it('SH-CAT-29 selectionGroup = id de un juego cabeza (dp2 -> dp) es valido', () => {
    expect(errorsOf(validateCatalog(grouped({ dp2: { selectionGroup: 'dp' } })))).toEqual([])
  })

  it('SH-CAT-29 varios miembros del mismo grupo (dp2 y c -> dp)', () => {
    expect(errorsOf(validateCatalog(grouped({ dp2: { selectionGroup: 'dp' }, c: { selectionGroup: 'dp' } })))).toEqual([])
  })

  it('SH-CAT-30 selectionGroup que apunta a un id inexistente -> error que nombra juego e id', () => {
    const r = validateCatalog(grouped({ dp2: { selectionGroup: 'no-existe' } }))
    expect(r.ok).toBe(false)
    const text = errorsOf(r).join('\n')
    expect(text).toContain('dp2')
    expect(text).toContain('no-existe')
  })

  it('SH-CAT-31 cadena c -> dp2 -> dp es error en c', () => {
    const r = validateCatalog(grouped({ dp2: { selectionGroup: 'dp' }, c: { selectionGroup: 'dp2' } }))
    expect(r.ok).toBe(false)
    expect(errorsOf(r).join('\n')).toContain('c')
  })

  it('SH-CAT-32 ciclo dp -> dp2 -> dp es error', () => {
    expect(validateCatalog(grouped({ dp: { selectionGroup: 'dp2' }, dp2: { selectionGroup: 'dp' } })).ok).toBe(false)
  })

  it('SH-CAT-33 autorreferencia (dp -> dp) es valida (equivale a ausente)', () => {
    expect(errorsOf(validateCatalog(grouped({ dp: { selectionGroup: 'dp' } })))).toEqual([])
  })

  for (const [label, value] of [
    ['vacio', ''],
    ['numero', 5],
    ['null', null],
    ['array', ['dp']],
    ['objeto', { id: 'dp' }],
    ['id mal formado', 'dp 2'],
    ['con barra', 'dp/2'],
  ] as Array<[string, unknown]>) {
    it(`SH-CAT-34 selectionGroup de tipo/formato invalido (${label}) -> error`, () => {
      expect(validateCatalog(grouped({ dp2: { selectionGroup: value } })).ok).toBe(false)
    })
  }

  it('SH-CAT-35 un juego cabeza de otros no puede pasar a miembro de otro grupo (dp cabeza de dp2; dp -> c)', () => {
    const r = validateCatalog(grouped({ dp2: { selectionGroup: 'dp' }, dp: { selectionGroup: 'c' } }))
    expect(r.ok).toBe(false)
  })

  it('SH-CAT-36 un grupo cuyo juego cabeza no tiene canciones activas sigue siendo valido', () => {
    const c = grouped({ dp2: { selectionGroup: 'dp' } })
    c.songs[1].enabled = false // dp (cabeza) sin activas
    expect(errorsOf(validateCatalog(c))).toEqual([])
  })

  it('SH-CAT-37 el validador acumula errores de consolas y de grupos junto con los de canciones', () => {
    const c = grouped({ dp2: { selectionGroup: 'zz', consoles: [] } })
    c.songs[0].games = ['rse', 'dp']
    expect(errorsOf(validateCatalog(c)).length).toBeGreaterThanOrEqual(3)
  })

  // ---- DEC-60: Game.series ----
  it('SH-CAT-40 series ausente, main o spinoff es valido', () => {
    expect(errorsOf(validateCatalog(grouped({})))).toEqual([])
    expect(errorsOf(validateCatalog(grouped({ dp2: { series: 'spinoff' }, c: { series: 'main' } })))).toEqual([])
  })

  for (const [label, value] of [['otro texto', 'side'], ['numero', 1], ['null', null]] as const) {
    it(`SH-CAT-41 series no valida (${label}) -> error que nombra juego y valor`, () => {
      const errors = errorsOf(validateCatalog(grouped({ dp2: { series: value } })))
      expect(errors.some((e: string) => e.includes('dp2') && e.includes('series'))).toBe(true)
    })
  }

  it('SH-CAT-42 un grupo de seleccion no puede mezclar series', () => {
    const errors = errorsOf(validateCatalog(grouped({ dp2: { selectionGroup: 'dp', series: 'spinoff' } })))
    expect(errors.some((e: string) => e.includes('dp2') && e.includes('otra serie'))).toBe(true)
    expect(errorsOf(validateCatalog(grouped({ dp: { series: 'spinoff' }, dp2: { selectionGroup: 'dp', series: 'spinoff' } })))).toEqual([])
  })

  it('SH-CAT-43 seriesOf: sin series es main', () => {
    expect(seriesOf({})).toBe('main')
    expect(seriesOf({ series: 'spinoff' })).toBe('spinoff')
  })
})
