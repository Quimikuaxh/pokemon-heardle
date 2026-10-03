import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBackendWarmup } from '../api/warmup'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('api/warmup useBackendWarmup', () => {
  it('FE-API-03 una sola llamada a /health al abrir y listo al responder', async () => {
    const health = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useBackendWarmup({ health }))
    await advance(0)
    expect([health.mock.calls.length, result.current.status]).toEqual([1, 'ready'])
  })

  it('FE-API-03 sin pings periodicos: 10 minutos despues sigue habiendo 1 sola llamada y ningun setInterval', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    const health = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => useBackendWarmup({ health }))
    await advance(10 * 60_000)
    expect([health.mock.calls.length, spy.mock.calls.length]).toEqual([1, 0])
  })

  it('FE-API-01 si /health falla, status waking y reintenta hasta que responde', async () => {
    const health = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockRejectedValueOnce(new Error('503'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useBackendWarmup({ health }))
    await advance(0)
    expect(result.current.status).toBe('waking')
    await advance(60_000)
    expect([result.current.status, health.mock.calls.length]).toEqual(['ready', 4])
  })

  it('FE-API-01 backoff: los intervalos entre reintentos son positivos y no decrecen', async () => {
    const times: number[] = []
    const health = vi.fn(async () => {
      times.push(Date.now())
      if (times.length < 5) throw new Error('503')
      return { ok: true }
    })
    renderHook(() => useBackendWarmup({ health }))
    await advance(80_000)
    const gaps = times.slice(1).map((t, i) => t - times[i])
    expect(gaps.length).toBe(4)
    expect(gaps[0]).toBeGreaterThan(0)
    gaps.slice(1).forEach((g, i) => expect(g).toBeGreaterThanOrEqual(gaps[i]))
  })

  it('FE-API-01 a los 60 s sin exito sigue en waking (no se rinde pronto)', async () => {
    const health = vi.fn().mockRejectedValue(new Error('503'))
    const { result } = renderHook(() => useBackendWarmup({ health }))
    await advance(60_000)
    expect(result.current.status).toBe('waking')
  })

  it('FE-API-02 tras ~90 s sin exito pasa a error y deja de reintentar', async () => {
    const health = vi.fn().mockRejectedValue(new Error('503'))
    const { result } = renderHook(() => useBackendWarmup({ health }))
    await advance(130_000)
    expect(result.current.status).toBe('error')
    const n = health.mock.calls.length
    await advance(120_000)
    expect(health.mock.calls.length).toBe(n)
  })

  it('FE-API-02 retry() vuelve a waking y llama de nuevo a /health', async () => {
    const health = vi.fn().mockRejectedValue(new Error('503'))
    const { result } = renderHook(() => useBackendWarmup({ health }))
    await advance(130_000)
    const n = health.mock.calls.length
    health.mockResolvedValue({ ok: true })
    act(() => result.current.retry())
    await advance(0)
    expect(health.mock.calls.length).toBeGreaterThan(n)
    expect(result.current.status).toBe('ready')
  })

  it('al desmontar se cancelan los reintentos pendientes', async () => {
    const health = vi.fn().mockRejectedValue(new Error('503'))
    const { unmount } = renderHook(() => useBackendWarmup({ health }))
    await advance(0)
    unmount()
    const n = health.mock.calls.length
    await advance(120_000)
    expect(health.mock.calls.length).toBe(n)
  })
})
