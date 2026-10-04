import type { Page } from '@playwright/test'

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)$/

/**
 * Intercepta TODA peticion a YouTube (nunca se llega a la red real) y devuelve la lista de URLs vistas.
 * Por defecto responde una pagina HTML minima; `status` permite simular un video no disponible.
 */
export async function stubYoutube(page: Page, options: { status?: number; body?: string } = {}): Promise<string[]> {
  const hits: string[] = []
  await page.route(
    (url) => YOUTUBE_HOST.test(url.hostname),
    (route) => {
      hits.push(route.request().url())
      return route.fulfill({
        status: options.status ?? 200,
        contentType: 'text/html; charset=utf-8',
        body: options.body ?? '<!doctype html><title>stub</title><p>YouTube (stub)</p>',
      })
    },
  )
  return hits
}

/** Registra los elementos de audio que llaman a play() para poder consultar `paused` despues. */
export const TRACK_AUDIO = () => {
  const original = HTMLMediaElement.prototype.play
  ;(window as any).__played = []
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    ;(window as any).__played.push(this)
    return original.call(this)
  }
}
