import { gameColor } from '../game/gameColors'

/** Cuadradito con el color del juego (buscador, historial, filtro y resultado). */
export function GameSwatch({ gameId, size = 10 }: { gameId: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      data-game-swatch={gameId}
      className="flex-none rounded-[2px]"
      style={{ width: size, height: size, backgroundColor: gameColor(gameId) }}
    />
  )
}
