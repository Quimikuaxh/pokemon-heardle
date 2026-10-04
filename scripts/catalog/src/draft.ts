import { randomBytes } from 'node:crypto'
import type { Catalog, Game, Song } from '../../../shared/catalog'
import { slugify, uniqueId } from './ids'
import { commonGameTails, parseTitle } from './parseTitle'

export interface DraftOptions {
  randomClipKey?: () => string
  now?: () => string
}

/**
 * Anade al catalogo los videos nuevos (por youtubeId). Nunca modifica ni elimina entradas existentes
 * (conserva la revision manual). Una cancion sin juego parseable queda con `games: []`:
 * el validador la rechaza hasta que se asigne a mano.
 */
export function draftCatalog(
  existing: Catalog | null,
  videos: Array<{ youtubeId: string; title: string }>,
  options: DraftOptions = {},
): Catalog {
  const randomClipKey = options.randomClipKey ?? (() => randomBytes(8).toString('hex'))
  const now = options.now ?? (() => new Date().toISOString())

  const catalog: Catalog = existing
    ? structuredClone(existing)
    : { version: 1, generatedAt: now(), games: [], songs: [] }

  const knownVideos = new Set(catalog.songs.map((song) => song.source.youtubeId))
  const songIds = new Set(catalog.songs.map((song) => song.id))
  const gameIds = new Set(catalog.games.map((game) => game.id))
  const clipKeys = new Set(catalog.songs.map((song) => song.clipKey))

  const ensureGame = (name: string): Game => {
    const found = catalog.games.find((game) => game.name === name)
    if (found) return found
    const game: Game = { id: uniqueId(slugify(name).slice(0, 40), gameIds), name }
    catalog.games.push(game)
    return game
  }

  const newClipKey = (): string => {
    let key = randomClipKey()
    while (clipKeys.has(key)) key = randomClipKey()
    clipKeys.add(key)
    return key
  }

  const gameTails = commonGameTails(videos.map((video) => video.title))

  let added = false
  for (const video of videos) {
    if (knownVideos.has(video.youtubeId)) continue
    knownVideos.add(video.youtubeId)
    added = true

    const parsed = parseTitle(video.title, gameTails)
    const games = [...new Set(parsed.games.map((name) => ensureGame(name).id))]
    const idBase = slugify(`${games[0] ?? ''} ${parsed.title}`.replace(/^pokemon[- ]/i, '')) || `song-${slugify(video.youtubeId)}`
    const song: Song = {
      id: uniqueId(idBase, songIds),
      title: parsed.title,
      games,
      clipKey: newClipKey(),
      startSec: 0,
      enabled: true,
      reviewed: false,
      source: { youtubeId: video.youtubeId, videoTitle: video.title },
    }
    catalog.songs.push(song)
  }

  if (added) catalog.generatedAt = now()
  return catalog
}
