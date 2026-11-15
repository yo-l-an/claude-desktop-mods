import type { Sample } from '../types'
import type { Projection } from './projection'
import { COLORS, DANGER_FROM, TRACK, WARN_FROM, levelOf } from './tokens'

// A minimal chart of one window: no axes or values, only shapes. The left edge is
// the window's start, the right edge its reset, the dashed top line the limit.
export const GRAPH_WIDTH = 126
const PLOT_HEIGHT = 33
// A strip under the plot, where the ghost is named while the plot is hovered.
const LABEL_HEIGHT = 9
export const GRAPH_HEIGHT = PLOT_HEIGHT + LABEL_HEIGHT
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

// Each color change on the projection blends over this many points each side of its threshold.
const BLEND_POINTS = 4

// The projection's colors from `from`% to `to`%: the ring's color at each usage,
// blue to yellow at the warning, yellow to red at the danger threshold.
const projectionStops = (from: number, to: number): string => {
  const offsetOf = (value: number) => Math.min(1, Math.max(0, (value - from) / (to - from)))
  const stop = (value: number, color: string) => `<stop offset="${offsetOf(value).toFixed(3)}" stop-color="${color}"/>`
  const changes = [
    { at: WARN_FROM, before: COLORS.normal, after: COLORS.warn },
    { at: DANGER_FROM, before: COLORS.warn, after: COLORS.danger },
  ].filter(change => change.at > from && change.at < to)

  return [
    stop(from, COLORS[levelOf(from)]),
    ...changes.flatMap(change => [stop(change.at - BLEND_POINTS, change.before), stop(change.at + BLEND_POINTS, change.after)]),
    stop(to, COLORS[levelOf(to)]),
  ].join('')
}

// The window's time across, its usage up, in the drawing's pixels.
const scaleOf = ({ start, end }: Projection) => ({
  xOf: (at: number) => PAD + ((at - start) / (end - start)) * (GRAPH_WIDTH - 2 * PAD),
  yOf: (value: number) => PLOT_HEIGHT - PAD - (Math.min(100, value) / 100) * (PLOT_HEIGHT - 2 * PAD),
})

// Readings closer than a pixel apart add nothing but kinks: the latest of them stays.
const curveOf = (projection: Projection, samples: Sample[]): string => {
  const { xOf, yOf } = scaleOf(projection)
  const points = samples
    .map(sample => ({ x: xOf(sample.at), y: yOf(sample.percent) }))
    .filter((point, i, all) => i === all.length - 1 || all[i + 1]!.x - point.x >= 1)

  return smoothPath(points)
}

const svgOf = (content: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAPH_WIDTH}" height="${GRAPH_HEIGHT}" viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}">${content}</svg>`

// Escapes the five characters XML reads as markup.
const escaped = (text: string): string =>
  text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)

// Only the plot takes the pointer. Hovering it brings the last window's line to
// the front, dims this one's and names the ghost in the strip below.
const HOVER_STYLE =
  '<style>*{pointer-events:none}.plot{pointer-events:all}.front,.label{opacity:0}' +
  '.plot:hover~.front,.plot:hover~.label{opacity:1}.plot:hover~.back{opacity:0}.plot:hover~.current{opacity:.3}</style>'

const ghostLine = (projection: Projection, samples: Sample[], className: string, opacity: number): string =>
  `<path class="${className}" d="${curveOf(projection, samples)}" fill="none" stroke="${TRACK.color}" ` +
  `stroke-opacity="${opacity}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`

// With a ghost, the graph is drawn interactive so its own hover can light it.
export const graphSvg = (projection: Projection, previousLabel: string): string => {
  const { end, now, percent, path, outcome, previous } = projection
  const { xOf, yOf } = scaleOf(projection)
  const x = (at: number) => xOf(at).toFixed(1)
  const y = (value: number) => yOf(value).toFixed(1)

  const target =
    outcome.kind === 'hits' ? { at: outcome.at, percent: 100 } : outcome.kind === 'lasts' ? { at: end, percent: outcome.percent } : undefined
  const targetColor = COLORS[levelOf(target?.percent ?? percent)]

  const limit = `<line x1="${PAD}" y1="${y(100)}" x2="${GRAPH_WIDTH - PAD}" y2="${y(100)}" stroke="${TRACK.color}" stroke-opacity="${TRACK.opacity}" stroke-dasharray="2 3"/>`
  const reset = `<line x1="${GRAPH_WIDTH - PAD}" y1="${PAD}" x2="${GRAPH_WIDTH - PAD}" y2="${PLOT_HEIGHT - PAD}" stroke="${TRACK.color}" stroke-opacity="${TRACK.opacity}"/>`
  const usedLine = `<path d="${curveOf(projection, path)}" fill="none" stroke="${COLORS[levelOf(percent)]}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
  const ends = target && `x1="${x(now)}" y1="${y(percent)}" x2="${x(target.at)}" y2="${y(target.percent)}"`
  // Colored along its length by the usage it reaches, where it climbs at all.
  const stroke = target && target.percent > percent ? 'url(#projection)' : targetColor
  const gradient =
    target && target.percent > percent
      ? `<defs><linearGradient id="projection" gradientUnits="userSpaceOnUse" ${ends}>${projectionStops(percent, target.percent)}</linearGradient></defs>`
      : ''
  const projected = target
    ? `${gradient}<line ${ends} stroke="${stroke}" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round" opacity="0.8"/>` +
      `<circle cx="${x(target.at)}" cy="${y(target.percent)}" r="2.5" fill="${targetColor}"/>`
    : ''
  const current = `<g class="current">${usedLine}${projected}</g>`
  if (previous === undefined) return svgOf(`${limit}${reset}${current}`)

  // The whole drawing takes the pointer, not only its strokes.
  const hitArea = `<rect class="plot" width="${GRAPH_WIDTH}" height="${PLOT_HEIGHT}" fill="transparent"/>`
  const label =
    `<text class="label" x="${PAD}" y="${PLOT_HEIGHT + 7}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" ` +
    `font-size="11" fill="${TRACK.color}">${escaped(previousLabel)}</text>`

  return svgOf(
    `${HOVER_STYLE}${hitArea}${limit}${reset}${ghostLine(projection, previous, 'back', TRACK.opacity)}${current}` +
      `${ghostLine(projection, previous, 'front', 1)}${label}`,
  )
}
