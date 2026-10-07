import { describe, it, expect } from 'vitest'
import { createStore } from '../storage/store'
import { mkFinished } from './helpers'

const throwingStorage = (name = 'QuotaExceededError'): Storage =>
  ({
    getItem: () => {
      throw new Error('storage no disponible')
    },
    setItem: () => {
      const e = new Error('cuota excedida')
      e.name = name
      throw e
    },
    removeItem: () => {
      throw new Error('x')
    },
    clear: () => {},
    key: () => null,
    length: 0,
  }) as Storage

describe('storage/store', () => {
  it('FE-FIL-03 el filtro persiste en heardle:filter y se restaura', () => {
    createStore(localStorage).setFilter(['rse', 'dp'])
    expect(JSON.parse(localStorage.getItem('heardle:filter')!)).toEqual(['rse', 'dp'])
    expect(createStore(localStorage).getFilter()).toEqual(['rse', 'dp'])
  })

  it('FE-FIL-03 sin filtro guardado devuelve []', () => {
    expect(createStore(localStorage).getFilter()).toEqual([])
  })

  it('el registro diario se guarda bajo heardle:daily:<fecha> y se recupera', () => {
    const s = createStore(localStorage)
    s.setDaily('2026-10-03', { token: 't', finished: false })
    expect(localStorage.getItem('heardle:daily:2026-10-03')).not.toBeNull()
    expect(s.getDaily('2026-10-03')).toEqual({ token: 't', finished: false })
  })

  it('un registro diario terminado conserva la vista final (resultado sin llamar a la API)', () => {
    const s = createStore(localStorage)
    const view = mkFinished({ mode: 'daily', date: '2026-10-03' })
    s.setDaily('2026-10-03', { token: 't', finished: true, view })
    expect(s.getDaily('2026-10-03')).toEqual({ token: 't', finished: true, view })
  })

  it('getDaily de otra fecha devuelve null (las fechas no se pisan)', () => {
    const s = createStore(localStorage)
    s.setDaily('2026-10-02', { token: 'ayer', finished: true })
    expect(s.getDaily('2026-10-03')).toBeNull()
  })

  it('la partida ilimitada se guarda en heardle:unlimited y se borra con null', () => {
    const s = createStore(localStorage)
    s.setUnlimited({ token: 'u1' })
    expect(JSON.parse(localStorage.getItem('heardle:unlimited')!)).toMatchObject({ token: 'u1' })
    s.setUnlimited(null)
    expect(s.getUnlimited()).toBeNull()
    expect(localStorage.getItem('heardle:unlimited')).toBeNull()
  })

  for (const key of ['heardle:filter', 'heardle:daily:2026-10-03', 'heardle:unlimited']) {
    for (const junk of ['{{{ no json', 'null', '42', '"cadena"', '[1,2,{"x"', '{"foo":1}']) {
      it(`FE-FIL-05 valor corrupto ${JSON.stringify(junk)} en ${key} -> valores por defecto sin excepcion`, () => {
        localStorage.setItem(key, junk)
        const s = createStore(localStorage)
        expect(() => {
          s.getFilter()
          s.getDaily('2026-10-03')
          s.getUnlimited()
        }).not.toThrow()
        if (key === 'heardle:filter') expect(s.getFilter()).toEqual([])
        if (key.startsWith('heardle:daily')) expect(s.getDaily('2026-10-03')).toBeNull()
        if (key === 'heardle:unlimited') expect(s.getUnlimited()).toBeNull()
      })
    }
  }

  it('FE-FIL-05 filtro con elementos que no son string se descarta entero', () => {
    localStorage.setItem('heardle:filter', '[1,2,3]')
    expect(createStore(localStorage).getFilter()).toEqual([])
  })

  it('FE-FIL-05 localStorage no disponible: ninguna operacion lanza y se devuelven valores por defecto', () => {
    const s = createStore(throwingStorage('SecurityError'))
    expect(() => {
      s.setFilter(['a'])
      s.setDaily('2026-10-03', { token: 't', finished: false })
      s.setUnlimited({ token: 't' })
    }).not.toThrow()
    expect([s.getFilter(), s.getDaily('2026-10-03'), s.getUnlimited()]).toEqual([[], null, null])
  })

  it('FE-FIL-05 cuota excedida al escribir: no lanza y marca writeFailed para avisar', () => {
    const s = createStore(throwingStorage('QuotaExceededError'))
    expect(s.writeFailed).toBe(false)
    s.setFilter(['a'])
    expect(s.writeFailed).toBe(true)
  })

  it('writeFailed sigue en false mientras las escrituras funcionan', () => {
    const s = createStore(localStorage)
    s.setFilter(['a'])
    expect(s.writeFailed).toBe(false)
  })

  // ---- FE-SET-06..09, 11: ajustes de pistas (DEC-52) ----
  const DEFAULTS = { consoleHint: false, dateHint: false }

  it('FE-SET-04 por defecto ambas pistas desactivadas', () => {
    expect(createStore(localStorage).getSettings()).toEqual(DEFAULTS)
  })

  it('FE-SET-06 se guardan en heardle:settings como { consoleHint, dateHint } y se restauran', () => {
    createStore(localStorage).setSettings({ consoleHint: true, dateHint: false })
    expect(JSON.parse(localStorage.getItem('heardle:settings')!)).toEqual({ consoleHint: true, dateHint: false })
    expect(createStore(localStorage).getSettings()).toEqual({ consoleHint: true, dateHint: false })
  })

  for (const junk of ['{{{ no json', 'null', '42', '"cadena"', '[true,true]', '{"consoleHint":"yes","dateHint":1}', '']) {
    it(`FE-SET-07 datos corruptos ${JSON.stringify(junk)} -> ambas desactivadas sin excepcion`, () => {
      localStorage.setItem('heardle:settings', junk)
      expect(() => createStore(localStorage).getSettings()).not.toThrow()
      expect(createStore(localStorage).getSettings()).toEqual(DEFAULTS)
    })
  }

  it('FE-SET-08 datos parciales: el campo ausente vale false', () => {
    localStorage.setItem('heardle:settings', JSON.stringify({ consoleHint: true }))
    expect(createStore(localStorage).getSettings()).toEqual({ consoleHint: true, dateHint: false })
    localStorage.setItem('heardle:settings', JSON.stringify({ dateHint: true }))
    expect(createStore(localStorage).getSettings()).toEqual({ consoleHint: false, dateHint: true })
  })

  it('FE-SET-08 claves extra se ignoran (no se devuelven)', () => {
    localStorage.setItem('heardle:settings', JSON.stringify({ consoleHint: true, dateHint: true, tema: 'oscuro' }))
    expect(createStore(localStorage).getSettings()).toEqual({ consoleHint: true, dateHint: true })
  })

  it('FE-SET-09 localStorage no disponible: funcionan en memoria sin excepcion', () => {
    const s = createStore(throwingStorage('SecurityError'))
    expect(() => s.setSettings({ consoleHint: true, dateHint: true })).not.toThrow()
    expect(s.getSettings()).toEqual({ consoleHint: true, dateHint: true })
    expect(s.writeFailed).toBe(true)
  })

  it('FE-SET-11 la limpieza de stats:* heredadas no borra heardle:settings', () => {
    localStorage.setItem('heardle:settings', JSON.stringify({ consoleHint: true, dateHint: true }))
    localStorage.setItem('heardle:stats:daily', '{"played":3}')
    const s = createStore(localStorage)
    expect(localStorage.getItem('heardle:stats:daily')).toBeNull()
    expect(s.getSettings()).toEqual({ consoleHint: true, dateHint: true })
  })

  it('FE-SET-06 los ajustes no tocan filter, daily ni unlimited', () => {
    const s = createStore(localStorage)
    s.setFilter(['rse'])
    s.setSettings({ consoleHint: true, dateHint: false })
    expect(s.getFilter()).toEqual(['rse'])
    expect(Object.keys(localStorage).sort()).toEqual(['heardle:filter', 'heardle:settings'])
  })
})
