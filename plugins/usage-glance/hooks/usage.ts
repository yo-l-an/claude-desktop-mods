import type { UsageWindow, WindowKind } from '../types'

// The app's usage card names its windows in English; the engine by kind.
const WINDOWS: readonly { kind: WindowKind; cardLabel: RegExp; engineKind: string }[] = [
  { kind: 'session', cardLabel: /5-hour/i, engineKind: 'five_hour' },
  { kind: 'week', cardLabel: /weekly.*all models/i, engineKind: 'seven_day' },
]

type Reading = { percentUsed: number; resetsAt?: string }
type CardWindow = Reading & { label: string }
type RateLimit = Reading & { kind: string }

// The desktop app's usage card, as `ccd_session_mgmt get_usage` answers it.
export const windowsFromCard = (text: string): UsageWindow[] => {
  const card = JSON.parse(text).plan
  if (card?.status !== 'ok') return []

  const cards: CardWindow[] = card.windows ?? []

  return WINDOWS.flatMap(({ kind, cardLabel }) => {
    const found = cards.find(window => cardLabel.test(window.label))

    return found ? [{ kind, percentUsed: found.percentUsed, resetsAt: found.resetsAt }] : []
  })
}

// Off the desktop app the card is not there: the engine's last reading stands in.
export const windowsFromRateLimits = (rateLimits: readonly RateLimit[]): UsageWindow[] =>
  WINDOWS.flatMap(({ kind, engineKind }) => {
    const limit = rateLimits.find(window => window.kind === engineKind)

    return limit ? [{ kind, percentUsed: limit.percentUsed, resetsAt: limit.resetsAt }] : []
  })
