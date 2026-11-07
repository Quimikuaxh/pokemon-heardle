/**
 * CONTRATO DE MODULOS (lo que los tests del backend asumen).
 * ARQUITECTURA.md da nombres de fichero pero no firmas; estas son las que fijan los tests.
 * Cualquier cambio de firma debe acordarse (los tests no se tocan para que pasen).
 *
 * http/errors.ts
 *   class AppError extends Error { code: string; status: number }   // codigos de ARQUITECTURA 5
 *
 * config.ts
 *   loadConfig(env: Record<string, string | undefined>): Config  (lanza si faltan/cortos los secretos)
 *   Config: { port, nodeEnv, allowedOrigin, gameTokenSecret: string (el base64 tal cual),
 *             dailySeed, storageDriver: 'fs'|'supabase', storageDir, clipTicketTtlSec, clipCacheMb,
 *             trustProxy: number,
 *             rateLimit: { global, createGame, action, clips, perGame } }   // peticiones/minuto
 *   Env de rate-limit: RATE_LIMIT_GLOBAL, RATE_LIMIT_CREATE_GAME, RATE_LIMIT_ACTION,
 *                      RATE_LIMIT_CLIPS, RATE_LIMIT_PER_GAME
 *
 * game/token.ts   (secret = GAME_TOKEN_SECRET en base64; nowMs en milisegundos; iat/exp en SEGUNDOS epoch)
 *   encryptToken(payload: TokenPayload, secret: string): string     (lanza si no cabe en 384 B)
 *   decryptToken(token: string, secret: string, nowMs: number): TokenPayload   (AppError TOKEN_INVALID)
 *   TokenPayload = { v:1, n:hex16, m:'d'|'u', d?:'YYYY-MM-DD', k:hex16, r:('S'|'M'|'G'|'H')[],
 *                    q:hex16[], iat:number, exp:number }
 *   decryptToken valida forma (v, n, m, k, r<=6, q<=6 sin duplicados y hex16); no mira el catalogo.
 *
 * game/tickets.ts
 *   new TicketService({ secret, ttlSec, now: () => number /*ms*\/ })
 *     .issue({ clipKey, attempt, nonce }): string
 *     .redeem(ticket): { clipKey, attempt, nonce }   (sincrono; CLIP_TICKET_INVALID | CLIP_TICKET_USED)
 *     .usedCount(): number                            (tickets recordados; se purgan al expirar)
 *
 * game/daily.ts   (DEC-09 v2, DEC-54)
 *   selectDaily(songs: Song[], games: Game[], seed: string, date: string): Song
 *     h = HMAC-SHA256(seed, 'daily|v2|'+date); grupo = h.readUIntBE(0,6) % nGrupos (grupos con canciones enabled, por primera
 *     aparicion en `games`; grupo de un juego = selectionGroup ?? id); cancion = h.readUIntBE(6,6) % nCanciones del grupo (por id)
 *
 * catalog/index.ts   (DEC-54: ademas de lo anterior)
 *   indexCatalog(catalog).games: Game[] en el orden de catalog.json; .groupOf(gameId): string (selectionGroup ?? id)
 *   buildGroups(index, gameIds): Array<{ id: string; songs: Song[] }>  (grupos con algun juego filtrado y canciones activas; EMPTY_FILTER/UNKNOWN_GAME)
 *   selectUnlimited(index, gameIds, randomInt?): Song   = randomInt(nGrupos) y despues randomInt(nCanciones del grupo)
 * game/hints.ts      computeHint(chosen: Song, target: Song, gameOrder: readonly string[], gamesById: ReadonlyMap<string, Game>): AttemptHint
 *                    buildGameView(...).hints: Array<AttemptHint | null> alineado con results
 * catalog/index.ts (previo)
 *   indexCatalog(catalog: Catalog): CatalogIndex
 *     { enabledSongs: Song[] (ordenadas por id), songById(id), songByClipKey(key), gameById(id),
 *       publicCatalog() }
 *   buildGroups(index, gameIds: string[]): Array<{ id, songs }>   (AppError EMPTY_FILTER | UNKNOWN_GAME)
 *   selectUnlimited(index, gameIds, randomInt = crypto.randomInt): Song
 *
 * game/engine.ts   (funciones puras)
 *   createPayload({ mode:'daily'|'unlimited', target: Song, date?: string, nowMs: number }): TokenPayload
 *     exp: diario = fin del dia Madrid de `date` + 6 h; ilimitado = iat + 86400
 *   applySkip(p): TokenPayload
 *   applyGuess(p, songId, index): { payload: TokenPayload, result: 'H'|'G'|'M' }
 *     Prioridad de errores: GAME_OVER > UNKNOWN_SONG > ALREADY_GUESSED
 *   deriveStatus(p): 'playing'|'won'|'lost'
 *   buildGameView(p, index, { token, clipUrl? }): GameView
 *
 * storage/ClipStore.ts       interface ClipStore { getCatalog(): Promise<unknown>; getClip(clipKey): Promise<Buffer> }  // fichero entero (DEC-44)
 * storage/FsClipStore.ts     new FsClipStore(rootDir)   (rootDir/catalog/catalog.json, rootDir/clips/<clipKey>.mp3)
 * storage/SupabaseClipStore.ts new SupabaseClipStore({ url, serviceRoleKey, bucket, fetchFn? })  (API REST de Storage, DEC-57)
 * storage/LruCache.ts        new LruCache(maxBytes): get(key), set(key, Buffer), has(key), bytes
 * storage/CachedClipStore.ts new CachedClipStore(inner: ClipStore, cache: LruCache)
 *
 * app.ts
 *   createApp({ config, store, now?: () => number, randomInt?: (max)=>number,
 *               schedule?: (fn, delayMs) => void, limiter?: RateLimiter }): { handle, catalogReady }
 *     handle(request: Request, clientIp): Promise<Response>   (http/handler.ts; lo sirve node/server.ts o la Edge Function, DEC-57)
 *     catalogReady: Promise<void>   (resuelve al cargar el catalogo; reintenta con backoff via `schedule`)
 */
export {}
