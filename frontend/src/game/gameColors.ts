/** Color de cada juego (cuadradito del buscador, historial, filtro y resultado). Un solo sitio: aqui. */
export const GAME_COLORS: Readonly<Record<string, string>> = {
  'pokemon-ruby-sapphire-emerald': '#b83a45',
  'pokemon-diamond-pearl-platinum': '#6c7fa8',
  'pokemon-black-white': '#8c8c94',
  'pokemon-black2-white2': '#2f7f86',
}

/** Paleta para juegos nuevos que aun no estan en el mapa: se elige por hash del id (estable entre sesiones). */
export const FALLBACK_GAME_COLORS: readonly string[] = ['#c27a2c', '#7a5ca8', '#3f8f5a', '#b5527f', '#4a7fb5', '#a8923a', '#5f8f8a', '#9b5b4a']

export function gameColor(gameId: string): string {
  if (Object.hasOwn(GAME_COLORS, gameId)) return GAME_COLORS[gameId]
  let hash = 0
  for (const char of gameId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return FALLBACK_GAME_COLORS[hash % FALLBACK_GAME_COLORS.length]
}

/** "Pokémon Black/White" -> "Black/White": en listas el prefijo sobra. */
export function shortGameName(name: string): string {
  return name.replace(/^Pok[eé]mon\s+/i, '')
}
