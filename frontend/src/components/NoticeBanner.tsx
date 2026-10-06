import type { Notice } from '../game/controller'

export function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null
  return (
    <p role="status" className="m-0 rounded-lg border-2 border-near bg-field px-3 py-2 text-sm text-ink">
      {notice.message}
      {notice.retryAfterSec ? ` Vuelve a intentarlo en ${notice.retryAfterSec} s.` : ''}
    </p>
  )
}
