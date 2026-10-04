import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { FixtureSong } from '../fixtures/catalogs.ts'
import type { NetLog } from './netlog.ts'

/** Parche de init: registra cada `src` asignado a un elemento de audio (el <audio> no esta en el DOM). */
export const RECORD_AUDIO_SRC = () => {
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    ...desc,
    set(value: string) {
      ;((window as any).__audioSrcs ||= []).push(String(value))
      desc.set!.call(this, value)
    },
  })
}

const FORBIDDEN_KEYS = ['clipKey', 'startSec', 'videoTitle', 'youtubeId', 'source', 'reviewed', 'enabled', 'durationSec', '.mp3']

/** Secretos de la objetivo que no deben aparecer NUNCA (ni en el catalogo publico). */
const secrets = (t: FixtureSong) => [t.clipKey, t.source.youtubeId, t.source.videoTitle]
/** Identificadores que si pueden estar en /api/catalog, el desplegable y las jugadas propias, pero no en el resto. */
const identity = (t: FixtureSong) => [t.id, t.title]

const countIn = (haystack: string, needles: string[]) => needles.filter((n) => haystack.includes(n))

/**
 * E2E-26: escanea red, almacenamiento, DOM y audio con la partida en curso.
 * `own` son las canciones que la persona ya ha jugado (aparecen legitimamente en `guesses` y en la lista).
 */
export async function expectNoLeak(page: Page, net: NetLog, target: FixtureSong, own: FixtureSong[] = []) {
  await net.settle()
  expect(net.responses.some((r) => r.path === '/api/games'), 'hay respuestas de /api/games que escanear').toBe(true)
  expect(net.clips().length, 'hay clips que escanear').toBeGreaterThan(0)
  const ownIds = new Set(own.map((s) => s.id))
  expect(ownIds.has(target.id), 'la objetivo no puede estar entre las jugadas propias').toBe(false)

  for (const res of net.responses) {
    const text = res.body ? res.body.toString('utf8') : ''
    const latin = res.body ? res.body.toString('latin1') : ''
    const headers = JSON.stringify(res.headers)
    const label = `${res.path} (${res.status})`
    if (res.path === '/api/catalog') {
      // El catalogo es publico: titulo e id de todas las canciones son legitimos, pero no sus metadatos internos.
      expect(countIn(text, secrets(target)), `secretos de la objetivo en ${label}`).toEqual([])
      expect(countIn(text, FORBIDDEN_KEYS), `campos internos en ${label}`).toEqual([])
      continue
    }
    expect(countIn(headers, [...secrets(target), ...identity(target)]), `cabeceras de ${label}`).toEqual([])
    if (res.path.startsWith('/api/clips/')) {
      expect(latin.startsWith('ID3'), `clip con ID3 en ${label}`).toBe(false)
      const body = res.body!
      expect(body.length, `bytes del clip capturados en ${label}`).toBeGreaterThan(1000)
      for (const needle of [...secrets(target), ...identity(target)]) {
        expect(body.includes(Buffer.from(needle)), `"${needle}" dentro de los bytes del clip`).toBe(false)
      }
      continue
    }
    expect(countIn(text, [...secrets(target), ...identity(target)]), `cuerpo de ${label}`).toEqual([])
    if (res.path.startsWith('/api/games')) expect(countIn(text, FORBIDDEN_KEYS), `campos internos en ${label}`).toEqual([])
  }

  // Almacenamiento
  const storage = await page.evaluate(async () => {
    const dbs = (await (indexedDB as any).databases?.()) ?? []
    return {
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
      cookie: document.cookie,
      indexedDb: JSON.stringify(dbs),
      dom: document.documentElement.outerHTML,
      text: document.body.innerText,
      audioSrcs: ((window as any).__audioSrcs ?? []) as string[],
    }
  })
  const cookies = JSON.stringify(await page.context().cookies())
  const needles = [...secrets(target), ...identity(target)]
  for (const [name, value] of Object.entries({ ...storage, cookies })) {
    if (name === 'audioSrcs') continue
    expect(countIn(value as string, needles), `${name} contiene datos de la objetivo`).toEqual([])
  }
  expect(storage.audioSrcs.length, 'se ha asignado algun src de audio').toBeGreaterThan(0)
  for (const src of storage.audioSrcs) {
    expect(src.startsWith('blob:'), `src de audio opaco: ${src}`).toBe(true)
    expect(countIn(src, needles)).toEqual([])
  }
}
