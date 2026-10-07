// FE-SET-01..05, 10, 12, 13, 14: panel de ajustes (DEC-52). Contrato: SettingsPanel({ settings, onChange(next) }) es controlado y contiene
// el boton "Pistas" (engranaje + texto) y el dialogo (role=dialog, aria-modal, titulo, dos role=switch, boton "Cerrar").
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SettingsPanel } from '../components/SettingsPanel'

afterEach(() => vi.unstubAllGlobals())

function Harness({ initial = { consoleHint: false, dateHint: false }, onChange }: { initial?: { consoleHint: boolean; dateHint: boolean }; onChange?: (s: any) => void }) {
  const [settings, setSettings] = useState(initial)
  return (
    <>
      <button type="button">Antes del engranaje</button>
      <SettingsPanel
        settings={settings}
        onChange={(next) => {
          setSettings(next)
          onChange?.(next)
        }}
      />
    </>
  )
}

const gear = () => screen.getByRole('button', { name: /^pistas$/i })
const open = async (user = userEvent.setup()) => {
  await user.click(gear())
  return screen.getByRole('dialog')
}
const consoleSwitch = () => screen.getByRole('switch', { name: /pista de consola/i })
const dateSwitch = () => screen.getByRole('switch', { name: /pista de fecha/i })

describe('SettingsPanel', () => {
  it('FE-SET-01 el boton "Pistas" (engranaje + texto) abre un role=dialog aria-modal=true con titulo', async () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const dialog = await open()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect((labelledBy && document.getElementById(labelledBy)?.textContent) || dialog.getAttribute('aria-label')).toMatch(/pistas/i)
  })

  it('FE-SET-01 el engranaje expone aria-haspopup/expanded coherentes', async () => {
    render(<Harness />)
    expect(gear().getAttribute('aria-expanded')).toBe('false')
    await open()
    expect(gear().getAttribute('aria-expanded')).toBe('true')
  })

  it('FE-SET-02 el foco se mueve dentro del dialogo al abrir y queda atrapado: Tab desde el ultimo va al primero; Shift+Tab desde el primero va al ultimo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const dialog = await open(user)
    expect(dialog.contains(document.activeElement)).toBe(true)
    const focusables = within(dialog).getAllByRole('button').concat(within(dialog).getAllByRole('switch'))
    expect(focusables.length).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 12; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement), `tab ${i}`).toBe(true)
    }
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true })
      expect(dialog.contains(document.activeElement), `shift+tab ${i}`).toBe(true)
    }
  })

  it('FE-SET-03 Escape cierra el dialogo y el foco vuelve al engranaje', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  it('FE-SET-03 cerrar con el boton tambien devuelve el foco al engranaje', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(gear())
  })

  it('FE-SET-04 dos role=switch "Pista de consola" y "Pista de fecha", desactivados por defecto', async () => {
    render(<Harness />)
    await open()
    expect([consoleSwitch().getAttribute('aria-checked'), dateSwitch().getAttribute('aria-checked')]).toEqual(['false', 'false'])
    expect(screen.getAllByRole('switch').length).toBe(2)
  })

  it('FE-SET-04 refleja los valores recibidos', async () => {
    render(<Harness initial={{ consoleHint: true, dateHint: false }} />)
    await open()
    expect([consoleSwitch().getAttribute('aria-checked'), dateSwitch().getAttribute('aria-checked')]).toEqual(['true', 'false'])
  })

  it('FE-SET-05 cada interruptor cambia con clic y de forma independiente', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await open(user)
    await user.click(consoleSwitch())
    expect([consoleSwitch().getAttribute('aria-checked'), dateSwitch().getAttribute('aria-checked')]).toEqual(['true', 'false'])
    expect(onChange).toHaveBeenLastCalledWith({ consoleHint: true, dateHint: false })
    await user.click(dateSwitch())
    expect(onChange).toHaveBeenLastCalledWith({ consoleHint: true, dateHint: true })
    await user.click(consoleSwitch())
    expect(onChange).toHaveBeenLastCalledWith({ consoleHint: false, dateHint: true })
  })

  for (const key of ['{Enter}', ' ']) {
    it(`FE-SET-05 con teclado (${JSON.stringify(key)}) cada interruptor cambia`, async () => {
      const user = userEvent.setup()
      render(<Harness />)
      await open(user)
      consoleSwitch().focus()
      await user.keyboard(key)
      expect(consoleSwitch().getAttribute('aria-checked')).toBe('true')
      expect(dateSwitch().getAttribute('aria-checked')).toBe('false')
      dateSwitch().focus()
      await user.keyboard(key)
      expect(dateSwitch().getAttribute('aria-checked')).toBe('true')
    })
  }

  it('FE-SET-10 cambiar los ajustes no genera ninguna peticion de red', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    await user.click(consoleSwitch())
    await user.click(dateSwitch())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('FE-SET-12 abrir el panel con partida en curso no toca el reproductor (no hay Audio ni AudioContext en el panel)', async () => {
    const created = vi.fn()
    vi.stubGlobal('Audio', created)
    vi.stubGlobal('AudioContext', created)
    render(<Harness />)
    await open()
    expect(created).not.toHaveBeenCalled()
  })

  it('FE-SET-13 cerrar con el boton deja los ajustes aplicados', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await open(user)
    await user.click(consoleSwitch())
    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onChange).toHaveBeenLastCalledWith({ consoleHint: true, dateHint: false })
    await open(user)
    expect(consoleSwitch().getAttribute('aria-checked')).toBe('true')
  })

  it('FE-SET-13 cerrar con Escape tambien los deja aplicados', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    await user.click(dateSwitch())
    await user.keyboard('{Escape}')
    await open(user)
    expect(dateSwitch().getAttribute('aria-checked')).toBe('true')
  })

  it('FE-SET-14 textos en espanol y el estado no depende solo del color (aria-checked y texto/icono visible)', async () => {
    render(<Harness initial={{ consoleHint: true, dateHint: false }} />)
    const dialog = await open()
    expect(dialog.textContent).toMatch(/pista de consola/i)
    expect(dialog.textContent).toMatch(/pista de fecha/i)
    const on = consoleSwitch()
    const off = dateSwitch()
    expect(on.textContent !== off.textContent || on.innerHTML !== off.innerHTML).toBe(true)
  })

  it('FE-SET-01 clic fuera del boton no abre nada y el dialogo no existe en el DOM cerrado', () => {
    render(<Harness />)
    fireEvent.click(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryAllByRole('switch').length).toBe(0)
  })
})
