import { useEffect, useRef, useState } from 'react'
import { formatCountdown, msUntilNextMadridDay } from '../game/format'
import { DexNote } from './Pokedex'

/**
 * Cuenta atras hasta la siguiente cancion del dia (medianoche de Europe/Madrid, DEC-58). Al llegar a 0 avisa una
 * vez con `onExpire` (el tablero abre el diario nuevo). `role="timer"`: los lectores no la anuncian cada segundo.
 */
export function NextDayCountdown({ onExpire, now = Date.now }: { onExpire?: () => void; now?: () => number }) {
  const [remaining, setRemaining] = useState(() => msUntilNextMadridDay(now()))
  const previous = useRef(remaining)
  const expired = useRef(false)
  useEffect(() => {
    const timer = setInterval(() => {
      const left = msUntilNextMadridDay(now())
      // Pasada la medianoche el calculo apunta a la siguiente: el salto hacia arriba marca el fin de la cuenta.
      const crossed = left > previous.current + 1000
      previous.current = left
      if (crossed && !expired.current) {
        expired.current = true
        setRemaining(0)
        onExpire?.()
        return
      }
      if (!expired.current) setRemaining(left)
    }, 1000)
    return () => clearInterval(timer)
  }, [now, onExpire])
  return (
    <DexNote>
      <span>
        Siguiente canción<span className="hidden sm:inline"> del día</span> en
      </span>
      <span role="timer" className="font-mono text-lg font-bold tracking-[2px] text-dex-yellow lg:text-xl">
        {formatCountdown(remaining)}
      </span>
    </DexNote>
  )
}
