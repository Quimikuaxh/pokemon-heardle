// Contrato: src/catalogStore.ts (ver helpers/data.ts). Todo en directorio temporal.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { createCatalogStore, nodeCatalogFs } from '../src/catalogStore'
import type { CatalogFs } from '../src/catalogStore'
import { catalogOf, song, tmp, writeJsonFile } from './helpers/data'

function setup(catalog: any = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'vid00000001' }), song({ id: 'two', clipKey: '2222222222222222', youtubeId: 'vid00000002' })])) {
  const dir = tmp()
  const file = join(dir, 'catalog.json')
  const original = writeJsonFile(file, catalog)
  return { dir, file, original }
}

const listing = (dir: string) => readdirSync(dir).sort()

function spyFs(base: CatalogFs = nodeCatalogFs) {
  const calls: Array<{ op: string; args: string[] }> = []
  const wrap = <K extends keyof CatalogFs>(op: K): CatalogFs[K] =>
    (async (...args: any[]) => {
      calls.push({ op, args: args.filter((a) => typeof a === 'string').map(String) })
      return (base[op] as any)(...args)
    }) as any
  const fs: CatalogFs = {
    readFile: wrap('readFile'),
    writeSynced: wrap('writeSynced'),
    rename: wrap('rename'),
    copyFile: wrap('copyFile'),
    unlink: wrap('unlink'),
    exists: wrap('exists'),
  }
  return { fs, calls }
}

describe('catalogStore.update', () => {
  it('SC-CS-01 lee el fichero en ese momento, aplica el cambio y escribe; el resto queda intacto', async () => {
    const { file } = setup()
    const store = createCatalogStore({ file })
    await store.update((c) => {
      c.songs[0].title = 'Nuevo titulo'
    })
    const after = JSON.parse(readFileSync(file, 'utf8'))
    expect(after.songs[0].title).toBe('Nuevo titulo')
    expect(after.songs[1].title).toBe('two')
    expect(after.games.length).toBe(2)
  })

  it('SC-CS-01 devuelve el catalogo resultante', async () => {
    const { file } = setup()
    const result = await createCatalogStore({ file }).update((c) => {
      c.songs[1].reviewed = true
    })
    expect(result.songs[1].reviewed).toBe(true)
  })

  it('SC-CS-01 el mutator puede devolver un catalogo nuevo en lugar de mutar', async () => {
    const { file } = setup()
    await createCatalogStore({ file }).update((c) => ({ ...c, generatedAt: 'X' }))
    expect(JSON.parse(readFileSync(file, 'utf8')).generatedAt).toBe('X')
  })

  it('SC-CS-02 escribe catalog.json.tmp-<pid> en el MISMO directorio y luego rename sobre catalog.json', async () => {
    const { file, dir } = setup()
    const { fs, calls } = spyFs()
    await createCatalogStore({ file, fs }).update((c) => {
      c.songs[0].title = 'x'
    })
    const write = calls.find((c) => c.op === 'writeSynced')!
    const rename = calls.find((c) => c.op === 'rename')!
    expect(dirname(write.args[0])).toBe(dir)
    expect(basename(write.args[0])).toBe(`catalog.json.tmp-${process.pid}`)
    expect(rename.args).toEqual([write.args[0], file])
  })

  it('SC-CS-02 el orden es escribir (con fsync) y despues rename', async () => {
    const { file } = setup()
    const { fs, calls } = spyFs()
    await createCatalogStore({ file, fs }).update((c) => {
      c.songs[0].title = 'x'
    })
    const ops = calls.map((c) => c.op)
    expect(ops.indexOf('writeSynced')).toBeGreaterThanOrEqual(0)
    expect(ops.indexOf('writeSynced')).toBeLessThan(ops.indexOf('rename'))
  })

  it('SC-CS-02 tras la operacion no queda ningun .tmp (solo catalog.json y catalog.json.bak)', async () => {
    const { file, dir } = setup()
    await createCatalogStore({ file }).update((c) => {
      c.songs[0].title = 'x'
    })
    expect(listing(dir)).toEqual(['catalog.json', 'catalog.json.bak'])
  })

  it('SC-CS-03 fallo en rename: el original queda intacto byte a byte y el .tmp se limpia', async () => {
    const { file, dir, original } = setup()
    const fs: CatalogFs = {
      ...nodeCatalogFs,
      rename: async () => {
        throw new Error('EXDEV simulado')
      },
    }
    const store = createCatalogStore({ file, fs })
    await expect(store.update((c) => void (c.songs[0].title = 'x'))).rejects.toThrow()
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(listing(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
  })

  it('SC-CS-03 fallo a mitad de escritura (disco lleno): original intacto y .tmp limpiado', async () => {
    const { file, dir, original } = setup()
    const fs: CatalogFs = {
      ...nodeCatalogFs,
      writeSynced: async (p, data) => {
        writeFileSync(p, data.slice(0, 10)) // escritura parcial
        throw new Error('ENOSPC simulado')
      },
    }
    await expect(createCatalogStore({ file, fs }).update((c) => void (c.songs[0].title = 'x'))).rejects.toThrow()
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(listing(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
  })

  it('SC-CS-03 tras un fallo la cola sigue operativa', async () => {
    const { file } = setup()
    let failing = true
    const fs: CatalogFs = {
      ...nodeCatalogFs,
      rename: async (a, b) => {
        if (failing) throw new Error('fallo transitorio')
        return nodeCatalogFs.rename(a, b)
      },
    }
    const store = createCatalogStore({ file, fs })
    await expect(store.update((c) => void (c.songs[0].title = 'a'))).rejects.toThrow()
    failing = false
    await store.update((c) => void (c.songs[0].title = 'b'))
    expect(JSON.parse(readFileSync(file, 'utf8')).songs[0].title).toBe('b')
  })

  it('SC-CS-04 20 update concurrentes incrementando un contador: resultado 20, sin perdidas', async () => {
    const { file, dir } = setup()
    const store = createCatalogStore({ file })
    await Promise.all(Array.from({ length: 20 }, () => store.update((c) => void (c.counter = (c.counter ?? 0) + 1))))
    expect(JSON.parse(readFileSync(file, 'utf8')).counter).toBe(20)
    expect(listing(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
  })

  it('SC-CS-04 las operaciones se ejecutan en el orden en que se encolan', async () => {
    const { file } = setup()
    const store = createCatalogStore({ file })
    const order: number[] = []
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.update((c) => void (order.push(n), (c.last = n)))))
    expect(order).toEqual([1, 2, 3, 4, 5])
    expect(JSON.parse(readFileSync(file, 'utf8')).last).toBe(5)
  })

  it('SC-CS-05 una edicion externa entre dos update se conserva (lectura-modificacion-escritura)', async () => {
    const { file } = setup()
    const store = createCatalogStore({ file })
    await store.update((c) => void (c.songs[0].title = 'A'))
    const external = JSON.parse(readFileSync(file, 'utf8'))
    external.songs[1].title = 'EXTERNO'
    writeFileSync(file, JSON.stringify(external, null, 2) + '\n')
    await store.update((c) => void (c.songs[0].reviewed = true))
    const final = JSON.parse(readFileSync(file, 'utf8'))
    expect([final.songs[0].title, final.songs[0].reviewed, final.songs[1].title]).toEqual(['A', true, 'EXTERNO'])
  })

  it('SC-CS-06 .bak: la primera escritura copia el original y las siguientes no lo sobrescriben', async () => {
    const { file, dir, original } = setup()
    const store = createCatalogStore({ file })
    for (const n of [1, 2, 3]) await store.update((c) => void (c.songs[0].title = `t${n}`))
    expect(readFileSync(join(dir, 'catalog.json.bak'), 'utf8')).toBe(original)
  })

  it('SC-CS-06 un arranque nuevo (otra instancia) hace su propio .bak antes de su primera escritura', async () => {
    const { file, dir } = setup()
    await createCatalogStore({ file }).update((c) => void (c.songs[0].title = 'primera'))
    const before = readFileSync(file, 'utf8')
    await createCatalogStore({ file }).update((c) => void (c.songs[0].title = 'segunda'))
    expect(readFileSync(join(dir, 'catalog.json.bak'), 'utf8')).toBe(before)
  })

  it('SC-CS-07 un mutator que lanza no escribe nada, no crea .bak y la cola sigue funcionando', async () => {
    const { file, dir, original } = setup()
    const store = createCatalogStore({ file })
    await expect(
      store.update(() => {
        throw new Error('mutator roto')
      }),
    ).rejects.toThrow('mutator roto')
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(existsSync(join(dir, 'catalog.json.bak'))).toBe(false)
    await store.update((c) => void (c.songs[0].title = 'ok'))
    expect(JSON.parse(readFileSync(file, 'utf8')).songs[0].title).toBe('ok')
  })

  it('SC-CS-07 un mutator asincrono que rechaza tampoco escribe', async () => {
    const { file, original } = setup()
    await expect(createCatalogStore({ file }).update(async () => Promise.reject(new Error('async roto')))).rejects.toThrow('async roto')
    expect(readFileSync(file, 'utf8')).toBe(original)
  })

  it('SC-CS-11 conserva campos desconocidos (raiz, cancion, source) y el orden de claves', async () => {
    const cat = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'vid00000001', durationSec: 99.5 })])
    cat.extra = { nota: 'x' }
    cat.songs[0].notas = ['a', 'b']
    cat.songs[0].source.otro = 1
    const { file, original } = setup(cat)
    const untouchedKeys = JSON.stringify(Object.keys(cat.songs[0]))
    await createCatalogStore({ file }).update((c) => void (c.songs[0].title = 'cambiado'))
    const after = JSON.parse(readFileSync(file, 'utf8'))
    expect([after.extra, after.songs[0].notas, after.songs[0].source.otro, after.songs[0].source.durationSec]).toEqual([{ nota: 'x' }, ['a', 'b'], 1, 99.5])
    expect(JSON.stringify(Object.keys(after.songs[0]))).toBe(untouchedKeys)
    expect(readFileSync(file, 'utf8').split('\n').length).toBe(original.split('\n').length)
  })

  it('SC-CS-12 solo escribe dentro del directorio del catalogo (tambien en la ruta de fallo)', async () => {
    const { file, dir } = setup()
    const { fs, calls } = spyFs({ ...nodeCatalogFs, rename: async () => Promise.reject(new Error('x')) })
    const store = createCatalogStore({ file, fs })
    await store.update((c) => void (c.songs[0].title = 'x')).catch(() => {})
    const writes = calls.filter((c) => ['writeSynced', 'rename', 'copyFile', 'unlink'].includes(c.op)).flatMap((c) => c.args)
    expect(writes.length).toBeGreaterThan(0)
    for (const p of writes) expect(dirname(p)).toBe(dir)
  })

  it('SC-CS-12 idle() resuelve cuando la cola esta vacia', async () => {
    const { file } = setup()
    const store = createCatalogStore({ file })
    const pending = store.update((c) => void (c.songs[0].title = 'x'))
    await store.idle()
    await pending
    expect(JSON.parse(readFileSync(file, 'utf8')).songs[0].title).toBe('x')
  })
})

describe('catalogStore.readTolerant', () => {
  it('SC-CS-08 un catalogo valido devuelve contenido y errors vacio', async () => {
    const { file } = setup()
    const r = await createCatalogStore({ file }).readTolerant()
    expect([r.catalog.songs.length, r.errors]).toEqual([2, []])
  })

  it('SC-CS-08 catalogo invalido (games vacio, corta activa, youtubeId malo) se carga igualmente con los errores del validador', async () => {
    const cat = catalogOf([
      song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'vid00000001', games: [] }),
      song({ id: 'two', clipKey: '2222222222222222', youtubeId: 'vid00000002', durationSec: 7.4 }),
      song({ id: 'three', clipKey: '3333333333333333', youtubeId: 'corto' }),
    ])
    const { file } = setup(cat)
    const r = await createCatalogStore({ file }).readTolerant()
    expect(r.catalog.songs.length).toBe(3)
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
    for (const id of ['one', 'two', 'three']) expect(r.errors.some((e: string) => e.includes(id))).toBe(true)
  })

  it('SC-CS-08 update tambien funciona sobre un catalogo invalido (el admin existe para corregirlo)', async () => {
    const { file } = setup(catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'vid00000001', games: [] })]))
    await createCatalogStore({ file }).update((c) => void (c.songs[0].games = ['rse']))
    expect(JSON.parse(readFileSync(file, 'utf8')).songs[0].games).toEqual(['rse'])
  })

  for (const [label, content] of [
    ['JSON corrupto', '{"version": 1, "songs": ['],
    ['fichero vacio', ''],
    ['solo espacios', '   \n'],
  ] as Array<[string, string]>) {
    it(`SC-CS-09 ${label}: lectura y update rechazan con error claro y NO sobrescriben el fichero`, async () => {
      const dir = tmp()
      const file = join(dir, 'catalog.json')
      writeFileSync(file, content)
      const store = createCatalogStore({ file })
      await expect(store.readTolerant()).rejects.toThrow(/catalog\.json/)
      await expect(store.update((c) => void (c.x = 1))).rejects.toThrow(/catalog\.json/)
      expect(readFileSync(file, 'utf8')).toBe(content)
      expect(listing(dir)).toEqual(['catalog.json'])
    })
  }

  it('SC-CS-09 fichero inexistente: error claro y no se crea nada', async () => {
    const dir = tmp()
    const file = join(dir, 'catalog.json')
    const store = createCatalogStore({ file })
    await expect(store.readTolerant()).rejects.toThrow(/catalog\.json/)
    await expect(store.update(() => undefined)).rejects.toThrow(/catalog\.json/)
    expect(listing(dir)).toEqual([])
  })
})

describe('catalogStore: uso desde draft y build', () => {
  it('SC-CS-10 draft y build escriben catalog.json solo mediante catalogStore.update (revision estatica del codigo)', () => {
    const srcDir = join(__dirname, '..', 'src')
    const files = ['cli.ts', 'draft.ts', 'build.ts'].filter((f) => existsSync(join(srcDir, f)))
    const cli = readFileSync(join(srcDir, 'cli.ts'), 'utf8')
    expect(cli).toMatch(/catalogStore/)
    for (const f of files) {
      const text = readFileSync(join(srcDir, f), 'utf8')
      expect(text, `${f} escribe el catalogo directamente`).not.toMatch(/writeJson\(\s*paths\.catalog|writeFileSync\([^)]*catalog\.json/)
    }
  })

  it('SC-CS-13 update conserva selectionGroup, consoles y el orden de games', async () => {
    const games = [
      { id: 'sm', name: 'Sun/Moon', consoles: ['3DS'] },
      { id: 'xy', name: 'X/Y', consoles: ['3DS'] },
      { id: 'usum', name: 'USUM', consoles: ['3DS'], selectionGroup: 'sm' },
      { id: 'za', name: 'Z-A', consoles: ['Switch', 'Switch 2'] },
    ]
    const { file } = setup(catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'vid00000001', games: ['sm'] })], games))
    await createCatalogStore({ file }).update((c) => void (c.songs[0].title = 'otro'))
    expect(JSON.parse(readFileSync(file, 'utf8')).games).toEqual(games)
  })
})
