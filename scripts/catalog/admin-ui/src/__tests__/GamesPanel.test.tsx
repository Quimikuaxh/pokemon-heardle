// AU-CON-01..07 (consolas) y AU-SEL-01..05 (grupo de seleccion) en el panel de juegos del admin.
// Convenciones de accesibilidad asumidas (como las del panel actual, que identifica cada juego por su id):
//  - por juego, un group "Consolas del juego <id>" con una checkbox por consola de CONSOLES (nombre = consola) y un boton "Guardar consolas <id>";
//  - marca de texto "Sin consola" en el juego cuando el servidor devuelve missingConsoles;
//  - por juego, un combobox "Grupo de seleccion <id>" con la opcion "Su propio grupo" y los juegos cabeza (se guarda al cambiar).
import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { AdminApp } from '../AdminApp'
import { baseSongs, fakeAdmin, GAMES } from './helpers'

async function mount(fake = fakeAdmin()) {
  render(<AdminApp fetchFn={fake.fetchFn as any} />)
  await screen.findByText('Littleroot Town')
  return fake
}
const patches = (fake: ReturnType<typeof fakeAdmin>) => fake.mutations().filter((m) => m.method === 'PATCH' && m.path.startsWith('/api/games/'))
const consolesGroup = (id: string) => screen.getByRole('group', { name: new RegExp(`consolas del juego ${id}$`, 'i') })
const box = (id: string, consoleName: string) => within(consolesGroup(id)).getByRole('checkbox', { name: new RegExp(`^${consoleName}$`) }) as HTMLInputElement
const save = (id: string) => screen.getByRole('button', { name: new RegExp(`guardar consolas ${id}$`, 'i') })
const groupSelect = (id: string) => screen.getByRole('combobox', { name: new RegExp(`grupo de selecci[oó]n ${id}$`, 'i') }) as HTMLSelectElement
const optionLabels = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent)

describe('AU-CON consolas por juego', () => {
  it('AU-CON-01 8 casillas de consola por juego (GC: DEC-60) marcadas segun consoles', async () => {
    await mount()
    const group = consolesGroup('rse')
    expect(within(group).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).labels?.[0]?.textContent ?? c.getAttribute('aria-label'))).toEqual(['GB', 'GBC', 'GBA', 'GC', 'DS', '3DS', 'Switch', 'Switch 2'])
    expect(box('rse', 'GBA').checked).toBe(true)
    expect(box('rse', 'DS').checked).toBe(false)
    expect(box('dp', 'DS').checked).toBe(true)
  })

  it('AU-CON-02 guardar envia PATCH { consoles } en orden canonico sin importar el orden de clic', async () => {
    const fake = await mount()
    fireEvent.click(box('unused', 'Switch 2'))
    fireEvent.click(box('unused', 'GB'))
    fireEvent.click(box('unused', 'Switch'))
    fireEvent.click(save('unused'))
    await waitFor(() => expect(patches(fake).at(-1)).toMatchObject({ path: '/api/games/unused', body: { consoles: ['GB', '3DS', 'Switch', 'Switch 2'] } }))
  })

  it('AU-CON-03 desmarcar todas bloquea el guardado o muestra error; nunca se envia []', async () => {
    const fake = await mount()
    fireEvent.click(box('rse', 'GBA'))
    const button = save('rse') as HTMLButtonElement
    if (!button.disabled) fireEvent.click(button)
    await new Promise((r) => setTimeout(r, 30))
    expect(patches(fake).some((p) => Array.isArray(p.body?.consoles) && p.body.consoles.length === 0)).toBe(false)
    expect(patches(fake).length).toBe(0)
    if (!button.disabled) expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('AU-CON-04 un juego sin consolas con canciones activas muestra "Sin consola"; los que las tienen no', async () => {
    const games = GAMES.map((g) => (g.id === 'dp' ? { id: g.id, name: g.name } : g))
    await mount(fakeAdmin({ games }))
    const dpRow = screen.getByRole('textbox', { name: 'Nombre del juego dp' }).closest('li')!
    const rseRow = screen.getByRole('textbox', { name: 'Nombre del juego rse' }).closest('li')!
    expect(dpRow.textContent).toMatch(/sin consola/i)
    expect(rseRow.textContent).not.toMatch(/sin consola/i)
  })

  it('AU-CON-04 asignar consolas hace desaparecer la marca (el estado sale del servidor)', async () => {
    const games = GAMES.map((g) => (g.id === 'dp' ? { id: g.id, name: g.name } : g))
    await mount(fakeAdmin({ games }))
    fireEvent.click(box('dp', 'DS'))
    fireEvent.click(save('dp'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nombre del juego dp' }).closest('li')!.textContent).not.toMatch(/sin consola/i))
  })

  it('AU-CON-05 error 400 al guardar: mensaje y casillas revertidas al estado del servidor', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' && r.path.startsWith('/api/games/') ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Consolas no validas' } } } : undefined))
    await mount(fake)
    fireEvent.click(box('rse', 'DS'))
    expect(box('rse', 'DS').checked).toBe(true)
    fireEvent.click(save('rse'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/consolas no validas/i)
    await waitFor(() => expect(box('rse', 'DS').checked).toBe(false))
    expect(box('rse', 'GBA').checked).toBe(true)
  })

  it('AU-CON-06 Z-A con ambas marcadas se guarda ["Switch","Switch 2"] y las casillas tienen etiqueta accesible', async () => {
    const fake = await mount()
    fireEvent.click(box('unused', '3DS')) // quita 3DS
    fireEvent.click(box('unused', 'Switch 2'))
    fireEvent.click(box('unused', 'Switch'))
    fireEvent.click(save('unused'))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ consoles: ['Switch', 'Switch 2'] }))
    for (const c of within(consolesGroup('unused')).getAllByRole('checkbox')) expect((c as HTMLInputElement).labels?.length || c.getAttribute('aria-label')).toBeTruthy()
  })

  it('AU-CON-07 la UI no ofrece borrar, fusionar ni reordenar juegos', async () => {
    await mount()
    expect(screen.queryByRole('button', { name: /borrar|eliminar|fusionar|reordenar|subir|bajar|mover/i })).toBeNull()
    expect(songsCount()).toBe(baseSongs().length)
  })
})

const songsCount = () => document.querySelectorAll('[data-song-id]').length

describe('AU-SEL grupo de seleccion por juego', () => {
  const grouped = () => fakeAdmin({ games: GAMES.map((g) => (g.id === 'dp' ? { ...g, selectionGroup: 'rse' } : g)) })

  it('AU-SEL-01 desplegable "Grupo de seleccion" con "Su propio grupo" y los juegos cabeza', async () => {
    await mount()
    expect(optionLabels(groupSelect('unused'))).toEqual(['Su propio grupo', GAMES[0].name, GAMES[1].name])
    expect(groupSelect('unused').value).toBe('')
  })

  it('AU-SEL-01 refleja el grupo actual del servidor (dp pertenece al grupo de rse)', async () => {
    await mount(grouped())
    expect(groupSelect('dp').value).toBe('rse')
  })

  it('AU-SEL-02 no ofrece el propio juego ni miembros de otros grupos', async () => {
    await mount(grouped())
    expect(optionLabels(groupSelect('unused'))).toEqual(['Su propio grupo', GAMES[0].name]) // sin dp (miembro) ni unused
    expect(optionLabels(groupSelect('dp'))).not.toContain(GAMES[1].name)
  })

  it('AU-SEL-02 un juego cabeza de otros no puede unirse a otro grupo (solo "Su propio grupo")', async () => {
    await mount(grouped())
    expect(optionLabels(groupSelect('rse'))).toEqual(['Su propio grupo'])
  })

  it('AU-SEL-03 elegir un grupo envia PATCH { selectionGroup }', async () => {
    const fake = await mount()
    fireEvent.change(groupSelect('dp'), { target: { value: 'rse' } })
    await waitFor(() => expect(patches(fake).at(-1)).toMatchObject({ path: '/api/games/dp', body: { selectionGroup: 'rse' } }))
  })

  it('AU-SEL-03 "Su propio grupo" lo quita (selectionGroup null)', async () => {
    const fake = await mount(grouped())
    fireEvent.change(groupSelect('dp'), { target: { value: '' } })
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ selectionGroup: null }))
  })

  it('AU-SEL-04 error 400: mensaje y valor revertido', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' && r.path.startsWith('/api/games/') ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'El grupo de seleccion no es valido' } } } : undefined))
    await mount(fake)
    fireEvent.change(groupSelect('dp'), { target: { value: 'rse' } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/grupo de seleccion/i)
    await waitFor(() => expect(groupSelect('dp').value).toBe(''))
  })

  it('AU-SEL-05 tras cada cambio refleja el estado real del servidor (recarga del catalogo)', async () => {
    const fake = await mount()
    const before = fake.catalogGets()
    fireEvent.change(groupSelect('dp'), { target: { value: 'rse' } })
    await waitFor(() => expect(fake.catalogGets()).toBeGreaterThan(before))
    await waitFor(() => expect(optionLabels(groupSelect('rse'))).toEqual(['Su propio grupo'])) // rse pasa a ser cabeza de dp
    expect(groupSelect('dp').value).toBe('rse')
  })
})

const seriesSelect = (id: string) => screen.getByRole('combobox', { name: new RegExp(`^serie ${id}$`, 'i') }) as HTMLSelectElement

describe('AU-SER serie por juego (DEC-60)', () => {
  it('AU-SER-01 desplegable "Serie" con Principal y Spin-off, que refleja la serie del servidor', async () => {
    await mount(fakeAdmin({ games: GAMES.map((g) => (g.id === 'unused' ? { ...g, series: 'spinoff' as const } : g)) }))
    expect(optionLabels(seriesSelect('rse'))).toEqual(['Principal', 'Spin-off'])
    expect(seriesSelect('rse').value).toBe('main')
    expect(seriesSelect('unused').value).toBe('spinoff')
  })

  it('AU-SER-02 cambiar la serie envia PATCH { series }', async () => {
    const fake = await mount()
    fireEvent.change(seriesSelect('dp'), { target: { value: 'spinoff' } })
    await waitFor(() => expect(patches(fake).at(-1)).toMatchObject({ path: '/api/games/dp', body: { series: 'spinoff' } }))
  })

  it('AU-SER-03 el grupo de seleccion solo ofrece juegos cabeza de la misma serie', async () => {
    await mount(fakeAdmin({ games: GAMES.map((g) => (g.id === 'rse' ? { ...g, series: 'spinoff' as const } : g)) }))
    expect(optionLabels(groupSelect('unused'))).toEqual(['Su propio grupo', GAMES[1].name])
  })
})
