import type { AttemptHint } from '../../../shared/api'
import type { Game, Song } from '../../../shared/catalog'
import { CONSOLES } from '../../../shared/rules'
import type { ConsoleName } from '../../../shared/rules'

const canonicalIndex = (consoleName: ConsoleName) => CONSOLES.indexOf(consoleName)

function consoleHint(chosenGame: Game | undefined, targetGame: Game | undefined): AttemptHint['console'] {
  const chosenConsoles = chosenGame?.consoles
  const targetConsoles = targetGame?.consoles
  if (!chosenConsoles?.length || !targetConsoles?.length) return null
  const common = chosenConsoles.filter((name) => targetConsoles.includes(name)).sort((a, b) => canonicalIndex(a) - canonicalIndex(b))
  // Con coincidencia, la primera consola comun; si no, la de la ELEGIDA (nunca una consola de la buscada).
  return common.length > 0 ? { label: common[0], match: true } : { label: chosenConsoles[0], match: false }
}

/** Pista de un fallo (DEC-50): solo una consola canonica, un booleano y un lado del orden; nunca el id ni el nombre del juego buscado. */
export function computeHint(
  chosen: Song,
  target: Song,
  gameOrder: readonly string[],
  gamesById: ReadonlyMap<string, Game>,
): AttemptHint {
  const chosenGameId = chosen.games[0]
  const targetGameId = target.games[0]
  const chosenIndex = gameOrder.indexOf(chosenGameId)
  const targetIndex = gameOrder.indexOf(targetGameId)
  const order =
    chosenIndex === -1 || targetIndex === -1 || chosenIndex === targetIndex ? null : targetIndex < chosenIndex ? 'earlier' : 'later'
  return { console: consoleHint(gamesById.get(chosenGameId), gamesById.get(targetGameId)), order }
}
