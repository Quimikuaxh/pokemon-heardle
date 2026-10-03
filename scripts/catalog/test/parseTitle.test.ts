// Contrato: src/parseTitle.ts exporta
//   parseTitle(videoTitle: string): { title: string; games: string[]; needsReview: boolean }
// Funcion pura: nunca lanza. `games` son los nombres tal cual aparecen en el titulo del video
// (el id del juego lo deriva `draft`).
import { describe, it, expect } from 'vitest'
import { parseTitle } from '../src/parseTitle'

describe('parseTitle', () => {
  it('SC-PT-01 formato tipico "Juego - Cancion": separa titulo y juego', () => {
    expect(parseTitle('Pokemon Ruby/Sapphire/Emerald - Littleroot Town')).toEqual({
      title: 'Littleroot Town',
      games: ['Pokemon Ruby/Sapphire/Emerald'],
      needsReview: false,
    })
  })

  it('SC-PT-01 recorta espacios sobrantes alrededor del separador', () => {
    const r = parseTitle('  Pokemon Diamond/Pearl   -   Twinleaf Town  ')
    expect([r.title, r.games]).toEqual(['Twinleaf Town', ['Pokemon Diamond/Pearl']])
  })

  for (const t of [
    'Pokémon Diamond & Pearl – Twinleaf Town (Extended)',
    'Pokemon Black/White OST - N\'s Castle',
    'Pokemon HeartGold/SoulSilver - Ecruteak City 【Remastered】 🎵',
    'Pokemon X/Y - Lumiose City — Day',
    'Pokémon Sword & Shield OST - Wild Area (Day) - Extended',
    'ポケットモンスター ルビー・サファイア - ミシロタウン',
    'Pokemon Red/Blue/Yellow — Pallet Town',
  ]) {
    it(`SC-PT-02 no lanza y devuelve titulo no vacio: ${t}`, () => {
      const r = parseTitle(t)
      expect(r.title.length).toBeGreaterThan(0)
      expect(Array.isArray(r.games)).toBe(true)
    })
  }

  it('SC-PT-02 guiones largos (en/em dash) tambien separan', () => {
    expect(parseTitle('Pokemon X/Y – Lumiose City').title).toBe('Lumiose City')
    expect(parseTitle('Pokemon X/Y — Lumiose City').title).toBe('Lumiose City')
  })

  it('SC-PT-02 un titulo con guion interno en la cancion conserva el resto del titulo', () => {
    const r = parseTitle('Pokemon X/Y - Lumiose City - Night')
    expect(r.title).toContain('Lumiose City')
    expect(r.games.length).toBe(1)
  })

  it('SC-PT-03 sin separador: titulo completo, juego desconocido, marcado para revision', () => {
    expect(parseTitle('Una cancion sin formato')).toEqual({ title: 'Una cancion sin formato', games: [], needsReview: true })
  })

  it('SC-PT-04 cadena vacia: resultado seguro sin lanzar', () => {
    expect(parseTitle('')).toEqual({ title: '', games: [], needsReview: true })
  })

  it('SC-PT-04 solo espacios: resultado seguro sin lanzar', () => {
    expect(() => parseTitle('    ')).not.toThrow()
    expect(parseTitle('    ').needsReview).toBe(true)
  })

  it('SC-PT-03 solo separador: no lanza', () => {
    expect(() => parseTitle(' - ')).not.toThrow()
  })
})
