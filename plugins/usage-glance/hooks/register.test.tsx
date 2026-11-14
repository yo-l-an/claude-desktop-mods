import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { PlanUsage } from '../types'
import { formatRemaining, formatResetAt } from './format'
import { layout } from './layout'
import { levelOf } from './tokens'
import { wordsFor } from './words'

const NOW = Date.parse('2026-11-14T12:00:00.000Z')
const SESSION_RESET = '2026-11-14T13:26:00.000Z'
const WEEK_RESET = '2026-11-20T04:00:00.000Z'
const EN = wordsFor('en')
const FR = wordsFor('fr')


const card = (status: string, windows: unknown[]) => ({
  value: {
    content: [{ type: 'text', text: JSON.stringify({ plan: { status, windows } }) }],
    isError: false,
  },
})

const engineReading = {
  value: {
    startedAt: NOW,
    context: { window: 1_000_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 12, resetsAt: SESSION_RESET },
      { kind: 'seven_day', percentUsed: 40, resetsAt: WEEK_RESET },
    ],
  },
}

// Starts a session and answers the plan the mod saved from what it read.
const startAndReadPlan = async ($: Engine, on: On): Promise<PlanUsage | undefined> => {
  let plan: PlanUsage | undefined
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('state.set', (_, e, next) => {
    if ('key' in e && e.key === 'plan') plan = e.value as PlanUsage
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  return plan
}

// Local time, as the machine running the tests sees it.
const pad = (value: number) => String(value).padStart(2, '0')
const clock = (iso: string) => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`

// Data

test("the desktop app's usage card gives the session and all-models week", async ($, on) => {
  // Arrange
  on('mcp.call', () =>
    card('ok', [
      { label: '5-hour limit', percentUsed: 77, resetsAt: SESSION_RESET },
      { label: 'Weekly · all models', percentUsed: 53, resetsAt: WEEK_RESET },
      { label: 'Weekly · Fable', percentUsed: 26, resetsAt: WEEK_RESET },
    ]),
  )
  on('session.usage', () => engineReading)

  // Act
  const plan = await startAndReadPlan($, on)

  // Assert
  expect(plan).toEqual({
    windows: [
      { kind: 'session', percentUsed: 77, resetsAt: SESSION_RESET },
      { kind: 'week', percentUsed: 53, resetsAt: WEEK_RESET },
    ],
    fetchedAt: NOW,
  })
})

test('without the usage card, the engine reading stands in', async ($, on) => {
  // Arrange
  on('mcp.call', () => ({ deny: 'no such server' }))
  on('session.usage', () => engineReading)

  // Act
  const plan = await startAndReadPlan($, on)

  // Assert
  expect(plan?.windows).toEqual([
    { kind: 'session', percentUsed: 12, resetsAt: SESSION_RESET },
    { kind: 'week', percentUsed: 40, resetsAt: WEEK_RESET },
  ])
})

test('a card that cannot read the plan also falls back to the engine', async ($, on) => {
  // Arrange
  on('mcp.call', () => card('unavailable', []))
  on('session.usage', () => engineReading)

  // Act
  const plan = await startAndReadPlan($, on)

  // Assert
  expect(plan?.windows).toHaveLength(2)
})

// Refresh triggers

// Starts a session on a clock the test moves, counting the usage card reads.
const startCounting = async ($: Engine, on: On) => {
  const clock = { at: NOW }
  const reads = { count: 0 }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: clock.at }))
  on('clock.every', () => ({ value: undefined }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('mcp.call', () => {
    reads.count += 1
    return card('ok', [{ label: '5-hour limit', percentUsed: 10, resetsAt: SESSION_RESET }])
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  return { clock, reads }
}

test('a session shown again reads the limits, at most once every 5 seconds', async ($, on) => {
  // Arrange
  const { clock, reads } = await startCounting($, on)

  // Act
  clock.at += 3_000
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:a' })
  const afterEarly = reads.count
  clock.at += 3_000
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:b' })

  // Assert: the start read, none 3 s later, one 6 s later.
  expect(afterEarly).toBe(1)
  expect(reads.count).toBe(2)
})

test('after a turn the limits are read again once 30 seconds have passed', async ($, on) => {
  // Arrange
  const { clock, reads } = await startCounting($, on)

  // Act
  clock.at += 10_000
  await $.session.measure({ changed: ['turn'] } as never)
  const afterEarly = reads.count
  clock.at += 25_000
  await $.session.measure({ changed: ['turn'] } as never)

  // Assert
  expect(afterEarly).toBe(1)
  expect(reads.count).toBe(2)
})

// Responsive

const WINDOWS = [
  { kind: 'session' as const, percentUsed: 77, resetsAt: SESSION_RESET },
  { kind: 'week' as const, percentUsed: 53, resetsAt: WEEK_RESET },
]

test('with room, the band shows labels and the whole reset', () => {
  // Act
  const [session, week] = layout(WINDOWS, NOW, EN, 120)

  // Assert
  expect(session?.isLabelShown).toBe(true)
  expect(session?.detail).toBe(`${clock(SESSION_RESET)} (1h26)`)
  expect(week?.detail).toBe(week?.reset)
})

test('short of room, the band keeps only the countdown', () => {
  // Act
  const [session, week] = layout(WINDOWS, NOW, EN, 45)

  // Assert
  expect(session?.isLabelShown).toBe(true)
  expect(session?.detail).toBe('1h26')
  expect(week?.detail).toBe('5d 16h')
  expect(session?.reset).toBe(`${clock(SESSION_RESET)} (1h26)`)
})

test('narrower still, the labels go too', () => {
  // Act
  const items = layout(WINDOWS, NOW, EN, 30)

  // Assert
  expect(items.map(item => item.isLabelShown)).toEqual([false, false])
  expect(items.map(item => item.detail)).toEqual(['1h26', '5d 16h'])
})

test('a session that has not started has no reset', () => {
  // Act
  const [session] = layout([{ kind: 'session', percentUsed: 0 }], NOW, EN, 120)

  // Assert
  expect(session?.detail).toBe('not started')
  expect(session?.reset).toBe('not started')
})

// Formatting and levels

test('resets read as a clock for the session and a weekday for the week', () => {
  const at = Date.parse(WEEK_RESET)
  const weekday = new Date(at).getDay()

  expect(formatResetAt('session', Date.parse(SESSION_RESET), EN)).toBe(clock(SESSION_RESET))
  expect(formatResetAt('week', at, EN)).toBe(`${EN.weekdays[weekday]} ${clock(WEEK_RESET)}`)
  expect(formatResetAt('week', at, FR)).toBe(`${FR.weekdays[weekday]} ${clock(WEEK_RESET)}`)
})

test('countdowns', () => {
  expect(formatRemaining(0, EN)).toBe('now')
  expect(formatRemaining(30_000, EN)).toBe('1m')
  expect(formatRemaining(86 * 60_000, EN)).toBe('1h26')
  expect(formatRemaining((5 * 24 + 16) * 3_600_000, EN)).toBe('5d 16h')
  expect(formatRemaining((5 * 24 + 16) * 3_600_000, FR)).toBe('5j 16h')
})

test('levels follow the app: yellow from 70%, red from 90%', () => {
  expect(levelOf(69)).toBe('normal')
  expect(levelOf(70)).toBe('warn')
  expect(levelOf(89)).toBe('warn')
  expect(levelOf(90)).toBe('danger')
})
