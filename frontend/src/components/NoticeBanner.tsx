import type { Notice } from '../game/controller'

export function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null
  return (
    <p role="status" className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      {notice.message}
      {notice.retryAfterSec ? ` Vuelve a intentarlo en ${notice.retryAfterSec} s.` : ''}
    </p>
  )
}
