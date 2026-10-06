import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Logo } from '../components/Logo'

const ROOT = join(__dirname, '..', '..')
const REPO = join(ROOT, '..')

describe('Logo (DEC-46)', () => {
  it('FE-DSN-04 es el h1 "Pokémon Heardle", en una sola linea y con la fuente del logo', () => {
    render(<Logo />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Pokémon Heardle' })
    expect(heading.className).toContain('whitespace-nowrap')
    expect(heading.className).toContain('font-logo')
    expect(heading.className).toContain('logo')
  })

  it('FE-DSN-04 el CSS declara @font-face Pokemon Solid con el .ttf del repo y el contorno azul del logo', () => {
    const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
    expect(css).toMatch(/@font-face\s*{[^}]*font-family:\s*'Pokemon Solid'/)
    expect(css).toContain('./assets/fonts/PokemonSolid.ttf')
    expect(css).toMatch(/\.logo\s*{[^}]*#ffcb05/i)
    expect(css).toMatch(/-webkit-text-stroke:\s*3px\s*#2a75bb/i)
  })

  it('FE-DSN-04 el fichero de la fuente existe, es TrueType y tiene el glifo "é" (cmap)', () => {
    const file = join(ROOT, 'src', 'assets', 'fonts', 'PokemonSolid.ttf')
    expect(existsSync(file)).toBe(true)
    const data = readFileSync(file)
    expect(data.readUInt32BE(0)).toBe(0x00010000)
    expect(hasGlyph(data, 0xe9)).toBe(true)
  })

  it('FE-DSN-04 [MOD] el README documenta el origen de la fuente, que autor y licencia no constan y su uso en un proyecto de fans', () => {
    const readme = readFileSync(join(REPO, 'README.md'), 'utf8')
    expect(readme).toContain('dafont.com/pokemon.font')
    expect(readme).toMatch(/2007/)
    expect(readme).toMatch(/autor y (la )?licencia no constan/i)
    expect(readme).toMatch(/fans[\s\S]{0,80}(sin [aá]nimo de lucro|no comercial)/i)
  })

  it('FE-DSN-05 [MOD] Rubik, Space Mono y Lilita One se sirven desde el proyecto (@fontsource) y index.html no llama a Google Fonts', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    const fonts = readFileSync(join(ROOT, 'src', 'fonts.ts'), 'utf8')
    for (const family of ['rubik', 'space-mono', 'lilita-one']) expect(fonts).toContain(`@fontsource/${family}/latin-`)
    expect(readFileSync(join(ROOT, 'src', 'main.tsx'), 'utf8')).toMatch(/import '\.\/fonts'/)
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    for (const family of ['rubik', 'space-mono', 'lilita-one']) expect(pkg.dependencies[`@fontsource/${family}`]).toBeTruthy()
  })
})

/** Busca un codepoint en la tabla cmap (formato 4) del TTF. */
function hasGlyph(data: Buffer, codepoint: number): boolean {
  const tables = data.readUInt16BE(4)
  let cmap = -1
  for (let i = 0; i < tables; i++) if (data.toString('latin1', 12 + 16 * i, 16 + 16 * i) === 'cmap') cmap = data.readUInt32BE(20 + 16 * i)
  const subtables = data.readUInt16BE(cmap + 2)
  for (let i = 0; i < subtables; i++) {
    const start = cmap + data.readUInt32BE(cmap + 4 + 8 * i + 4)
    if (data.readUInt16BE(start) !== 4) continue
    const segments = data.readUInt16BE(start + 6) / 2
    for (let s = 0; s < segments; s++) {
      const end = data.readUInt16BE(start + 14 + 2 * s)
      const first = data.readUInt16BE(start + 16 + 2 * segments + 2 * s)
      if (codepoint >= first && codepoint <= end) return true
    }
  }
  return false
}
