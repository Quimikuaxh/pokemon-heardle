import { describe, it, expect } from 'vitest'
import { matchesAllWords, normalizeText } from '../search'

describe('shared/search', () => {
  it('SH-SRC-01 normalizeText quita acentos, mayusculas y espacios extremos', () => {
    expect(normalizeText('  Pokémon RUBY ')).toBe('pokemon ruby')
  })

  it('SH-SRC-02 cada palabra puede coincidir en un campo distinto (juego + titulo)', () => {
    expect(matchesAllWords('ruby battle', ['Trainer Battle', 'Pokémon Ruby/Sapphire/Emerald'])).toBe(true)
  })

  it('SH-SRC-02 si una palabra no aparece en ningun campo, no coincide', () => {
    expect(matchesAllWords('ruby battle', ['Littleroot Town', 'Pokémon Ruby/Sapphire/Emerald'])).toBe(false)
  })

  it('SH-SRC-03 orden indiferente, espacios multiples y acentos en la consulta', () => {
    expect(matchesAllWords('  BATTLE   rubí ', ['Trainer Battle', 'Pokémon Ruby'])).toBe(false)
    expect(matchesAllWords('  BATTLE   pokémon ', ['Trainer Battle', 'Pokemon Ruby'])).toBe(true)
  })

  it('SH-SRC-04 consulta vacia o solo espacios no coincide', () => {
    expect(matchesAllWords('', ['x'])).toBe(false)
    expect(matchesAllWords('   ', ['x'])).toBe(false)
  })

  it('SH-SRC-05 texto literal: caracteres de regex no se interpretan', () => {
    expect(matchesAllWords('(day)', ['Pokémon Center (Day)'])).toBe(true)
    expect(matchesAllWords('.*', ['Pokémon Center'])).toBe(false)
  })
})
