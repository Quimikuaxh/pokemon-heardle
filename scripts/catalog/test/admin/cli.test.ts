// AD-CLI-*: `npm run cli -- admin` (runCli con deps simuladas; nunca toca scripts/catalog/data).
import { describe, it, expect, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { adminCatalog } from '../helpers/admin'
import { io, makeDataDir, runCliSafe, tmp } from '../helpers/data'

/** admin-ui falso: con node_modules (dependencias instaladas) y dist. */
function adminUi(withModules = true) {
  const dir = tmp('heardle-adminui-')
  if (withModules) mkdirSync(join(dir, 'node_modules'), { recursive: true })
  mkdirSync(join(dir, 'dist'), { recursive: true })
  writeFileSync(join(dir, 'dist', 'index.html'), '<title>admin-ui</title>')
  return dir
}

function fakeServer(port = 5180) {
  return { port, url: `http://127.0.0.1:${port}`, token: 't', address: () => ({ address: '127.0.0.1', port, family: 'IPv4' }), close: vi.fn(async () => {}) }
}

function deps(over: Record<string, unknown> = {}) {
  const calls: Array<{ command: string; args: string[]; options?: any }> = []
  const server = fakeServer()
  const startServer = vi.fn(async (_o: any) => server)
  let release!: () => void
  const shutdown = new Promise<void>((r) => (release = r))
  return {
    calls,
    server,
    startServer,
    release,
    deps: {
      run: async (command: string, args: string[], options?: any) => {
        calls.push({ command, args, options })
        return { stdout: '' }
      },
      startServer,
      adminUiDir: adminUi(),
      waitForShutdown: () => shutdown,
      ...over,
    },
  }
}

const dataDir = () => makeDataDir({ catalog: adminCatalog() })

async function runAdmin(argv: string[], d: ReturnType<typeof deps>, out = io(), autoStop = true) {
  const p = runCliSafe(['admin', ...argv], out, d.deps as any)
  if (autoStop) setTimeout(() => d.release(), 30)
  return { code: await p, out }
}

describe('admin: arranque', () => {
  it('AD-CLI-01 ejecuta vite build de admin-ui antes de servir y sirve admin-ui/dist', async () => {
    const d = deps()
    await runAdmin(['--port', '0', '--data-dir', dataDir()], d)
    const build = d.calls.find((c) => /vite|build/.test([c.command, ...c.args].join(' ')))
    expect(build).toBeDefined()
    expect([build!.command, ...build!.args].join(' ')).toMatch(/build/)
    expect(d.startServer).toHaveBeenCalledTimes(1)
    expect(d.startServer.mock.calls[0][0].uiDir).toBe(join(d.deps.adminUiDir, 'dist'))
  })

  it('AD-CLI-01 el build ocurre antes de arrancar el servidor', async () => {
    const order: string[] = []
    const d = deps({
      run: async (c: string, a: string[]) => (order.push(`run ${c}`), { stdout: '' }),
      startServer: vi.fn(async () => (order.push('server'), fakeServer())),
    })
    await runAdmin(['--port', '0', '--data-dir', dataDir()], d)
    expect(order.at(-1)).toBe('server')
    expect(order.length).toBeGreaterThan(1)
  })

  it('AD-CLI-01 si el build falla termina con codigo != 0 y NO arranca el servidor', async () => {
    const d = deps({
      run: async () => {
        throw Object.assign(new Error('vite build failed'), { code: 1 })
      },
    })
    const { code, out } = await runAdmin(['--port', '0', '--data-dir', dataDir()], d)
    expect(code).not.toBe(0)
    expect(d.calls.length + (out.text().match(/vite|build fall|admin-ui/gi)?.length ?? 0)).toBeGreaterThan(0)
    expect(out.text()).toMatch(/vite|admin-ui/i)
    expect(d.startServer).not.toHaveBeenCalled()
  })

  it('AD-CLI-02 faltan las dependencias de admin-ui: mensaje con "npm --prefix scripts/catalog/admin-ui install" y sin arrancar', async () => {
    const d = deps({ adminUiDir: adminUi(false) })
    const { code, out } = await runAdmin(['--port', '0', '--data-dir', dataDir()], d)
    expect(code).not.toBe(0)
    expect(out.text()).toContain('npm --prefix scripts/catalog/admin-ui install')
    expect(d.startServer).not.toHaveBeenCalled()
    expect(d.calls.length).toBe(0)
  })

  it('AD-CLI-03 por defecto escucha en el puerto 5180', async () => {
    const d = deps()
    await runAdmin(['--data-dir', dataDir()], d)
    expect(d.startServer.mock.calls[0][0].port).toBe(5180)
  })

  for (const port of ['0', '1024', '5180', '65535']) {
    it(`AD-CLI-03 --port ${port} es valido`, async () => {
      const d = deps()
      const { code } = await runAdmin(['--port', port, '--data-dir', dataDir()], d)
      expect([code, d.startServer.mock.calls[0][0].port]).toEqual([0, Number(port)])
    })
  }

  for (const port of ['abc', '-1', '70000', '65536', '1.5', '']) {
    it(`AD-CLI-03 --port ${JSON.stringify(port)} -> error de uso y no arranca`, async () => {
      const d = deps()
      const { code, out } = await runAdmin(['--port', port, '--data-dir', dataDir()], d)
      expect(code).not.toBe(0)
      expect(out.text()).toMatch(/puerto|port/i)
      expect(d.startServer).not.toHaveBeenCalled()
    })
  }

  it('AD-CLI-04 --data-dir (absoluta) se pasa tal cual al servidor', async () => {
    const dir = dataDir()
    const d = deps()
    await runAdmin(['--port', '0', '--data-dir', dir], d)
    expect(d.startServer.mock.calls[0][0].dataDir).toBe(dir)
  })

  it('AD-CLI-04 --data-dir relativa se resuelve a una ruta absoluta', async () => {
    const d = deps()
    await runAdmin(['--port', '0', '--data-dir', 'relativo/data'], d)
    expect(d.startServer.mock.calls[0][0].dataDir).toMatch(/^\//)
  })

  it('AD-CLI-04 por defecto usa scripts/catalog/data (el servidor de test es un mock: no se toca el real)', async () => {
    const d = deps()
    await runAdmin(['--port', '0'], d)
    expect(String(d.startServer.mock.calls[0][0].dataDir).endsWith(join('scripts', 'catalog', 'data'))).toBe(true)
  })

  it('AD-CLI-04 --data-dir inexistente: error claro (o se documenta que se crea)', async () => {
    const d = deps()
    const missing = join(tmp(), 'no-existe')
    const { code, out } = await runAdmin(['--port', '0', '--data-dir', missing], d)
    if (code !== 0) expect(out.text()).toContain(missing)
    else expect(d.startServer).toHaveBeenCalled()
  })

  it('AD-CLI-04 --data-dir sin valor -> error de uso', async () => {
    const d = deps()
    const { code, out } = await runAdmin(['--port', '0', '--data-dir'], d)
    expect(code).not.toBe(0)
    expect(out.text()).toMatch(/data-dir/)
    expect(d.startServer).not.toHaveBeenCalled()
  })

  it('AD-CLI-05 imprime la URL http://127.0.0.1:<puerto>', async () => {
    const d = deps({ startServer: vi.fn(async () => fakeServer(5199)) })
    const { out } = await runAdmin(['--port', '5199', '--data-dir', dataDir()], d)
    expect(out.text()).toContain('http://127.0.0.1:5199')
  })

  it('AD-CLI-05 no abre navegador ni usa la red: solo se ejecuta el build', async () => {
    const d = deps()
    await runAdmin(['--port', '0', '--data-dir', dataDir()], d)
    const commands = d.calls.map((c) => c.command)
    expect(commands.length).toBeGreaterThan(0)
    for (const forbidden of ['xdg-open', 'open', 'start', 'curl', 'wget', 'sensible-browser']) expect(commands).not.toContain(forbidden)
  })

  it('AD-CLI-06 puerto ocupado: error claro y codigo != 0 (servidor real)', async () => {
    const blocker = net.createServer()
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', () => r()))
    const busy = (blocker.address() as net.AddressInfo).port
    try {
      const d = deps()
      const realServerDeps: any = { ...d.deps }
      delete realServerDeps.startServer
      const out = io()
      const code = await runCliSafe(['admin', '--port', String(busy), '--data-dir', dataDir()], out, realServerDeps)
      expect(code).not.toBe(0)
      expect(out.text()).toMatch(new RegExp(`${busy}|puerto|port|ocupado|EADDRINUSE`, 'i'))
    } finally {
      blocker.close()
    }
  })

  it('AD-CLI-07 al recibir la senal de cierre (SIGINT) cierra el servidor y espera a la cola del catalogStore antes de salir', async () => {
    const d = deps()
    const order: string[] = []
    d.server.close.mockImplementation(async () => void order.push('close'))
    const p = runCliSafe(['admin', '--port', '0', '--data-dir', dataDir()], io(), d.deps as any)
    await new Promise((r) => setTimeout(r, 30))
    expect(d.server.close).not.toHaveBeenCalled()
    d.release()
    expect(await p).toBe(0)
    expect(order).toEqual(['close'])
  })

  it('AD-CLI-07 el servidor sigue arrancado hasta la senal: runCli no resuelve antes', async () => {
    const d = deps()
    let resolved = false
    const p = runCliSafe(['admin', '--port', '0', '--data-dir', dataDir()], io(), d.deps as any).then(() => (resolved = true))
    await new Promise((r) => setTimeout(r, 50))
    expect(resolved).toBe(false)
    d.release()
    await p
  })

  it('el uso (sin subcomando) lista tambien admin', async () => {
    const out = io()
    await runCliSafe([], out)
    expect(out.text()).toContain('admin')
  })
})
