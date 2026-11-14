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

// A quarter arc turning while the band refreshes, in the track's gray.
export const SPINNER_SIZE = 12
const SPINNER_STROKE = 1.5
const SPINNER_RADIUS = (SPINNER_SIZE - SPINNER_STROKE) / 2
const SPINNER_CENTER = SPINNER_SIZE / 2

export const spinnerSvg = (): string => {
  const quarter = ((2 * Math.PI * SPINNER_RADIUS) / 4).toFixed(2)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SPINNER_SIZE}" height="${SPINNER_SIZE}" viewBox="0 0 ${SPINNER_SIZE} ${SPINNER_SIZE}">` +
    `<circle cx="${SPINNER_CENTER}" cy="${SPINNER_CENTER}" r="${SPINNER_RADIUS}" fill="none" ` +
    `stroke="${TRACK.color}" stroke-width="${SPINNER_STROKE}" stroke-linecap="round" stroke-dasharray="${quarter} 100">` +
    `<animateTransform attributeName="transform" type="rotate" from="0 ${SPINNER_CENTER} ${SPINNER_CENTER}" ` +
    `to="360 ${SPINNER_CENTER} ${SPINNER_CENTER}" dur="0.5s" repeatCount="indefinite"/></circle></svg>`
  )
}
