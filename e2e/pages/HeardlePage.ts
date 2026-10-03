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
  get playButton() {
    return this.root.getByRole('button', { name: /Reproducir/ })
  }
  get resultHeading() {
    return this.root.locator('section[aria-live="polite"] h2')
  }
  get solution() {
    return this.root.locator('section[aria-live="polite"] strong')
  }
  get resultPanel() {
    return this.root.locator('section[aria-live="polite"]')
  }
  get shareButton() {
    return this.root.getByRole('button', { name: 'Compartir resultado' })
  }
  get shareText() {
    return this.root.locator('section[aria-live="polite"] pre')
  }
  get notice() {
    return this.root.getByRole('status')
  }
  get startButton() {
    return this.root.getByRole('button', { name: 'Empezar partida' })
  }

  /** Espera a que el clip del intento actual este descargado (boton de reproducir habilitado). */
  async ready() {
    await expect(this.playButton).toBeEnabled()
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

  async openStats() {
    const details = this.root.locator('details', { hasText: 'Estadísticas' })
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click()
  }

  async stat(label: string): Promise<string> {
    await this.openStats()
    return (await this.root.locator('dl > div').filter({ has: this.page.getByText(label, { exact: true }) }).locator('dd').innerText()).trim()
  }

  // Filtro (solo ilimitado)
  gameCheckbox(name: string) {
    return this.root.getByRole('checkbox', { name })
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
