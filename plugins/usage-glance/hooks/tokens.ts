// Claude Desktop's own colors, sampled from its usage ring (bottom right of the
// composer) so the band reads as part of the app.
export const COLORS = {
  normal: '#257DE0',
  warn: '#FBB315',
  danger: '#DB3C3D',
} as const

// The ring is an image: it cannot read the app's theme. A translucent neutral
// track blends into either background: #474747 over the dark #191919 (the
// native track), a light #CECECE over white.
export const TRACK = { color: '#888888', opacity: 0.4 } as const

export type Level = 'normal' | 'warn' | 'danger'

// The terminal draws no SVG: the same meaning through the person's theme.
export const THEME_KEYS: Record<Level, 'suggestion' | 'warning' | 'error'> = {
  normal: 'suggestion',
  warn: 'warning',
  danger: 'error',
}

const WARN_FROM = 75
const DANGER_FROM = 90

export const levelOf = (percent: number): Level =>
  percent >= DANGER_FROM ? 'danger' : percent >= WARN_FROM ? 'warn' : 'normal'
