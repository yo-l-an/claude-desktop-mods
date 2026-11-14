import type { History, Sample, UsageWindow, WindowHistory, WindowKind } from '../types'

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

const windowHistoryFrom = (value: unknown): WindowHistory | undefined => {
  if (typeof value !== 'object' || value === null) return undefined

  const { resetsAt, samples } = value as WindowHistory
  if (typeof resetsAt !== 'number' || !Array.isArray(samples)) return undefined

  return { resetsAt, samples: samples.filter(isSample) }
}

// What the store holds, kept only where it has the expected shape.
export const historyFrom = (value: unknown): History => {
  if (typeof value !== 'object' || value === null) return {}

  const stored = value as Record<string, unknown>
  const session = windowHistoryFrom(stored.session)
  const week = windowHistoryFrom(stored.week)

  return { ...(session && { session }), ...(week && { week }) }
}

const withSample = (previous: WindowHistory | undefined, kind: WindowKind, resetsAt: number, sample: Sample): WindowHistory => {
  if (previous === undefined || Math.abs(previous.resetsAt - resetsAt) > SAME_RESET_MS) {
    return { resetsAt, samples: [sample] }
  }

  const last = previous.samples.at(-1)
  const isClose = last !== undefined && sample.at - last.at < WINDOW_MS[kind] / SAMPLES_PER_WINDOW
  const kept = isClose ? previous.samples.slice(0, -1) : previous.samples

  return { resetsAt, samples: [...kept, sample] }
}

// Adds a reading of each started window; a new reset starts that window's history over.
export const record = (history: History, windows: readonly UsageWindow[], at: number): History =>
  windows.reduce<History>((next, window) => {
    if (window.resetsAt === undefined) return next

    const sample = { at, percent: window.percentUsed }

    return { ...next, [window.kind]: withSample(next[window.kind], window.kind, Date.parse(window.resetsAt), sample) }
  }, history)
