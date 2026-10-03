import { test as base, expect } from '@playwright/test'
import { HeardlePage } from '../pages/HeardlePage.ts'
import { NetLog } from './netlog.ts'
import { baseUrl } from './env.ts'
import type { Variant } from './env.ts'

interface Fixtures {
  /** Backend/catalogo contra el que corre el test (ver support/env.ts). */
  variant: Variant
  net: NetLog
  app: HeardlePage
  /** Errores de pagina no controlados (excepciones JS). Debe quedar vacio. */
  pageErrors: string[]
}

export const test = base.extend<Fixtures>({
  variant: ['R', { option: true }],
  baseURL: async ({ variant }, use) => use(baseUrl(variant)),
  pageErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(errors)
    expect(errors, 'excepciones no controladas en la pagina').toEqual([])
  },
  net: async ({ page, pageErrors: _pe }, use) => {
    await use(new NetLog(page))
  },
  app: async ({ page, net: _net }, use) => {
    await use(new HeardlePage(page))
  },
})

export { expect }
