export interface ClipStore {
  getCatalog(): Promise<unknown>
  /** Fichero entero del clip unico de la cancion (clips/<clipKey>.mp3, DEC-44). */
  getClip(clipKey: string): Promise<Buffer>
  /** Olvida lo cacheado de un clip (la ruta lo llama si el fichero leido no tiene el formato esperado). */
  evict?(clipKey: string): void
}
