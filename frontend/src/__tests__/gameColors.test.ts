import { describe, it, expect } from 'vitest'
import { FALLBACK_GAME_COLORS, GAME_COLORS, gameColor, shortGameName } from '../game/gameColors'

describe('game/gameColors (mapa unico de colores por juego)', () => {
  it('FE-DSN-01 los juegos conocidos usan el color del mapa', () => {
    for (const [id, color] of Object.entries(GAME_COLORS)) expect(gameColor(id)).toBe(color)
    expect(gameColor('pokemon-ruby-sapphire-emerald')).toBe('#b83a45')
  })

  it('FE-DSN-01 un juego nuevo recibe un color de la paleta de reserva, siempre el mismo para el mismo id', () => {
    const color = gameColor('pokemon-x-y')
    expect(FALLBACK_GAME_COLORS).toContain(color)
    expect(gameColor('pokemon-x-y')).toBe(color)
  })

  it('FE-DSN-01 ids vacios o raros no lanzan y devuelven un color valido', () => {
    for (const id of ['', '   ', '__proto__', 'constructor', '日本語']) expect(gameColor(id)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('FE-DSN-01 la paleta de reserva reparte juegos distintos en colores distintos (no todos iguales)', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => gameColor(`juego-${id}`)))
    expect(colors.size).toBeGreaterThan(2)
  })

  it('FE-DSN-02 shortGameName quita el prefijo "Pokémon " (con o sin acento) y respeta el resto', () => {
    expect(shortGameName('Pokémon Black/White')).toBe('Black/White')
    expect(shortGameName('Pokemon Ruby / Sapphire / Emerald')).toBe('Ruby / Sapphire / Emerald')
    expect(shortGameName('Black 2/White 2')).toBe('Black 2/White 2')
  })
})
