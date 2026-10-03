import { errors } from './errors'

const MAX_FILTER_GAMES = 50
const MAX_ID_LENGTH = 64
const MAX_TOKEN_LENGTH = 1024

export type CreateGameRequest = { mode: 'daily' } | { mode: 'unlimited'; games: string[] }

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw errors.validation('El cuerpo de la peticion debe ser un objeto JSON.')
  }
  return body as Record<string, unknown>
}

export function parseCreateGame(body: unknown): CreateGameRequest {
  const record = asRecord(body)
  if (record.mode === 'daily') {
    if ('games' in record) throw errors.validation('El modo diario no admite filtro de juegos.')
    return { mode: 'daily' }
  }
  if (record.mode === 'unlimited') {
    const games = record.games
    if (
      !Array.isArray(games) ||
      games.length > MAX_FILTER_GAMES ||
      !games.every((gameId) => typeof gameId === 'string' && gameId.length > 0 && gameId.length <= MAX_ID_LENGTH)
    ) {
      throw errors.validation('El filtro de juegos no es valido.')
    }
    return { mode: 'unlimited', games: [...new Set(games as string[])] }
  }
  throw errors.validation('El modo debe ser "daily" o "unlimited".')
}

export function parseToken(body: unknown): string {
  const { token } = asRecord(body)
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw errors.validation('Falta el token de la partida.')
  }
  return token
}

export function parseGuess(body: unknown): { token: string; songId: string } {
  const token = parseToken(body)
  const { songId } = body as Record<string, unknown>
  if (typeof songId !== 'string' || songId.length === 0 || songId.length > MAX_ID_LENGTH) {
    throw errors.validation('Falta la cancion elegida.')
  }
  return { token, songId }
}
