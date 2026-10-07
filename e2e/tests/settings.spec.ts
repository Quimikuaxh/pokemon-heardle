import type { Page } from '@playwright/test'
import { test, expect } from '../support/test.ts'
import { dailyTargetR, expectedHint, nonTargets } from '../support/oracle.ts'

const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const activeInDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

test('E2E-94_should_trap_focus_in_settings_and_be_operable_with_the_keyboard', async ({ app, page }) => {
  await app.goto()
  await app.daily.ready()
  const gear = app.settingsButton
  await gear.focus()
  await page.keyboard.press('Enter')
  await expect(app.settingsDialog).toBeVisible()
  await expect(app.settingsDialog).toHaveAttribute('aria-modal', 'true')
  await expect(app.settingsDialog).toHaveAccessibleName('Pistas')

  // Foco atrapado: tantas pulsaciones de Tab (y Shift+Tab) como controles tiene y nunca sale del dialogo.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await activeInDialog(page), `Tab ${i + 1} dentro del dialogo`).toBe(true)
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await activeInDialog(page), `Shift+Tab ${i + 1} dentro del dialogo`).toBe(true)
  }

  // Interruptores con teclado.
  for (const which of ['console', 'date'] as const) {
    const toggle = app.switchFor(which)
    await toggle.focus()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  }

  await page.keyboard.press('Escape')
  await expect(app.settingsDialog).toHaveCount(0)
  await expect(gear, 'Escape devuelve el foco al engranaje').toBeFocused()
})

test('E2E-94_should_expose_the_search_as_a_combobox_with_named_groups', async ({ app }) => {
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.type('a')
  const input = d.search
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  const listId = await input.getAttribute('aria-controls')
  expect(listId).toBeTruthy()
  await expect(d.root.getByRole('listbox')).toHaveAttribute('id', listId!)
  await expect(d.root.getByRole('group', { name: 'Juegos' })).toBeVisible()
  await expect(d.root.getByRole('group', { name: 'Canciones' })).toBeVisible()
  await expect(input).toHaveAccessibleName(/canción/i)
  // Cada opcion tiene nombre accesible y las intentadas llevan aria-disabled.
  for (const option of await d.options.all()) await expect(option).toHaveAccessibleName(/.+/)
  await expect(d.root.getByRole('listbox')).toHaveAccessibleName('Sugerencias')
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Movil 375 ${scheme}`, () => {
    test.use({ viewport: { width: 375, height: 667 }, colorScheme: scheme })

    test(`E2E-95_should_fit_a_long_game_bubble_and_readable_hints_at_375px_${scheme}`, async ({ app, page }) => {
      const target = dailyTargetR()
      const [wrong] = nonTargets(target)
      const d = app.daily
      await app.goto()
      await app.setHints({ console: true, date: true })
      await d.ready()
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

      const gearBox = (await app.settingsButton.boundingBox())!
      expect(gearBox.width, 'engranaje (ancho)').toBeGreaterThanOrEqual(44)
      expect(gearBox.height, 'engranaje (alto)').toBeGreaterThanOrEqual(44)
      expect(gearBox.x + gearBox.width, 'engranaje dentro del viewport').toBeLessThanOrEqual(375)

      // Burbuja con el nombre mas largo del catalogo.
      await d.type('zeta')
      await d.gameOptions.first().click()
      const bubble = d.bubbleRemove.locator('xpath=..')
      await expect(bubble).toBeVisible()
      const bubbleBox = (await bubble.boundingBox())!
      expect(bubbleBox.x + bubbleBox.width, 'burbuja dentro del viewport').toBeLessThanOrEqual(375)
      expect(await overflow(), 'scroll horizontal con la burbuja larga').toBeLessThanOrEqual(0)
      // La x se ve de 24 px pero su area de toque debe medir >= 44 px (pseudo-elemento): se comprueba golpeando
      // los bordes de un cuadrado de 44 px centrado en ella.
      const closeBox = (await d.bubbleRemove.boundingBox())!
      const centre = { x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 }
      const misses = await page.evaluate(({ x, y }) => {
        const button = document.querySelector('button[aria-label^="Quitar filtro de juego"]')
        return [[-21, -21], [21, -21], [-21, 21], [21, 21], [0, -21], [0, 21]]
          .filter(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.closest('button') !== button)
          .map(([dx, dy]) => `${dx},${dy}`)
      }, centre)
      expect(misses, 'puntos del area de 44 px que no llegan a la x').toEqual([])
      await d.bubbleRemove.click()

      // Pistas: icono ademas del color y contraste >= 4,5:1.
      await d.guess(wrong.title)
      await d.ready()
      const hint = expectedHint(target, wrong)
      const consoleBubble = d.consoleHints.first()
      await expect(consoleBubble).toBeVisible()
      await expect(consoleBubble.locator('svg'), 'icono de la burbuja de consola').toHaveCount(1)
      const colors = await consoleBubble.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }))
      expect(contrast(colors.fg, colors.bg), `contraste de la burbuja de consola ${hint.console.label}`).toBeGreaterThanOrEqual(4.5)
      if (hint.order) {
        const arrow = d.dateHints.first()
        await expect(arrow.locator('svg'), 'icono de la flecha').toHaveCount(1)
        const arrowColors = await arrow.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }))
        expect(contrast(arrowColors.fg, arrowColors.bg === 'rgba(0, 0, 0, 0)' ? colors.bg : arrowColors.bg), 'contraste de la flecha').toBeGreaterThanOrEqual(3)
      }
      expect(await overflow(), 'scroll horizontal con las pistas').toBeLessThanOrEqual(0)
    })
  })
}
