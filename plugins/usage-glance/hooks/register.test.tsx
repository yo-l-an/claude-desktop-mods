import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { formatRemaining } from './format'
import { ringGlyph, ringSvg } from './ring'
import { levelOf } from './tokens'

const NOW = Date.parse('2026-11-14T12:00:00.000Z')

// Mounting runs the engine; a busy machine needs more than the default 5 s.
const UI_TEST = { timeoutMs: 20_000 }

const BAND = {
  plugin: 'usage-glance',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const card = (windows: unknown[]) => ({
  value: {
    content: [{ type: 'text', text: JSON.stringify({ plan: { status: 'ok', windows } }) }],
    isError: false,
  },
})

const PLAN = [
  { label: '5-hour limit', percentUsed: 77, resetsAt: '2026-11-14T13:26:00.000Z' },
  { label: 'Weekly · all models', percentUsed: 53, resetsAt: '2026-11-20T04:00:00.000Z' },
  { label: 'Weekly · Fable', percentUsed: 26, resetsAt: '2026-11-20T04:00:00.000Z' },
]

const start = async ($: Engine, on: On, surface: 'desktop' | 'terminal') => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface, isInteractive: true })
}

test('the desktop band draws one ring per limit with its percent and countdown', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^Session$/ }))?.text).toBe('Session')
  expect((await ui.find({ type: 'Text', text: /^77%$/ }))?.text).toBe('77%')
  expect((await ui.find({ type: 'Text', text: /^1h26$/ }))?.text).toBe('1h26')
  expect((await ui.find({ type: 'Text', text: /^53%$/ }))?.text).toBe('53%')
  expect((await ui.find({ type: 'Text', text: /^5d 16h$/ }))?.text).toBe('5d 16h')
  expect(await ui.find({ type: 'Text', text: /26%/ })).toBeUndefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('a narrow band drops the labels and keeps the numbers', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 }, surface: 'desktop' })

  // Assert
  expect(await ui.find({ type: 'Text', text: /^Session$/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^77%$/ }))?.text).toBe('77%')
  await ui.unmount()
})

test('a session that has not started shows no countdown', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card([{ label: '5-hour limit', percentUsed: 0 }, PLAN[1]]))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^0%$/ }))?.text).toBe('0%')
  expect((await ui.find({ type: 'Text', text: /^5d 16h$/ }))?.text).toBe('5d 16h')
  await ui.unmount()
})

test('the terminal draws the ring as a glyph from the engine reading', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => ({ deny: 'no such server' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 96, resetsAt: '2026-11-14T12:16:00.000Z' }],
    },
  }))
  await start($, on, 'terminal')

  // Act
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^●$/ }))?.text).toBe('●')
  expect((await ui.find({ type: 'Text', text: /^96%$/ }))?.text).toBe('96%')
  expect((await ui.find({ type: 'Text', text: /^16m$/ }))?.text).toBe('16m')
  await ui.unmount()
})

test('the band stays out of a survey', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })

  // Assert
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('levels, glyphs, ring arcs and countdowns', () => {
  expect(levelOf(10)).toBe('normal')
  expect(levelOf(75)).toBe('warn')
  expect(levelOf(95)).toBe('danger')
  expect(ringGlyph(0)).toBe('○')
  expect(ringGlyph(50)).toBe('◑')
  expect(ringSvg(0, 'normal')).not.toContain('stroke-dasharray')
  expect(ringSvg(0, 'normal')).toContain('stroke-opacity="0.41"')
  expect(ringSvg(80, 'warn')).toContain('#FBB315')
  expect(ringSvg(99, 'danger')).toContain('#DB3C3D')
  expect(formatRemaining(0)).toBe('now')
  expect(formatRemaining(30_000)).toBe('1m')
  expect(formatRemaining(86 * 60_000)).toBe('1h26')
})
