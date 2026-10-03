import { createHmac } from 'node:crypto'

const compareById = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Cancion del dia comun a todos: HMAC(seed, "daily|v1|"+fecha) sobre todo el catalogo habilitado (DEC-09). */
export function selectDaily<T extends { id: string; enabled: boolean }>(songs: T[], seed: string, date: string): T {
  const candidates = songs.filter((song) => song.enabled).sort(compareById)
  if (candidates.length === 0) throw new Error('No hay canciones habilitadas para el diario')
  const mac = createHmac('sha256', seed).update(`daily|v1|${date}`).digest()
  return candidates[mac.readUIntBE(0, 6) % candidates.length]
}
