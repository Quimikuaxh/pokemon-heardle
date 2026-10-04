// Contrato: src/ids.ts exporta slugify(text): string y uniqueId(base, taken: Set<string>): string (DEC-39).
import { describe, it, expect } from 'vitest'
import { slugify, uniqueId } from '../src/ids'
import { draftCatalog } from '../src/draft'
import { validateCatalog } from '../../../shared/catalog'

const VALID_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('ids slugify / uniqueId', () => {
  it('SC-ID-01 "Pokemon Ruby / Sapphire / Emerald" -> pokemon-ruby-sapphire-emerald', () => {
    expect(slugify('Pokemon Ruby / Sapphire / Emerald')).toBe('pokemon-ruby-sapphire-emerald')
  })

  it('SC-ID-01 quita acentos y pasa a minusculas', () => {
    expect(slugify('Pokémon Diamond & Pearl')).toBe('pokemon-diamond-pearl')
    expect(slugify('ÁÉÍÓÚ ñ')).toBe('aeiou-n')
  })

  for (const text of ['  --Héllo__Wörld!!  ', "N's Castle", "N’s Castle (Día)", 'a   b', 'Route 101 - Night', '★ Star ★ Road', '日本語 Title']) {
    it(`SC-ID-01 ${JSON.stringify(text)} produce solo [a-z0-9-], sin guiones dobles ni en los extremos`, () => {
      const slug = slugify(text)
      if (slug !== '') expect(slug).toMatch(VALID_SLUG)
      expect(slug).not.toContain('--')
      expect(slug.startsWith('-') || slug.endsWith('-')).toBe(false)
    })
  }

  it('SC-ID-01 cadena vacia -> cadena vacia', () => {
    expect(slugify('')).toBe('')
  })

  it('SC-ID-02 sin colision devuelve la base', () => {
    expect(uniqueId('ruby', new Set())).toBe('ruby')
  })

  it('SC-ID-02 colision: anade sufijo -2', () => {
    expect(uniqueId('ruby', new Set(['ruby']))).toBe('ruby-2')
  })

  it('SC-ID-02 colisiones sucesivas: -3', () => {
    expect(uniqueId('ruby', new Set(['ruby', 'ruby-2']))).toBe('ruby-3')
  })

  it('SC-ID-02 es estable: mismo conjunto -> mismo resultado', () => {
    expect(uniqueId('ruby', new Set(['ruby']))).toBe(uniqueId('ruby', new Set(['ruby'])))
  })

  it('SC-ID-02 una base larga se recorta y el resultado sigue siendo valido y unico', () => {
    const base = 'a'.repeat(200)
    const first = uniqueId(base, new Set())
    const second = uniqueId(base, new Set([first]))
    expect(first.length).toBeLessThanOrEqual(64)
    expect(second).not.toBe(first)
    expect(second).toMatch(VALID_SLUG)
  })

  for (const name of ['???', '!!!', '   ', '★★★', '']) {
    it(`SC-ID-03 un nombre sin slug (${JSON.stringify(name)}) nunca da un id vacio`, () => {
      const id = uniqueId(slugify(name), new Set())
      expect(id.length).toBeGreaterThan(0)
      expect(id).toMatch(VALID_SLUG)
    })
  }

  it('SC-ID-03 dos nombres sin slug obtienen ids distintos', () => {
    const taken = new Set<string>()
    const a = uniqueId(slugify('???'), taken)
    const b = uniqueId(slugify('!!!'), new Set([a]))
    expect(a).not.toBe(b)
  })

  it('SC-ID-05 los ids generados por draft cumplen los formatos de DEC-29 (juego y cancion)', () => {
    const videos = [
      { youtubeId: 'vid00000001', title: 'Pokémon Ruby/Sapphire/Emerald - Littleroot Town' },
      { youtubeId: 'vid00000002', title: "Pokemon Black/White - N's Castle (Día)" },
      { youtubeId: 'vid00000003', title: 'Pokemon X/Y - ★ Lumiose City ★' },
    ]
    const catalog = draftCatalog(null, videos, {})
    expect(validateCatalog(catalog).ok).toBe(true)
    for (const g of catalog.games) expect(g.id).toMatch(/^[A-Za-z0-9-]+$/)
    for (const s of catalog.songs) expect(s.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('SC-ID-04 draft usa la misma funcion: el id del juego de draft coincide con slugify/uniqueId del modulo comun', () => {
    const catalog = draftCatalog(null, [{ youtubeId: 'vid00000001', title: 'Pokemon Ruby/Sapphire/Emerald - Littleroot Town' }], {})
    const expected = uniqueId(slugify('Pokemon Ruby/Sapphire/Emerald').slice(0, 40), new Set())
    expect(catalog.games[0].id).toBe(expected)
  })
})
