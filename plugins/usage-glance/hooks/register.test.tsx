import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { formatRemaining } from './format'
import { ringGlyph, ringSvg } from './ring'
import { levelOf } from './tokens'
import { wordsFor } from './words'

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

const pad = (value: number) => String(value).padStart(2, '0')
// Local time, as the machine running the tests sees it.
const clock = (iso: string) => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`
const day = (iso: string, days: readonly string[]) => days[new Date(iso).getDay()]
const EN_DAYS = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'] as const
const FR_DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const
const SESSION_RESET = PLAN[0]!.resetsAt
const WEEK_RESET = PLAN[1]!.resetsAt
const SESSION_FULL = `${clock(SESSION_RESET)} (1h26)`
const WEEK_FULL = `${day(WEEK_RESET, EN_DAYS)} ${clock(WEEK_RESET)} (5d 16h)`

const exactly = (text: string) => ({ type: 'Text' as const, text: new RegExp(`^${text.replace(/[.()]/g, '\\$&')}$`) })

const withColumns = (bodyColumns: number) => ({
  ...BAND,
  props: { ...BAND.props, bodyColumns },
  surface: 'desktop' as const,
})

test('with room, each limit shows its reset time and the countdown', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount(withColumns(120))

  // Assert
  expect((await ui.find(exactly('Session')))?.text).toBe('Session')
  expect((await ui.find(exactly('77%')))?.text).toBe('77%')
  expect((await ui.find(exactly(SESSION_FULL)))?.text).toBe(SESSION_FULL)
  expect((await ui.find(exactly('53%')))?.text).toBe('53%')
  expect((await ui.find(exactly(WEEK_FULL)))?.text).toBe(WEEK_FULL)
  expect(await ui.find({ type: 'Text', text: /26%/ })).toBeUndefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('every limit carries a popover with its usage and reset', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount(withColumns(120))

  // Assert: the labels once per popover, each value in the band and in its popover.
  expect(await ui.findAll(exactly('Session'))).toHaveLength(2)
  expect(await ui.findAll(exactly('Usage:'))).toHaveLength(2)
  expect(await ui.findAll(exactly('Reset:'))).toHaveLength(2)
  expect(await ui.findAll(exactly('77%'))).toHaveLength(2)
  expect(await ui.findAll(exactly(SESSION_FULL))).toHaveLength(2)
  await ui.unmount()
})

test('short of room, the band keeps the countdown and the popover the whole reset', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount(withColumns(45))

  // Assert
  expect((await ui.find(exactly('1h26')))?.text).toBe('1h26')
  expect(await ui.findAll(exactly(SESSION_FULL))).toHaveLength(1)
  await ui.unmount()
})

test('narrower still, the band drops the labels and the popover keeps them', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card(PLAN))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount(withColumns(30))

  // Assert
  expect(await ui.findAll(exactly('Session'))).toHaveLength(1)
  expect((await ui.find(exactly('77%')))?.text).toBe('77%')
  expect((await ui.find(exactly('5d 16h')))?.text).toBe('5d 16h')
  await ui.unmount()
})

test('a session that has not started says so', UI_TEST, async ($, on) => {
  // Arrange
  on('mcp.call', () => card([{ label: '5-hour limit', percentUsed: 0 }, PLAN[1]]))
  await start($, on, 'desktop')

  // Act
  const ui = await $.ui.mount(withColumns(120))

  // Assert
  expect((await ui.find(exactly('0%')))?.text).toBe('0%')
  expect(await ui.findAll(exactly('not started'))).toHaveLength(2)
  await ui.unmount()
})

test('the band speaks French when asked', { ...UI_TEST, options: { language: 'fr' } }, async ($, on) => {
  // Arrange
  on('mcp.call', () => card([{ label: '5-hour limit', percentUsed: 0 }, PLAN[1]]))
  await start($, on, 'desktop')
  const weekFull = `${day(WEEK_RESET, FR_DAYS)} ${clock(WEEK_RESET)} (5j 16h)`

  // Act
  const ui = await $.ui.mount(withColumns(120))

  // Assert
  expect((await ui.find(exactly('Semaine')))?.text).toBe('Semaine')
  expect((await ui.find(exactly('non démarrée')))?.text).toBe('non démarrée')
  expect((await ui.find(exactly(weekFull)))?.text).toBe(weekFull)
  expect((await ui.find(exactly('Utilisation :')))?.text).toBe('Utilisation :')
  expect((await ui.find(exactly('Réinitialisation :')))?.text).toBe('Réinitialisation :')
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
  const sessionFull = `${clock('2026-11-14T12:16:00.000Z')} (16m)`

  // Act
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // Assert
  expect((await ui.find(exactly('●')))?.text).toBe('●')
  expect((await ui.find(exactly('96%')))?.text).toBe('96%')
  expect((await ui.find(exactly(sessionFull)))?.text).toBe(sessionFull)
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

const EN = wordsFor('en')

test('levels, glyphs, ring arcs and countdowns', () => {
  expect(levelOf(69)).toBe('normal')
  expect(levelOf(70)).toBe('warn')
  expect(levelOf(90)).toBe('danger')
  expect(ringGlyph(0)).toBe('○')
  expect(ringGlyph(50)).toBe('◑')
  expect(ringSvg(0, 'normal')).not.toContain('stroke-dasharray')
  expect(ringSvg(0, 'normal')).toContain('stroke-opacity="0.41"')
  expect(ringSvg(80, 'warn')).toContain('#FBB315')
  expect(ringSvg(99, 'danger')).toContain('#DB3C3D')
  expect(formatRemaining(0, EN)).toBe('now')
  expect(formatRemaining(30_000, EN)).toBe('1m')
  expect(formatRemaining(86 * 60_000, EN)).toBe('1h26')
})
