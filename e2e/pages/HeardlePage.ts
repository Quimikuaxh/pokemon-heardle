import { expect } from '@playwright/test'
import type { Locator, Page, Response } from '@playwright/test'

export type Mode = 'daily' | 'unlimited'

/** Page Object de la app: un tablero por modo (los dos estan montados, solo uno visible). */
export class Board {
  readonly root: Locator
  constructor(
    readonly page: Page,
    readonly mode: Mode,
  ) {
    this.root = page.getByRole('region', { name: mode === 'daily' ? 'Partida diaria' : 'Partida libre' })
  }

  get rows() {
    return this.root.getByRole('list', { name: 'Intentos' }).getByRole('listitem')
  }
  get search() {
    return this.root.getByRole('combobox')
  }
  get options() {
    return this.root.getByRole('option')
  }
  option(title: string) {
    return this.root.getByRole('option').filter({ hasText: title })
  }
  get skipButton() {
    return this.root.getByRole('button', { name: /^Saltar/ })
  }
  /** El boton de play en cualquier estado (el nombre accesible cambia: Reproducir N s / Pausar / Reanudar / Cargando audio...). */
  get playButton() {
    return this.root.getByRole('button', { name: /^(Reproducir|Reanudar|Pausar|Cargando audio)/ })
  }
  /** Boton de play sin sonar: "Reproducir N s" (posicion 0 o fragmento acabado) o "Reanudar" (pausado con posicion > 0). */
  get playIdle() {
    return this.root.getByRole('button', { name: /^(Reproducir|Reanudar)/ })
  }
  /** Solo "Reproducir N s": audio listo, sin sonar y en posicion 0. */
  get playFromStart() {
    return this.root.getByRole('button', { name: /^Reproducir/ })
  }
  get progressbar() {
    return this.root.getByRole('progressbar')
  }
  /** Barras de la forma de onda (data-bar) del reproductor. */
  get waveform() {
    return this.root.locator('[data-waveform]')
  }
  get resultPanel() {
    return this.root.getByRole('region', { name: 'Resultado' })
  }
  get resultHeading() {
    return this.resultPanel.getByRole('heading', { level: 2 })
  }
  /** Titulo de la cancion revelada (sin rol propio: tipografia de pantalla `font-display`). */
  get solution() {
    return this.resultPanel.locator('.font-display')
  }
  get notice() {
    return this.root.getByRole('status')
  }
  get startButton() {
    return this.root.getByRole('button', { name: 'Empezar partida' })
  }

  /** Espera a que el clip del intento actual este descargado (boton de reproducir habilitado). */
  async ready() {
    await expect(this.playIdle).toBeEnabled()
  }

  async type(query: string) {
    await this.search.fill(query)
  }

  /** Escribe el titulo, pulsa la opcion y espera la respuesta de /games/guess. */
  async guess(title: string): Promise<Response> {
    await this.type(title)
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/api/games/guess') && r.request().method() === 'POST'),
      this.option(title).click(),
    ])
    return response
  }

  async skip(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/api/games/skip')),
      this.skipButton.click(),
    ])
    return response
  }

  /** Salta `times` veces (por defecto, los 6 intentos de una partida nueva). */
  async skipAll(times = 6) {
    for (let i = 0; i < times; i++) {
      await this.ready()
      await this.skip()
    }
  }

  // Filtro (solo ilimitado)
  /** Casilla de un juego: en la lista el nombre sale sin el prefijo "Pokémon " y con el contador al final. */
  gameCheckbox(name: string) {
    const short = name.replace(/^Pok[eé]mon\s+/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return this.root.getByRole('checkbox', { name: new RegExp(`^${short}(\\s|$)`) })
  }
  async setFilter(gameNames: string[]) {
    await this.root.getByRole('button', { name: 'Ninguno' }).click()
    for (const name of gameNames) await this.gameCheckbox(name).check()
  }
}

export class HeardlePage {
  readonly daily: Board
  readonly unlimited: Board
  constructor(readonly page: Page) {
    this.daily = new Board(page, 'daily')
    this.unlimited = new Board(page, 'unlimited')
  }

  async goto() {
    await this.page.goto('/')
    await expect(this.page.getByRole('heading', { name: 'Pokémon Heardle' })).toBeVisible()
  }

  async showUnlimited() {
    await this.page.getByRole('button', { name: 'Partida libre', exact: true }).click()
  }
  async showDaily() {
    await this.page.getByRole('button', { name: 'Diario', exact: true }).click()
  }

  /** Inicia una partida libre con el filtro dado (nombres de juego) y espera la vista. */
  async startUnlimited(gameNames: string[]) {
    await this.showUnlimited()
    await this.unlimited.setFilter(gameNames)
    const [res] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST' && r.request().postData()!.includes('unlimited')),
      this.unlimited.startButton.click(),
    ])
    expect(res.status()).toBe(200)
    await this.unlimited.ready()
  }

  localStorageDump(): Promise<Record<string, string>> {
    return this.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  }
}
