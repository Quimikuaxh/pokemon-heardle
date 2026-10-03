export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMPTY_FILTER'
  | 'UNKNOWN_GAME'
  | 'UNKNOWN_SONG'
  | 'TOKEN_INVALID'
  | 'GAME_OVER'
  | 'ALREADY_GUESSED'
  | 'CLIP_TICKET_USED'
  | 'CLIP_TICKET_INVALID'
  | 'RATE_LIMITED'
  | 'STORAGE_ERROR'
  | 'CATALOG_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Mensajes en espanol, sin datos de la partida ni detalles internos.
export const errors = {
  validation: (message = 'Peticion no valida.') => new AppError('VALIDATION_ERROR', 400, message),
  emptyFilter: () => new AppError('EMPTY_FILTER', 400, 'El filtro no contiene ninguna cancion disponible.'),
  unknownGame: () => new AppError('UNKNOWN_GAME', 400, 'El filtro incluye un juego que no existe.'),
  unknownSong: () => new AppError('UNKNOWN_SONG', 400, 'La cancion elegida no existe.'),
  tokenInvalid: () => new AppError('TOKEN_INVALID', 401, 'La partida no es valida o ha caducado.'),
  gameOver: () => new AppError('GAME_OVER', 409, 'La partida ya ha terminado.'),
  alreadyGuessed: () => new AppError('ALREADY_GUESSED', 409, 'Ya has intentado esa cancion en esta partida.'),
  clipTicketUsed: () => new AppError('CLIP_TICKET_USED', 410, 'El audio ya se ha descargado o ha caducado.'),
  clipTicketInvalid: () => new AppError('CLIP_TICKET_INVALID', 404, 'El audio solicitado no existe.'),
  rateLimited: () => new AppError('RATE_LIMITED', 429, 'Demasiadas peticiones. Espera un momento.'),
  storage: () => new AppError('STORAGE_ERROR', 502, 'No se pudo leer el almacenamiento de audio.'),
  catalogUnavailable: () => new AppError('CATALOG_UNAVAILABLE', 503, 'El catalogo no esta disponible todavia.'),
  notFound: () => new AppError('NOT_FOUND', 404, 'Recurso no encontrado.'),
}
