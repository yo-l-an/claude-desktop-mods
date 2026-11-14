import { COLORS, TRACK } from './tokens'
import type { Level } from './tokens'

// The native ring: 14px across, a 2px stroke, filled clockwise from the top.
export const RING_SIZE = 14
const STROKE = 2
const RADIUS = (RING_SIZE - STROKE) / 2
const CENTER = RING_SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const clampPercent = (percent: number): number => Math.min(100, Math.max(0, percent))

export const ringSvg = (percent: number, level: Level): string => {
  const filled = (clampPercent(percent) / 100) * CIRCUMFERENCE
  const circle = `cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none" stroke-width="${STROKE}"`
  const arc =
    filled > 0
      ? `<circle ${circle} stroke="${COLORS[level]}" stroke-linecap="round" ` +
        `stroke-dasharray="${filled.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}" ` +
        `transform="rotate(-90 ${CENTER} ${CENTER})"/>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RING_SIZE}" height="${RING_SIZE}" viewBox="0 0 ${RING_SIZE} ${RING_SIZE}">` +
    `<circle ${circle} stroke="${TRACK.color}" stroke-opacity="${TRACK.opacity}"/>${arc}</svg>`
  )
}

const GLYPHS = ['○', '◔', '◑', '◕', '●'] as const

export const ringGlyph = (percent: number): string =>
  GLYPHS[Math.round((clampPercent(percent) / 100) * (GLYPHS.length - 1))] ?? GLYPHS[0]
