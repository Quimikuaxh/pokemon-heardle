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
 *             dailySeed, storageDriver: 'fs'|'s3', storageDir, clipTicketTtlSec, clipCacheMb,
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
 * game/daily.ts
 *   selectDaily(songs: Song[], seed: string, date: string): Song
 *     songs enabled ordenadas por id; idx = readUIntBE(HMAC-SHA256(seed, 'daily|v1|'+date), 0, 6) % n
 *
 * catalog/index.ts
 *   indexCatalog(catalog: Catalog): CatalogIndex
 *     { enabledSongs: Song[] (ordenadas por id), songById(id), songByClipKey(key), gameById(id),
 *       publicCatalog() }
 *   buildPool(index, gameIds: string[]): Song[]   (AppError EMPTY_FILTER | UNKNOWN_GAME; ordenado por id,
 *                                                   sin duplicados)
 *   pickRandom<T>(pool: T[], randomInt: (max:number)=>number = crypto.randomInt): T
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
 * storage/ClipStore.ts       interface ClipStore { getCatalog(): Promise<unknown>; getClip(clipKey, n /*1..6*\/): Promise<Buffer> }
 * storage/FsClipStore.ts     new FsClipStore(rootDir)   (rootDir/catalog/catalog.json, rootDir/clips/<clipKey>/<n>.mp3)
 * storage/S3ClipStore.ts     new S3ClipStore({ client: { send(cmd) }, bucket })  (Key 'clips/<clipKey>/<n>.mp3', 'catalog/catalog.json')
 * storage/LruCache.ts        new LruCache(maxBytes): get(key), set(key, Buffer), has(key), bytes
 * storage/CachedClipStore.ts new CachedClipStore(inner: ClipStore, cache: LruCache)
 *
 * app.ts
 *   createApp({ config, store, now?: () => number, randomInt?: (max)=>number,
 *               schedule?: (fn, delayMs) => void }): Express
 *     app.locals.catalogReady: Promise<void>   (resuelve al cargar el catalogo; reintenta con backoff via `schedule`)
 */
export {}
