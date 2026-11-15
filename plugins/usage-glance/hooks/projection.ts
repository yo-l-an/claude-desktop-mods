import type { Sample, UsageWindow, WindowHistory, WindowKind, WindowReadings } from '../types'
import { WINDOW_MS } from './history'

// Too early in a window the rate says nothing yet.
const MIN_ELAPSED_SHARE = 0.05
// The span the current pace is read over: the last hour of a session, the last day of a week.
const RECENT_MS: Record<WindowKind, number> = { session: 60 * 60_000, week: 24 * 60 * 60_000 }
// How much each pace weighs. The current pace shows a burst or a pause at once,
// the window's average keeps one busy hour from overturning it, and the last
// window, when its readings are kept, tells how the rest of a window tends to go.
const WEIGHTS = { recent: 0.6, average: 0.4 }
const WEIGHTS_WITH_PREVIOUS = { recent: 0.45, average: 0.25, previous: 0.3 }

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
  // The last window's readings, moved onto this window's time: its ghost.
  previous?: Sample[]
  outcome: Outcome
}

// The usage at `at`, read straight between the two readings around it, and
// flat after the last.
const valueAt = (path: Sample[], at: number): number => {
  const after = path.findIndex(sample => sample.at >= at)
  if (after === -1) return path.at(-1)?.percent ?? 0
  if (after === 0) return path[0]!.percent

  const before = path[after - 1]!
  const next = path[after]!

  return before.percent + ((next.percent - before.percent) * (at - before.at)) / (next.at - before.at)
}

// The last window's readings from its start, shifted so its start is `start`.
const ghostOf = (previous: WindowReadings | undefined, kind: WindowKind, start: number): Sample[] | undefined => {
  if (previous === undefined || previous.samples.length === 0) return undefined

  const shift = start - (previous.resetsAt - WINDOW_MS[kind])
  const samples = previous.samples.map(sample => ({ at: sample.at + shift, percent: sample.percent }))

  return [{ at: start, percent: 0 }, ...samples.filter(sample => sample.at > start)]
}

// Percent per millisecond, the paces blended.
const rateOf = (kind: WindowKind, path: Sample[], ghost: Sample[] | undefined, start: number, end: number, now: number, percent: number) => {
  const elapsed = now - start
  const span = Math.min(RECENT_MS[kind], elapsed)
  const recent = Math.max(0, percent - valueAt(path, now - span)) / span
  const average = percent / elapsed
  if (ghost === undefined) return WEIGHTS.recent * recent + WEIGHTS.average * average

  // What the last window used from this point in it to its reset.
  const previous = Math.max(0, valueAt(ghost, end) - valueAt(ghost, now)) / (end - now)

  return WEIGHTS_WITH_PREVIOUS.recent * recent + WEIGHTS_WITH_PREVIOUS.average * average + WEIGHTS_WITH_PREVIOUS.previous * previous
}

const outcomeOf = (kind: WindowKind, path: Sample[], ghost: Sample[] | undefined, start: number, end: number, now: number, percent: number): Outcome => {
  if (percent >= 100) return { kind: 'reached' }
  if (now - start < (end - start) * MIN_ELAPSED_SHARE || percent <= 0) return { kind: 'early' }

  const rate = rateOf(kind, path, ghost, start, end, now, percent)
  if (rate <= 0) return { kind: 'lasts', percent: Math.round(percent) }

  const hitsAt = now + (100 - percent) / rate

  return hitsAt < end ? { kind: 'hits', at: hitsAt } : { kind: 'lasts', percent: Math.round(percent + rate * (end - now)) }
}

export const project = (window: UsageWindow, history: WindowHistory | undefined, now: number): Projection | undefined => {
  if (window.resetsAt === undefined) return undefined

  const end = Date.parse(window.resetsAt)
  const start = end - WINDOW_MS[window.kind]
  const samples = (history?.samples ?? []).filter(sample => sample.at > start && sample.at < now)
  const path = [{ at: start, percent: 0 }, ...samples, { at: now, percent: window.percentUsed }]
  const ghost = ghostOf(history?.previous, window.kind, start)

  return {
    start,
    end,
    now,
    percent: window.percentUsed,
    path,
    ...(ghost && { previous: ghost }),
    outcome: outcomeOf(window.kind, path, ghost, start, end, now, window.percentUsed),
  }
}
