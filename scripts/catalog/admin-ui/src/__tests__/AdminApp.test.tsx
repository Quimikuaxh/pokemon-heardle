import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { AdminApp } from '../AdminApp'
import { baseSongs, fakeAdmin, mkSong } from './helpers'

async function mount(fake = fakeAdmin()) {
  render(<AdminApp fetchFn={fake.fetchFn as any} />)
  await screen.findByText('Littleroot Town')
  return fake
}

const row = (id: string): HTMLElement => {
  const el = document.querySelector(`[data-song-id="${id}"]`)
  if (!el) throw new Error(`no hay fila para ${id}`)
  return el as HTMLElement
}
const btn = (scope: HTMLElement, name: RegExp | string) => within(scope).getByRole('button', { name })
const patches = (fake: ReturnType<typeof fakeAdmin>) => fake.mutations().filter((m) => m.method === 'PATCH')

describe('AdminApp: lista y sesion', () => {
  it('AU-UI-01 lista todas las canciones con titulo, juegos, estado activa/desactivada y revisada/pendiente', async () => {
    await mount()
    expect(document.querySelectorAll('[data-song-id]').length).toBe(5)
    const littleroot = row('rse-littleroot-town')
    expect(littleroot.textContent).toContain('Littleroot Town')
    expect(littleroot.textContent).toContain('Pokémon Ruby / Sapphire / Emerald')
    expect(within(littleroot).getByRole('button', { name: /^Desactivar$/ })).toBeTruthy()
    expect(within(littleroot).getByRole('button', { name: /marcar pendiente/i })).toBeTruthy()
    expect(within(row('rse-oldale-town')).getByRole('button', { name: /^Activar$/ })).toBeTruthy()
    expect(within(row('rse-oldale-town')).getByRole('button', { name: /marcar revisada/i })).toBeTruthy()
  })

  it('AU-UI-02 obtiene el token con GET /api/session y lo envia como X-Admin-Token en TODAS las mutaciones', async () => {
    const fake = await mount()
    fireEvent.click(btn(row('rse-oldale-town'), /^Activar$/))
    await waitFor(() => expect(patches(fake).length).toBe(1))
    fireEvent.change(screen.getByRole('textbox', { name: /nombre del juego nuevo/i }), { target: { value: 'Pokémon X / Y' } })
    fireEvent.click(screen.getByRole('button', { name: /crear juego/i }))
    await waitFor(() => expect(fake.mutations().length).toBe(2))
    expect(fake.sessionGets()).toBe(1)
    for (const m of fake.mutations()) expect(m.headers['x-admin-token']).toBe('tok-123')
  })

  it('AU-UI-02 las lecturas (GET /api/catalog) no necesitan el token', async () => {
    const fake = await mount()
    for (const g of fake.log.filter((r) => r.method === 'GET' && r.path === '/api/catalog')) expect(g.headers['x-admin-token']).toBeUndefined()
  })

  it('AU-UI-03 si /api/session falla muestra un mensaje de error claro (role=alert)', async () => {
    const fake = fakeAdmin()
    fake.failSession(5)
    render(<AdminApp fetchFn={fake.fetchFn as any} />)
    await screen.findByText('Littleroot Town')
    fireEvent.click(btn(row('rse-oldale-town'), /^Activar$/))
    expect((await screen.findByRole('alert')).textContent?.length).toBeGreaterThan(0)
  })

  it('AU-UI-03 una mutacion con 403 reintenta obtener la sesion UNA vez y no entra en bucle', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' ? { status: 403, body: { error: { code: 'FORBIDDEN', message: 'token invalido' } } } : undefined))
    await mount(fake)
    fireEvent.click(btn(row('rse-oldale-town'), /^Activar$/))
    await screen.findByRole('alert')
    await new Promise((r) => setTimeout(r, 50))
    expect(fake.sessionGets()).toBeLessThanOrEqual(2)
    expect(patches(fake).length).toBeLessThanOrEqual(2)
  })
})

describe('AdminApp: activar, desactivar y cortas', () => {
  it('AU-UI-04 cancion corta: marca "Demasiado corta (7,4 s)" y "Activar" deshabilitado; pulsar no envia PATCH', async () => {
    const fake = await mount()
    const short = row('rse-badge')
    expect(short.textContent).toContain('Demasiado corta (7,4 s)')
    const activate = btn(short, /^Activar$/) as HTMLButtonElement
    expect(activate.disabled).toBe(true)
    fireEvent.click(activate)
    await new Promise((r) => setTimeout(r, 30))
    expect(patches(fake)).toEqual([])
  })

  it('AU-UI-05 si el servidor responde 409 TOO_SHORT muestra el mensaje y el estado vuelve a desactivada', async () => {
    const songs = baseSongs()
    songs[1] = mkSong({ ...songs[1], tooShort: false }) // el cliente cree que es larga, el servidor sabe que no
    const fake = fakeAdmin({ songs })
    fake.setOverride((r) => (r.method === 'PATCH' ? { status: 409, body: { error: { code: 'TOO_SHORT', message: 'La cancion es demasiado corta para activarla' } } } : undefined))
    await mount(fake)
    fireEvent.click(btn(row('rse-oldale-town'), /^Activar$/))
    expect((await screen.findByRole('alert')).textContent).toMatch(/demasiado corta/i)
    expect(within(row('rse-oldale-town')).getByRole('button', { name: /^Activar$/ })).toBeTruthy()
    expect(within(row('rse-oldale-town')).queryByRole('button', { name: /^Desactivar$/ })).toBeNull()
  })

  it('AU-UI-06 una larga se activa y desactiva con PATCH { enabled }', async () => {
    const fake = await mount()
    fireEvent.click(btn(row('rse-oldale-town'), /^Activar$/))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ enabled: true }))
    await waitFor(() => expect(within(row('rse-oldale-town')).getByRole('button', { name: /^Desactivar$/ })).toBeTruthy())
    fireEvent.click(btn(row('rse-oldale-town'), /^Desactivar$/))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ enabled: false }))
  })

  it('AU-UI-06 una corta ya desactivada no ofrece "Desactivar"', async () => {
    await mount()
    expect(within(row('rse-badge')).queryByRole('button', { name: /^Desactivar$/ })).toBeNull()
  })
})

describe('AdminApp: edicion de titulo, juegos y revision', () => {
  it('AU-UI-07 editar titulo envia PATCH { title }', async () => {
    const fake = await mount()
    const input = within(row('rse-oldale-town')).getByRole('textbox', { name: /t[ií]tulo/i })
    fireEvent.change(input, { target: { value: 'Oldale Town (editada)' } })
    fireEvent.click(btn(row('rse-oldale-town'), /guardar t[ií]tulo/i))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ title: 'Oldale Town (editada)' }))
    expect(patches(fake).at(-1)?.path).toBe('/api/songs/rse-oldale-town')
  })

  it('AU-UI-07 titulo vacio bloqueado en cliente: sin peticion', async () => {
    const fake = await mount()
    const input = within(row('rse-oldale-town')).getByRole('textbox', { name: /t[ií]tulo/i })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(btn(row('rse-oldale-town'), /guardar t[ií]tulo/i))
    await new Promise((r) => setTimeout(r, 30))
    expect(patches(fake)).toEqual([])
  })

  it('AU-UI-07 un error 400 del servidor se muestra', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Titulo demasiado largo' } } } : undefined))
    await mount(fake)
    const input = within(row('rse-oldale-town')).getByRole('textbox', { name: /t[ií]tulo/i })
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.click(btn(row('rse-oldale-town'), /guardar t[ií]tulo/i))
    expect((await screen.findByRole('alert')).textContent).toMatch(/demasiado largo/i)
  })

  it('AU-UI-08 editar juegos: seleccion multiple y PATCH { games }; el selector solo ofrece los juegos existentes', async () => {
    const fake = await mount()
    const group = within(row('rse-oldale-town')).getByRole('group', { name: /juegos/i })
    expect(within(group).getAllByRole('checkbox').length).toBe(3)
    fireEvent.click(within(group).getByRole('checkbox', { name: /Diamond/ }))
    fireEvent.click(btn(row('rse-oldale-town'), /guardar juegos/i))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ games: ['rse', 'dp'] }))
  })

  it('AU-UI-08 una cancion sin juegos permite asignarlos', async () => {
    const fake = await mount()
    const group = within(row('dp-twinleaf-town')).getByRole('group', { name: /juegos/i })
    fireEvent.click(within(group).getByRole('checkbox', { name: /Diamond/ }))
    fireEvent.click(btn(row('dp-twinleaf-town'), /guardar juegos/i))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ games: ['dp'] }))
  })

  it('AU-UI-11 marcar revisada / pendiente envia PATCH { reviewed }', async () => {
    const fake = await mount()
    fireEvent.click(btn(row('rse-oldale-town'), /marcar revisada/i))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ reviewed: true }))
    await waitFor(() => expect(within(row('rse-oldale-town')).getByRole('button', { name: /marcar pendiente/i })).toBeTruthy())
    fireEvent.click(btn(row('rse-oldale-town'), /marcar pendiente/i))
    await waitFor(() => expect(patches(fake).at(-1)?.body).toEqual({ reviewed: false }))
  })
})

describe('AdminApp: juegos', () => {
  it('AU-UI-09 crear juego: POST /api/games { name } y aparece como opcion en las canciones', async () => {
    const fake = await mount()
    fireEvent.change(screen.getByRole('textbox', { name: /nombre del juego nuevo/i }), { target: { value: 'Pokémon X / Y' } })
    fireEvent.click(screen.getByRole('button', { name: /crear juego/i }))
    await waitFor(() => expect(fake.mutations().at(-1)).toMatchObject({ method: 'POST', path: '/api/games', body: { name: 'Pokémon X / Y' } }))
    await waitFor(() => expect(within(within(row('rse-oldale-town')).getByRole('group', { name: /juegos/i })).getByRole('checkbox', { name: /X \/ Y/ })).toBeTruthy())
  })

  it('AU-UI-09 nombre vacio: sin peticion', async () => {
    const fake = await mount()
    fireEvent.click(screen.getByRole('button', { name: /crear juego/i }))
    await new Promise((r) => setTimeout(r, 30))
    expect(fake.mutations()).toEqual([])
  })

  it('AU-UI-09 nombre duplicado: el error del servidor se muestra', async () => {
    await mount()
    fireEvent.change(screen.getByRole('textbox', { name: /nombre del juego nuevo/i }), { target: { value: 'pokémon diamond / pearl' } })
    fireEvent.click(screen.getByRole('button', { name: /crear juego/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/ya existe/i)
  })

  it('AU-UI-10 renombrar juego: PATCH /api/games/:id { name }; las canciones siguen referenciando el mismo id', async () => {
    const fake = await mount()
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del juego rse' }), { target: { value: 'Pokémon RSE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Renombrar rse' }))
    await waitFor(() => expect(fake.mutations().at(-1)).toMatchObject({ method: 'PATCH', path: '/api/games/rse', body: { name: 'Pokémon RSE' } }))
    await waitFor(() => expect(row('rse-littleroot-town').textContent).toContain('Pokémon RSE'))
    expect(fake.state.songs[0].games).toEqual(['rse'])
  })

  it('AU-UI-10 renombrar a un nombre duplicado muestra el error del servidor', async () => {
    await mount()
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del juego rse' }), { target: { value: 'Pokémon Diamond / Pearl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Renombrar rse' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/ya existe/i)
  })

  it('AU-UI-22 contadores por juego (songCount) y total de canciones', async () => {
    await mount()
    const panel = screen.getByRole('textbox', { name: 'Nombre del juego rse' }).closest('li, tr, div')!.parentElement!
    expect(panel.textContent).toMatch(/4/) // rse: littleroot, oldale, badge, dash
    expect(screen.getByText(/5 canciones/)).toBeTruthy()
  })
})

describe('AdminApp: ausencias deliberadas', () => {
  it('AU-UI-12 no existe ningun campo, boton ni atajo para editar startSec ("usar posicion actual")', async () => {
    const fake = await mount()
    expect(screen.queryAllByRole('spinbutton').length).toBe(0)
    expect(screen.queryByRole('button', { name: /posici[oó]n actual|usar posici|startsec|inicio del fragmento/i })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /startsec|inicio/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/startSec/i)
    // barrido de acciones: ninguna peticion incluye startSec
    for (const name of [/marcar revisada/i, /^Activar$/]) fireEvent.click(within(row('rse-oldale-town')).getAllByRole('button', { name })[0])
    await new Promise((r) => setTimeout(r, 30))
    for (const m of fake.mutations()) expect(JSON.stringify(m.body ?? {})).not.toContain('startSec')
  })

  it('AU-UI-13 no hay acciones de borrar/fusionar juegos ni de oir los 6 fragmentos', async () => {
    await mount()
    expect(screen.queryByRole('button', { name: /borrar|eliminar|fusionar|quitar juego/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/fragmento/i)
    expect(document.querySelectorAll('audio').length).toBe(document.querySelectorAll('[data-song-id]').length - 1) // todas menos la sin fuente
  })
})

describe('AdminApp: reproductor del tema completo', () => {
  it('AU-UI-14 <audio controls> con src /api/songs/<id>/audio (id codificado) cuando hay fuente', async () => {
    await mount()
    const audio = row('dp-dash').querySelector('audio')!
    expect(audio.getAttribute('src')).toBe('/api/songs/dp-dash/audio')
    expect(audio.hasAttribute('controls')).toBe(true)
  })

  it('AU-UI-14 el id se codifica en la URL', async () => {
    const fake = fakeAdmin({ songs: [mkSong({ id: 'rse-littleroot-town', title: 'Littleroot Town' }), mkSong({ id: 'raro id/x', title: 'Cancion Rara' })] })
    render(<AdminApp fetchFn={fake.fetchFn as any} />)
    await screen.findByText('Cancion Rara')
    const audio = document.querySelector('[data-song-id="raro id/x"] audio')!
    expect(audio.getAttribute('src')).toBe(`/api/songs/${encodeURIComponent('raro id/x')}/audio`)
  })

  it('AU-UI-15 hasSource false: sin <audio> y aviso "sin fuente descargada"', async () => {
    await mount()
    const r = row('dp-twinleaf-town')
    expect(r.querySelector('audio')).toBeNull()
    expect(r.textContent).toMatch(/sin fuente descargada/i)
  })
})

describe('AdminApp: errores, recarga y filtros', () => {
  it('AU-UI-16 los errores por cancion (errors[]) se muestran en su fila', async () => {
    await mount()
    expect(row('dp-twinleaf-town').textContent).toContain('games debe ser un array no vacio')
    expect(row('rse-littleroot-town').textContent).not.toContain('games debe ser')
  })

  it('AU-UI-16 se pueden filtrar las canciones con errores', async () => {
    await mount()
    fireEvent.click(screen.getByRole('checkbox', { name: /solo con errores/i }))
    await waitFor(() => expect(document.querySelectorAll('[data-song-id]').length).toBe(1))
    expect(row('dp-twinleaf-town')).toBeTruthy()
  })

  it('AU-UI-04 / AU-FIL se puede filtrar por cortas, por juego y por texto desde la UI', async () => {
    await mount()
    fireEvent.click(screen.getByRole('checkbox', { name: /solo cortas/i }))
    await waitFor(() => expect(document.querySelectorAll('[data-song-id]').length).toBe(1))
    fireEvent.click(screen.getByRole('checkbox', { name: /solo cortas/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /juego/i }), { target: { value: 'dp' } })
    await waitFor(() => expect(document.querySelectorAll('[data-song-id]').length).toBe(1))
    fireEvent.change(screen.getByRole('combobox', { name: /juego/i }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: /buscar/i }), { target: { value: 'oldale' } })
    await waitFor(() => expect(document.querySelectorAll('[data-song-id]').length).toBe(1))
  })

  it('AU-UI-17 tras cada cambio recarga la lista (GET /api/catalog)', async () => {
    const fake = await mount()
    const before = fake.catalogGets()
    fireEvent.click(btn(row('rse-oldale-town'), /marcar revisada/i))
    await waitFor(() => expect(fake.catalogGets()).toBeGreaterThan(before))
  })

  it('AU-UI-17 al recuperar el foco de la ventana recarga', async () => {
    const fake = await mount()
    const before = fake.catalogGets()
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(fake.catalogGets()).toBeGreaterThan(before))
  })

  it('AU-UI-17 al volver la pestana a visible (visibilitychange) recarga', async () => {
    const fake = await mount()
    const before = fake.catalogGets()
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(fake.catalogGets()).toBeGreaterThan(before))
  })

  it('AU-UI-18 un 500 en una edicion muestra mensaje y revierte la fila sin perder el resto', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' ? { status: 500, body: { error: { code: 'SERVER_ERROR', message: 'Fallo interno' } } } : undefined))
    await mount(fake)
    const input = within(row('rse-oldale-town')).getByRole('textbox', { name: /t[ií]tulo/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Cambio que falla' } })
    fireEvent.click(btn(row('rse-oldale-town'), /guardar t[ií]tulo/i))
    expect((await screen.findByRole('alert')).textContent).toMatch(/fallo interno/i)
    expect(document.querySelectorAll('[data-song-id]').length).toBe(5)
    expect(fake.state.songs[1].title).toBe('Oldale Town')
  })

  it('AU-UI-18 un fallo de red en una edicion muestra mensaje y no rompe la lista', async () => {
    const fake = await mount()
    const real = fake.fetchFn.getMockImplementation()!
    fake.fetchFn.mockImplementation(async (input: any, init: any) => {
      if (init?.method === 'PATCH') throw new TypeError('Failed to fetch')
      return real(input, init)
    })
    fireEvent.click(btn(row('rse-oldale-town'), /marcar revisada/i))
    expect((await screen.findByRole('alert')).textContent?.length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-song-id]').length).toBe(5)
  })

  it('AU-UI-19 la recarga por foco no pisa el texto que el usuario esta escribiendo en otra fila', async () => {
    const fake = await mount()
    const input = within(row('rse-oldale-town')).getByRole('textbox', { name: /t[ií]tulo/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Borrador a medias' } })
    fake.state.songs[0].title = 'Cambiado fuera' // otro proceso edita otra cancion
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await screen.findByText('Cambiado fuera')
    expect((within(row('rse-oldale-town')).getByRole('textbox', { name: /t[ií]tulo/i }) as HTMLInputElement).value).toBe('Borrador a medias')
  })
})

describe('AdminApp: idioma y accesibilidad', () => {
  it('AU-UI-20 interfaz en espanol; titulos y juegos tal cual', async () => {
    await mount()
    expect(screen.getByRole('button', { name: /crear juego/i })).toBeTruthy()
    expect(within(row('rse-littleroot-town')).getByRole('button', { name: /^Desactivar$/ })).toBeTruthy()
    expect(row('rse-littleroot-town').textContent).toContain('Pokémon Ruby / Sapphire / Emerald')
  })

  it('AU-UI-21 todos los botones tienen nombre accesible y los deshabilitados usan disabled/aria-disabled', async () => {
    await mount()
    for (const b of screen.getAllByRole('button')) {
      expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim().length).toBeGreaterThan(0)
    }
    const disabled = within(row('rse-badge')).getByRole('button', { name: /^Activar$/ })
    expect(disabled.hasAttribute('disabled') || disabled.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('AU-UI-21 cada campo de texto y checkbox tiene etiqueta accesible', async () => {
    await mount()
    for (const field of [...screen.getAllByRole('textbox'), ...screen.getAllByRole('checkbox'), ...screen.getAllByRole('combobox')]) {
      const labelled = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || (field as HTMLInputElement).labels?.length
      expect(labelled).toBeTruthy()
    }
  })
})

describe('SongRow: etiquetas y borradores', () => {
  it('AU-UI-23 cada campo de titulo tiene un nombre accesible unico', async () => {
    await mount()
    const names = screen.getAllByRole('textbox').filter((t) => (t.getAttribute('aria-label') ?? '').startsWith('Título de ')).map((t) => t.getAttribute('aria-label'))
    expect(names.length).toBe(5)
    expect(new Set(names).size).toBe(5)
    expect(screen.getByRole('textbox', { name: 'Título de Oldale Town' })).toBeTruthy()
  })

  it('AU-UI-24 si el PATCH falla el borrador del titulo NO se descarta', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Titulo demasiado largo' } } } : undefined))
    await mount(fake)
    const input = screen.getByRole('textbox', { name: 'Título de Oldale Town' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Borrador que falla' } })
    fireEvent.click(within(input.closest('[data-song-id]') as HTMLElement).getByRole('button', { name: /guardar t[ií]tulo/i }))
    await screen.findByRole('alert')
    expect((screen.getByRole('textbox', { name: 'Título de Oldale Town' }) as HTMLInputElement).value).toBe('Borrador que falla')
  })

  it('AU-UI-24 si el PATCH funciona el borrador se descarta y se ve el titulo guardado', async () => {
    await mount()
    fireEvent.change(screen.getByRole('textbox', { name: 'Título de Oldale Town' }), { target: { value: 'Guardado Bien' } })
    fireEvent.click(within(document.querySelector('[data-song-id="rse-oldale-town"]') as HTMLElement).getByRole('button', { name: /guardar t[ií]tulo/i }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Título de Guardado Bien' }) as HTMLInputElement).value).toBe('Guardado Bien'))
  })

  it('AU-UI-24 si el PATCH de juegos falla la seleccion no se descarta', async () => {
    const fake = fakeAdmin()
    fake.setOverride((r) => (r.method === 'PATCH' ? { status: 500, body: { error: { code: 'SERVER_ERROR', message: 'Fallo' } } } : undefined))
    await mount(fake)
    const row = document.querySelector('[data-song-id="rse-oldale-town"]') as HTMLElement
    const diamond = within(within(row).getByRole('group', { name: /juegos/i })).getByRole('checkbox', { name: /Diamond/ }) as HTMLInputElement
    fireEvent.click(diamond)
    fireEvent.click(within(row).getByRole('button', { name: /guardar juegos/i }))
    await screen.findByRole('alert')
    expect((within(document.querySelector('[data-song-id="rse-oldale-town"]') as HTMLElement).getByRole('checkbox', { name: /Diamond/ }) as HTMLInputElement).checked).toBe(true)
  })
})
