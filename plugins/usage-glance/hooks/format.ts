const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// "5d 16h", "1h26", "12m": the native card's own short form.
export const formatRemaining = (ms: number): string => {
  if (ms <= 0) return 'now'

  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}`

  return `${Math.max(1, minutes)}m`
}
