import { useCallback, useEffect, useRef, useState } from 'react'

export type WarmupStatus = 'waking' | 'ready' | 'error'

const FIRST_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 15_000
const GIVE_UP_AFTER_MS = 90_000

/**
 * Una llamada a /health al abrir y reintentos con backoff si la API no responde (hasta ~90 s; DEC-14, DEC-57).
 * Sin pings periodicos tras estar listo (REQUISITOS 9: no keep-alive).
 */
export function useBackendWarmup(api: { health(): Promise<unknown> }): { status: WarmupStatus; retry(): void } {
  const [status, setStatus] = useState<WarmupStatus>('waking')
  const apiRef = useRef(api)
  apiRef.current = api
  const cancelRef = useRef<() => void>(() => {})

  const start = useCallback(() => {
    cancelRef.current()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const startedAt = Date.now()
    let delayMs = FIRST_RETRY_DELAY_MS
    cancelRef.current = () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
    setStatus('waking')

    const attempt = async () => {
      try {
        await apiRef.current.health()
        if (!cancelled) setStatus('ready')
      } catch {
        if (cancelled) return
        if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
          setStatus('error')
          return
        }
        timer = setTimeout(attempt, delayMs)
        delayMs = Math.min(delayMs * 2, MAX_RETRY_DELAY_MS)
      }
    }
    void attempt()
  }, [])

  useEffect(() => {
    start()
    return () => cancelRef.current()
  }, [start])

  return { status, retry: start }
}
