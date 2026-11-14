import type { Sample, UsageWindow, WindowHistory, WindowKind } from '../types'
import { WINDOW_MS } from './history'

// Too early in a window the rate says nothing yet.
const MIN_ELAPSED_SHARE = 0.05
// The span the current pace is read over: the last hour of a session, the last day of a week.
const RECENT_MS: Record<WindowKind, number> = { session: 60 * 60_000, week: 24 * 60 * 60_000 }
// How much the current pace weighs against the window's average: a burst or a
// pause shows at once, while a single busy hour doesn't overturn a whole week.
const RECENT_WEIGHT = 0.6

export type Outcome =
  | { kind: 'early' }
  | { kind: 'reached' }
  | { kind: 'hits'; at: number }
  | { kind: 'lasts'; percent: number }

export type Projection = {
  start: number
  end: number
  now: number
  percent: number
  // The readings from the window's start, where usage is 0, to now.
  path: Sample[]
  outcome: Outcome
}

// The usage at `at`, read straight between the two readings around it.
const valueAt = (path: Sample[], at: number): number => {
  const after = path.findIndex(sample => sample.at >= at)
  if (after <= 0) return path[Math.max(0, after)]?.percent ?? 0

  const before = path[after - 1]!
  const next = path[after]!

  return before.percent + ((next.percent - before.percent) * (at - before.at)) / (next.at - before.at)
}

// Percent per millisecond: the pace of the recent span blended with the window's average.
const rateOf = (kind: WindowKind, path: Sample[], start: number, now: number, percent: number): number => {
  const elapsed = now - start
  const span = Math.min(RECENT_MS[kind], elapsed)
  const recent = Math.max(0, percent - valueAt(path, now - span)) / span
  const average = percent / elapsed

  return RECENT_WEIGHT * recent + (1 - RECENT_WEIGHT) * average
}

const outcomeOf = (kind: WindowKind, path: Sample[], start: number, end: number, now: number, percent: number): Outcome => {
  if (percent >= 100) return { kind: 'reached' }
  if (now - start < (end - start) * MIN_ELAPSED_SHARE || percent <= 0) return { kind: 'early' }

  const rate = rateOf(kind, path, start, now, percent)
  const hitsAt = now + (100 - percent) / rate

  return hitsAt < end ? { kind: 'hits', at: hitsAt } : { kind: 'lasts', percent: Math.round(percent + rate * (end - now)) }
}

export const project = (window: UsageWindow, history: WindowHistory | undefined, now: number): Projection | undefined => {
  if (window.resetsAt === undefined) return undefined

  const end = Date.parse(window.resetsAt)
  const start = end - WINDOW_MS[window.kind]
  const samples = (history?.samples ?? []).filter(sample => sample.at > start && sample.at < now)
  const path = [{ at: start, percent: 0 }, ...samples, { at: now, percent: window.percentUsed }]

  return {
    start,
    end,
    now,
    percent: window.percentUsed,
    path,
    outcome: outcomeOf(window.kind, path, start, end, now, window.percentUsed),
  }
}
