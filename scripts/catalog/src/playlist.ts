export interface PlaylistVideo {
  youtubeId: string
  title: string
}

const UNAVAILABLE_TITLE = /^\[(private|deleted) video\]$/i

/** Descarta los vídeos privados/borrados que yt-dlp lista en `--flat-playlist` sin título real. */
export function listAvailableVideos(entries: Array<{ id?: unknown; title?: unknown }>): PlaylistVideo[] {
  return entries.flatMap((entry) =>
    typeof entry.id === 'string' &&
    entry.id !== '' &&
    typeof entry.title === 'string' &&
    entry.title.trim() !== '' &&
    !UNAVAILABLE_TITLE.test(entry.title.trim())
      ? [{ youtubeId: entry.id, title: entry.title }]
      : [],
  )
}
