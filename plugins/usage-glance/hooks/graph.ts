import type { Projection } from './projection'
import { COLORS, TRACK, levelOf } from './tokens'

// A minimal chart of one window: no axes or values, only shapes. The left edge is
// the window's start, the right edge its reset, the dashed top line the limit.
export const GRAPH_WIDTH = 126
export const GRAPH_HEIGHT = 33
const PAD = 3

type Point = { x: number; y: number }

// A tangent that keeps the curve between its neighbours: flat at a turn, and never
// steeper than twice either side's slope (Steffen's monotone cubic).
const tangentAt = (h0: number, h1: number, s0: number, s1: number): number => {
  if (s0 * s1 <= 0) return 0
  const blended = (s0 * h1 + s1 * h0) / (h0 + h1)

  return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), Math.abs(blended) / 2) * 2
}

// A smooth path through the points that never overshoots them, so usage never seems
// to drop or peak between two readings.
const smoothPath = (points: Point[]): string => {
  const [first, ...rest] = points
  if (first === undefined) return ''
  if (rest.length === 0) return `M${first.x.toFixed(1)},${first.y.toFixed(1)}`

  const slopes = rest.map((point, i) => (point.y - points[i]!.y) / (point.x - points[i]!.x))
  const widths = rest.map((point, i) => point.x - points[i]!.x)
  const tangents = points.map((_, i) =>
    i === 0 ? slopes[0]! : i === points.length - 1 ? slopes[i - 1]! : tangentAt(widths[i - 1]!, widths[i]!, slopes[i - 1]!, slopes[i]!),
  )
  const segments = rest.map((point, i) => {
    const from = points[i]!
    const third = widths[i]! / 3
    const c1 = `${(from.x + third).toFixed(1)},${(from.y + tangents[i]! * third).toFixed(1)}`
    const c2 = `${(point.x - third).toFixed(1)},${(point.y - tangents[i + 1]! * third).toFixed(1)}`

    return `C${c1} ${c2} ${point.x.toFixed(1)},${point.y.toFixed(1)}`
  })

  return `M${first.x.toFixed(1)},${first.y.toFixed(1)}${segments.join('')}`
}

export const graphSvg = (projection: Projection): string => {
  const { start, end, now, percent, path, outcome } = projection
  const xOf = (at: number) => PAD + ((at - start) / (end - start)) * (GRAPH_WIDTH - 2 * PAD)
  const yOf = (value: number) => GRAPH_HEIGHT - PAD - (Math.min(100, value) / 100) * (GRAPH_HEIGHT - 2 * PAD)
  const x = (at: number) => xOf(at).toFixed(1)
  const y = (value: number) => yOf(value).toFixed(1)

  // Readings closer than a pixel apart add nothing but kinks: the latest of them stays.
  const points = path
    .map(sample => ({ x: xOf(sample.at), y: yOf(sample.percent) }))
    .filter((point, i, all) => i === all.length - 1 || all[i + 1]!.x - point.x >= 1)
  const target =
    outcome.kind === 'hits' ? { at: outcome.at, percent: 100 } : outcome.kind === 'lasts' ? { at: end, percent: outcome.percent } : undefined
  const targetColor = COLORS[levelOf(target?.percent ?? percent)]

  const limit = `<line x1="${PAD}" y1="${y(100)}" x2="${GRAPH_WIDTH - PAD}" y2="${y(100)}" stroke="${TRACK.color}" stroke-opacity="${TRACK.opacity}" stroke-dasharray="2 3"/>`
  const reset = `<line x1="${GRAPH_WIDTH - PAD}" y1="${PAD}" x2="${GRAPH_WIDTH - PAD}" y2="${GRAPH_HEIGHT - PAD}" stroke="${TRACK.color}" stroke-opacity="${TRACK.opacity}"/>`
  const usedLine = `<path d="${smoothPath(points)}" fill="none" stroke="${COLORS[levelOf(percent)]}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
  const projected = target
    ? `<line x1="${x(now)}" y1="${y(percent)}" x2="${x(target.at)}" y2="${y(target.percent)}" stroke="${targetColor}" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round" opacity="0.8"/>` +
      `<circle cx="${x(target.at)}" cy="${y(target.percent)}" r="2.5" fill="${targetColor}"/>`
    : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAPH_WIDTH}" height="${GRAPH_HEIGHT}" viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}">` +
    `${limit}${reset}${usedLine}${projected}</svg>`
  )
}
