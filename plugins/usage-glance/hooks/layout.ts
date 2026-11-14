import type { UsageWindow, WindowKind } from '../types'
import { formatRemaining, formatResetAt } from './format'
import { levelOf } from './tokens'
import type { Level } from './tokens'
import type { Words } from './words'

export type Item = {
  kind: WindowKind
  label: string
  isLabelShown: boolean
  percent: number
  level: Level
  // What the band shows after the percent: the reset, or the countdown alone when room is short.
  detail: string
  // The whole reset, "14:39 (1h26)", for the popover.
  reset: string
}

// Cells besides the text: the ring and its gap, a gap after the label and
// after the percent, three between two limits.
const RING_CELLS = 3
const GAP_CELLS = 1
const BETWEEN_CELLS = 3

type Density = 'full' | 'countdown' | 'bare'
const DENSITIES: readonly Density[] = ['full', 'countdown', 'bare']

const itemsAt = (windows: readonly UsageWindow[], at: number, words: Words, density: Density): Item[] =>
  windows.map(window => {
    const percent = Math.round(window.percentUsed)
    const resetsAt = window.resetsAt === undefined ? undefined : Date.parse(window.resetsAt)
    const remaining = resetsAt === undefined ? words.notStarted : formatRemaining(resetsAt - at, words)
    const reset =
      resetsAt === undefined ? words.notStarted : `${formatResetAt(window.kind, resetsAt, words)} (${remaining})`

    return {
      kind: window.kind,
      label: words[window.kind],
      isLabelShown: density !== 'bare',
      percent,
      level: levelOf(percent),
      detail: density === 'full' ? reset : remaining,
      reset,
    }
  })

const widthOf = (items: readonly Item[]): number =>
  items.reduce(
    (sum, item, index) =>
      sum +
      (index > 0 ? BETWEEN_CELLS : 0) +
      RING_CELLS +
      (item.isLabelShown ? item.label.length + GAP_CELLS : 0) +
      `${item.percent}%`.length +
      GAP_CELLS +
      item.detail.length,
    0,
  )

// The widest density that fits on one line; the barest one when none does.
export const layout = (windows: readonly UsageWindow[], at: number, words: Words, columns: number): Item[] =>
  DENSITIES.map(density => itemsAt(windows, at, words, density)).find(items => widthOf(items) <= columns) ??
  itemsAt(windows, at, words, 'bare')
