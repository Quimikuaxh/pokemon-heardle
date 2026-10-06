// `fetch` ejecutado por runCli con --data-dir temporal y yt-dlp simulado (deps.run).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { io, makeDataDir, runCliSafe } from './helpers/data'

function ytDlp(listing: unknown) {
  const calls: string[][] = []
  const run = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args])
    if (args.includes('--flat-playlist')) return { stdout: JSON.stringify(listing), stderr: '' }
    return { stdout: '', stderr: '' }
  }
  return { run, calls }
}

describe('fetch', () => {
  it('SC-FE-01 una playlist guarda sus entradas en playlist.json y descarga esos videos', async () => {
    const dir = makeDataDir({})
    const fake = ytDlp({ entries: [{ id: 'AAAAAAAAAAA', title: 'Pallet Town - Pokémon Red/Blue/Yellow Soundtrack' }] })
    expect(await runCliSafe(['fetch', '--data-dir', dir, 'https://www.youtube.com/playlist?list=PLx'], io(), { run: fake.run })).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'work', 'playlist.json'), 'utf8'))).toEqual([
      { youtubeId: 'AAAAAAAAAAA', title: 'Pallet Town - Pokémon Red/Blue/Yellow Soundtrack' },
    ])
    expect(fake.calls.at(-1)).toContain('https://www.youtube.com/watch?v=AAAAAAAAAAA')
  })

  it('SC-FE-03 la descarga prefiere audio m4a y cae a bestaudio si no hay', async () => {
    const dir = makeDataDir({})
    const fake = ytDlp({ entries: [{ id: 'AAAAAAAAAAA', title: 'Pallet Town - Pokémon Red/Blue/Yellow Soundtrack' }] })
    await runCliSafe(['fetch', '--data-dir', dir, 'https://www.youtube.com/playlist?list=PLx'], io(), { run: fake.run })
    const download = fake.calls.at(-1)!
    expect(download.at(download.indexOf('-f') + 1)).toBe('bestaudio[ext=m4a]/bestaudio')
  })

  it('SC-FE-02 una URL de video suelto (sin entries) se trata como una lista de un video', async () => {
    const dir = makeDataDir({})
    const fake = ytDlp({ id: 'ge77CBUPSxU', title: 'Jubilife Village (Beginning) ~ Medley' })
    expect(await runCliSafe(['fetch', '--data-dir', dir, 'https://www.youtube.com/watch?v=ge77CBUPSxU'], io(), { run: fake.run })).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'work', 'playlist.json'), 'utf8'))).toEqual([
      { youtubeId: 'ge77CBUPSxU', title: 'Jubilife Village (Beginning) ~ Medley' },
    ])
    expect(fake.calls.at(-1)).toContain('https://www.youtube.com/watch?v=ge77CBUPSxU')
  })
})
