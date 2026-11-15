import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { PlanUsage } from '../types'
import { formatOutcome, formatRemaining, formatResetAt } from './format'
import { historyFrom, record } from './history'
import { project } from './projection'
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
  mock.store(on)
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

test('after a /reload-plugins, with no session start, the band still reads the limits', { timeoutMs: 20_000 }, async ($, on) => {
  // Arrange: a reload draws the band without raising session.start.
  mock.store(on)
  const clock = mock.clock(on, { now: NOW })
  on('mcp.call', () => card('ok', [{ label: '5-hour limit', percentUsed: 60, resetsAt: SESSION_RESET }]))
  const ui = await $.ui.mount({
    plugin: 'usage-glance',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 120,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  })

  // Act: the read the first draw scheduled runs.
  await clock.advance(0)

  // Assert
  expect((await ui.find({ type: 'Text', text: /^60%$/ }))?.text).toBe('60%')
  await ui.unmount()
})

// Starts a session on a clock the test moves, counting the usage card reads.
const startCounting = async ($: Engine, on: On) => {
  const clock = { at: NOW }
  const reads = { count: 0 }
  mock.store(on)
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

test('a session shown again reads the limits, at most once every 1.5 seconds', async ($, on) => {
  // Arrange
  const { clock, reads } = await startCounting($, on)

  // Act
  clock.at += 1_000
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:a' })
  const afterEarly = reads.count
  clock.at += 1_000
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:b' })

  // Assert: the start read, none 1 s later, one 2 s later.
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

test('each read adds to the history kept across sessions', async ($, on) => {
  // Arrange
  let stored: unknown
  on('state.set', (_, e, next) => {
    if ('key' in e && e.key === 'history') stored = e.value
    return next(e)
  })
  const { clock } = await startCounting($, on)

  // Act
  clock.at += 30 * 60_000
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:a' })

  // Assert
  expect(historyFrom(stored).session?.samples).toHaveLength(2)
})

// History

const HOUR = 3_600_000
const sessionAt = (percent: number) => [{ kind: 'session' as const, percentUsed: percent, resetsAt: SESSION_RESET }]

test('the history keeps a reading per window and starts over at a new reset', () => {
  // Act
  const first = record({}, sessionAt(10), NOW, 'card')
  const later = record(first, sessionAt(20), NOW + 10 * 60_000, 'card')
  const close = record(later, sessionAt(21), NOW + 10 * 60_000 + 5_000, 'card')
  const renewed = record(close, [{ kind: 'session', percentUsed: 1, resetsAt: '2026-11-14T18:26:00.000Z' }], NOW + 2 * HOUR, 'card')

  // Assert
  expect(later.session?.samples.map(sample => sample.percent)).toEqual([10, 20])
  expect(close.session?.samples.map(sample => sample.percent)).toEqual([10, 21])
  expect(renewed.session?.samples.map(sample => sample.percent)).toEqual([1])
  expect(renewed.session?.previous?.samples.map(sample => sample.percent)).toEqual([10, 21])
})

test('only the window that ended last is kept as the previous', () => {
  // Act
  const first = record({}, sessionAt(30), NOW, 'card')
  const second = record(first, [{ kind: 'session', percentUsed: 5, resetsAt: '2026-11-14T18:26:00.000Z' }], NOW + 6 * HOUR, 'card')
  const third = record(second, [{ kind: 'session', percentUsed: 2, resetsAt: '2026-11-14T23:26:00.000Z' }], NOW + 11 * HOUR, 'card')

  // Assert
  expect(third.session?.previous?.samples.map(sample => sample.percent)).toEqual([5])
  expect(historyFrom(JSON.parse(JSON.stringify(third)))).toEqual(third)
})

test('a stored history of the wrong shape is dropped', () => {
  expect(historyFrom('nope')).toEqual({})
  expect(historyFrom({ session: { resetsAt: 'x', samples: [] } })).toEqual({})
  expect(historyFrom({ week: { resetsAt: 1, source: 'card', samples: [{ at: 1, percent: 2 }, { at: 'bad' }] } })).toEqual({
    week: { resetsAt: 1, source: 'card', samples: [{ at: 1, percent: 2 }] },
  })
  // Kept before readings had a source, it may mix the card's and the engine's limits.
  expect(historyFrom({ week: { resetsAt: 1, samples: [{ at: 1, percent: 2 }] } })).toEqual({})
})

test('a reset time that drifts within a window is not a new window', () => {
  // Act: the same session read with its reset 10 minutes off.
  const first = record({}, sessionAt(10), NOW, 'card')
  const drifted = record(first, [{ kind: 'session', percentUsed: 25, resetsAt: '2026-11-14T13:36:00.000Z' }], NOW + 10 * 60_000, 'card')

  // Assert
  expect(drifted.session?.samples.map(sample => sample.percent)).toEqual([10, 25])
  expect(drifted.session?.previous).toBeUndefined()
})

test("the engine's readings stay out of a history the card keeps", () => {
  // Arrange: the engine counts another weekly limit, with its own reset.
  const fromCard = record({}, sessionAt(40), NOW, 'card')
  const engineWindows = [{ kind: 'session' as const, percentUsed: 2, resetsAt: '2026-11-14T18:00:00.000Z' }]

  // Act
  const withEngine = record(fromCard, engineWindows, NOW + HOUR, 'engine')
  const engineFirst = record(record({}, engineWindows, NOW, 'engine'), sessionAt(40), NOW + HOUR, 'card')

  // Assert: the card's readings start over a history the engine began, with no ghost.
  expect(withEngine).toEqual(fromCard)
  expect(engineFirst.session).toEqual({ resetsAt: Date.parse(SESSION_RESET), source: 'card', samples: [{ at: NOW + HOUR, percent: 40 }] })
})

// Projection: the session window runs from 08:26 to 13:26 UTC.

const SESSION_START = Date.parse(SESSION_RESET) - 5 * HOUR
const sessionWindow = (percent: number) => ({ kind: 'session' as const, percentUsed: percent, resetsAt: SESSION_RESET })

test('at a fast pace the projection says when the limit is reached', () => {
  // Arrange: 60% used 2.5 hours in, so 24% an hour.
  const at = SESSION_START + 2.5 * HOUR

  // Act
  const projection = project(sessionWindow(60), undefined, at)

  // Assert: the remaining 40% takes 1h40, 50 minutes before the reset.
  const hitsAt = at + (100 / 60) * HOUR
  expect(projection?.outcome).toEqual({ kind: 'hits', at: hitsAt })
  expect(formatOutcome('session', projection!, EN)).toBe(
    `Limit hit around ${clock(new Date(hitsAt).toISOString())}, 50m before reset.`,
  )
})

test('at a slow pace the projection says how much is used by the reset', () => {
  // Act: 20% used 2.5 hours in carries to 40% at the reset.
  const projection = project(sessionWindow(20), undefined, SESSION_START + 2.5 * HOUR)

  // Assert
  expect(projection?.outcome).toEqual({ kind: 'lasts', percent: 40 })
  expect(formatOutcome('session', projection!, EN)).toBe('About 40% used by reset.')
})

// 40% used 2.5 hours in: 16% an hour on average, so 80% by the reset without readings.
const readingAt = (hours: number, percent: number) => ({
  resetsAt: Date.parse(SESSION_RESET),
  source: 'card' as const,
  samples: [{ at: SESSION_START + hours * HOUR, percent }],
})

test('a burst in the last hour brings the limit forward', () => {
  // Act: 30% of the 40% went in the last hour.
  const projection = project(sessionWindow(40), readingAt(1.5, 10), SESSION_START + 2.5 * HOUR)

  // Assert: 0.6 × 30 + 0.4 × 16 = 24.4% an hour, the remaining 60% in about 2h28.
  expect(project(sessionWindow(40), undefined, SESSION_START + 2.5 * HOUR)?.outcome).toEqual({ kind: 'lasts', percent: 80 })
  expect(projection?.outcome.kind).toBe('hits')
  if (projection?.outcome.kind === 'hits') {
    expect(Math.round((projection.outcome.at - SESSION_START) / 60_000)).toBe(Math.round(150 + (60 / 24.4) * 60))
  }
})

test('a pause in the last hour pushes the limit back', () => {
  // Act: nothing used in the last hour, so 0.6 × 0 + 0.4 × 16 = 6.4% an hour.
  const projection = project(sessionWindow(40), readingAt(1.5, 40), SESSION_START + 2.5 * HOUR)

  // Assert
  expect(projection?.outcome).toEqual({ kind: 'lasts', percent: 56 })
})

// The last session ran the day before; only its readings matter, shifted onto this one.
const withPrevious = (previous: [number, number][]) => ({
  resetsAt: Date.parse(SESSION_RESET),
  source: 'card' as const,
  samples: [],
  previous: {
    resetsAt: Date.parse(SESSION_RESET) - 24 * HOUR,
    samples: previous.map(([hours, percent]) => ({ at: SESSION_START - 24 * HOUR + hours * HOUR, percent })),
  },
})

test('a last session that kept going raises the projection', () => {
  // Act: it went from 20% to 80% over the 2.5 hours still to come, 24% an hour,
  // so 0.45 × 16 + 0.25 × 16 + 0.3 × 24 = 18.4% an hour.
  const projection = project(sessionWindow(40), withPrevious([[2.5, 20], [5, 80]]), SESSION_START + 2.5 * HOUR)

  // Assert
  expect(projection?.outcome).toEqual({ kind: 'lasts', percent: 86 })
  expect(projection?.previous?.map(sample => sample.percent)).toEqual([0, 20, 80])
  expect(projection?.previous?.[1]?.at).toBe(SESSION_START + 2.5 * HOUR)
})

test('a last session that stopped here lowers the projection', () => {
  // Act: nothing used after this point, so 0.7 × 16 = 11.2% an hour.
  const projection = project(sessionWindow(40), withPrevious([[2.5, 20], [4, 20]]), SESSION_START + 2.5 * HOUR)

  // Assert
  expect(projection?.outcome).toEqual({ kind: 'lasts', percent: 68 })
})

test('too early in a window, or at the limit, there is no pace to carry on', () => {
  expect(project(sessionWindow(5), undefined, SESSION_START + 5 * 60_000)?.outcome).toEqual({ kind: 'early' })
  expect(project(sessionWindow(100), undefined, SESSION_START + HOUR)?.outcome).toEqual({ kind: 'reached' })
  expect(project({ kind: 'session', percentUsed: 0 }, undefined, NOW)).toBeUndefined()
})

test('the projected path runs from the window start through the readings to now', () => {
  // Arrange
  const at = SESSION_START + 2 * HOUR
  const history = { resetsAt: Date.parse(SESSION_RESET), source: 'card' as const, samples: [{ at: SESSION_START - HOUR, percent: 90 }, { at: SESSION_START + HOUR, percent: 30 }] }

  // Act
  const projection = project(sessionWindow(50), history, at)

  // Assert: the reading from before the window is left out.
  expect(projection?.path).toEqual([
    { at: SESSION_START, percent: 0 },
    { at: SESSION_START + HOUR, percent: 30 },
    { at, percent: 50 },
  ])
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

test('levels follow the app: yellow from 75%, red from 90%', () => {
  expect(levelOf(74)).toBe('normal')
  expect(levelOf(75)).toBe('warn')
  expect(levelOf(89)).toBe('warn')
  expect(levelOf(90)).toBe('danger')
})
