import type { History, Sample, UsageSource, UsageWindow, WindowHistory, WindowKind, WindowReadings } from '../types'

const HOUR_MS = 3_600_000
export const WINDOW_MS: Record<WindowKind, number> = { session: 5 * HOUR_MS, week: 7 * 24 * HOUR_MS }

// About this many samples per window: closer readings replace the last one.
const SAMPLES_PER_WINDOW = 200
// A reset time can drift a little between readings of one window.
const SAME_RESET_MS = 60_000
// Usage never falls within a window: a fall of more than this is a reset, early or not.
const FALL_POINTS = 5

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

const isSource = (value: unknown): value is UsageSource => value === 'card' || value === 'engine'

// A window without its source is from before readings kept to one source: dropped.
const windowHistoryFrom = (value: unknown): WindowHistory | undefined => {
  const current = readingsFrom(value)
  const { source } = (value ?? {}) as Partial<WindowHistory>
  if (current === undefined || !isSource(source)) return undefined

  const previous = readingsFrom((value as WindowHistory).previous)

  return { ...current, source, ...(previous && { previous }) }
}

// What the store holds, kept only where it has the expected shape.
export const historyFrom = (value: unknown): History => {
  if (typeof value !== 'object' || value === null) return {}

  const stored = value as Record<string, unknown>
  const session = windowHistoryFrom(stored.session)
  const week = windowHistoryFrom(stored.week)

  return { ...(session && { session }), ...(week && { week }) }
}

// The window ended once its reset has passed, or when usage fell: an early reset.
const hasEnded = (history: WindowHistory, sample: Sample): boolean => {
  const last = history.samples.at(-1)

  return sample.at >= history.resetsAt - SAME_RESET_MS || (last !== undefined && sample.percent < last.percent - FALL_POINTS)
}

// A new window, keeping the one that ended as the previous.
const renewed = (history: WindowHistory, resetsAt: number, sample: Sample): WindowHistory => {
  const ended = history.samples.length > 0 ? { resetsAt: history.resetsAt, samples: history.samples } : history.previous

  return { resetsAt, source: history.source, samples: [sample], ...(ended && { previous: ended }) }
}

const withSample = (
  history: WindowHistory | undefined,
  kind: WindowKind,
  resetsAt: number,
  sample: Sample,
  source: UsageSource,
): WindowHistory => {
  // The card wins over the engine: its readings start the history over.
  if (history === undefined || history.source !== source) return { resetsAt, source, samples: [sample] }
  if (hasEnded(history, sample)) return renewed(history, resetsAt, sample)

  const last = history.samples.at(-1)
  const isClose = last !== undefined && sample.at - last.at < WINDOW_MS[kind] / SAMPLES_PER_WINDOW
  const kept = isClose ? history.samples.slice(0, -1) : history.samples

  return { ...history, resetsAt, samples: [...kept, sample] }
}

// Adds a reading of each started window. The engine's readings are left out of a
// history the card keeps: they count other limits, and would pass for a new window.
export const record = (history: History, windows: readonly UsageWindow[], at: number, source: UsageSource): History =>
  windows.reduce<History>((next, window) => {
    const current = next[window.kind]
    if (window.resetsAt === undefined || (source === 'engine' && current?.source === 'card')) return next

    const sample = { at, percent: window.percentUsed }

    return { ...next, [window.kind]: withSample(current, window.kind, Date.parse(window.resetsAt), sample, source) }
  }, history)
