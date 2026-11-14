import type { WindowKind } from '../types'
import type { Words } from './words'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const pad = (value: number): string => String(value).padStart(2, '0')

// "5d 16h", "1h26", "12m": the native card's own short form.
export const formatRemaining = (ms: number, words: Words): string => {
  if (ms <= 0) return words.now

  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)

  if (days > 0) return `${days}${words.days} ${hours}h`
  if (hours > 0) return `${hours}h${pad(minutes)}`

  return `${Math.max(1, minutes)}${words.minutes}`
}

// When the window resets, in local time: "14:39" for the session, "Sun. 22:00" for the week.
export const formatResetAt = (kind: WindowKind, at: number, words: Words): string => {
  const date = new Date(at)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  return kind === 'session' ? clock : `${words.weekdays[date.getDay()] ?? ''} ${clock}`
}
