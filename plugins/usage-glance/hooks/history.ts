import type { History, Sample, UsageWindow, WindowHistory, WindowKind, WindowReadings } from '../types'

const HOUR_MS = 3_600_000
export const WINDOW_MS: Record<WindowKind, number> = { session: 5 * HOUR_MS, week: 7 * 24 * HOUR_MS }

// About this many samples per window: closer readings replace the last one.
const SAMPLES_PER_WINDOW = 200
// The card's reset times drift by milliseconds between readings of one window.
const SAME_RESET_MS = 60_000

const isSample = (value: unknown): value is Sample =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Sample).at === 'number' &&
  typeof (value as Sample).percent === 'number'

const readingsFrom = (value: unknown): WindowReadings | undefined => {
  if (typeof value !== 'object' || value === null) return undefined

  const { resetsAt, samples } = value as WindowReadings
  if (typeof resetsAt !== 'number' || !Array.isArray(samples)) return undefined

  return { resetsAt, samples: samples.filter(isSample) }
}

const windowHistoryFrom = (value: unknown): WindowHistory | undefined => {
  const current = readingsFrom(value)
  if (current === undefined) return undefined

  const previous = readingsFrom((value as WindowHistory).previous)

  return { ...current, ...(previous && { previous }) }
}

// What the store holds, kept only where it has the expected shape.
export const historyFrom = (value: unknown): History => {
  if (typeof value !== 'object' || value === null) return {}

  const stored = value as Record<string, unknown>
  const session = windowHistoryFrom(stored.session)
  const week = windowHistoryFrom(stored.week)

  return { ...(session && { session }), ...(week && { week }) }
}

// A later reset starts the window over and keeps the one that ended as the previous.
const renewed = (history: WindowHistory | undefined, resetsAt: number, sample: Sample): WindowHistory => {
  if (history === undefined || history.resetsAt > resetsAt) return { resetsAt, samples: [sample] }

  const ended = history.samples.length > 0 ? { resetsAt: history.resetsAt, samples: history.samples } : history.previous

  return { resetsAt, samples: [sample], ...(ended && { previous: ended }) }
}

const withSample = (history: WindowHistory | undefined, kind: WindowKind, resetsAt: number, sample: Sample): WindowHistory => {
  if (history === undefined || Math.abs(history.resetsAt - resetsAt) > SAME_RESET_MS) return renewed(history, resetsAt, sample)

  const last = history.samples.at(-1)
  const isClose = last !== undefined && sample.at - last.at < WINDOW_MS[kind] / SAMPLES_PER_WINDOW
  const kept = isClose ? history.samples.slice(0, -1) : history.samples

  return { ...history, samples: [...kept, sample] }
}

// Adds a reading of each started window.
export const record = (history: History, windows: readonly UsageWindow[], at: number): History =>
  windows.reduce<History>((next, window) => {
    if (window.resetsAt === undefined) return next

    const sample = { at, percent: window.percentUsed }

    return { ...next, [window.kind]: withSample(next[window.kind], window.kind, Date.parse(window.resetsAt), sample) }
  }, history)
