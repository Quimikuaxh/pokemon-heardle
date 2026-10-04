import type { GameView } from '../../../shared/api'

export interface DailyRecord {
  token: string
  finished: boolean
  view?: GameView
}

export interface UnlimitedRecord {
  token: string
}

export interface Store {
  /** true tras un fallo de escritura (cuota excedida o almacenamiento bloqueado). */
  readonly writeFailed: boolean
  getFilter(): string[]
  setFilter(ids: string[]): void
  getDaily(date: string): DailyRecord | null
  setDaily(date: string, record: DailyRecord): void
  getUnlimited(): UnlimitedRecord | null
  setUnlimited(record: UnlimitedRecord | null): void
}

const PREFIX = 'heardle:'
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDailyRecord = (value: unknown): value is DailyRecord =>
  isRecord(value) &&
  typeof value.token === 'string' &&
  typeof value.finished === 'boolean' &&
  (value.view === undefined || isRecord(value.view))

const isUnlimitedRecord = (value: unknown): value is UnlimitedRecord => isRecord(value) && typeof value.token === 'string'

const RETIRED_KEY_PREFIX = `${PREFIX}stats`

// Las estadisticas se retiraron (DEC-43): se borran las claves heredadas, que ya nadie lee. Idempotente y sin
// marcar writeFailed: es limpieza, no persistencia del usuario.
function removeRetiredKeys(storage: Storage): void {
  try {
    const retired: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(RETIRED_KEY_PREFIX)) retired.push(key)
    }
    retired.forEach((key) => storage.removeItem(key))
  } catch {
    // almacenamiento bloqueado: nada que limpiar
  }
}

/** Ninguna operacion lanza: si localStorage falla, la app sigue sin persistir. */
export function createStore(storage: Storage): Store {
  let writeFailed = false
  removeRetiredKeys(storage)

  function read<T>(key: string, isValid: (value: unknown) => value is T): T | null {
    try {
      const raw = storage.getItem(PREFIX + key)
      if (raw === null) return null
      const parsed: unknown = JSON.parse(raw)
      return isValid(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  function write(key: string, value: unknown): void {
    try {
      storage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      writeFailed = true
    }
  }

  function remove(key: string): void {
    try {
      storage.removeItem(PREFIX + key)
    } catch {
      writeFailed = true
    }
  }

  return {
    get writeFailed() {
      return writeFailed
    },
    getFilter: () => read('filter', (v): v is string[] => Array.isArray(v) && v.every((id) => typeof id === 'string')) ?? [],
    setFilter: (ids) => write('filter', ids),
    getDaily: (date) => read(`daily:${date}`, isDailyRecord),
    setDaily: (date, record) => write(`daily:${date}`, record),
    getUnlimited: () => read('unlimited', isUnlimitedRecord),
    setUnlimited: (record) => (record ? write('unlimited', record) : remove('unlimited')),
  }
}
