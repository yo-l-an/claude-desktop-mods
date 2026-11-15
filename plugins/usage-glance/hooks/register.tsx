import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register, Timer } from 'claude-code'

import type { PlanUsage, UsageSource, UsageWindow } from '../types'
import { formatOutcome } from './format'
import { GRAPH_HEIGHT, GRAPH_WIDTH, graphSvg } from './graph'
import { historyFrom, record } from './history'
import { layout } from './layout'
import { project } from './projection'
import { RING_SIZE, SPINNER_SIZE, ringGlyph, ringSvg, spinnerSvg } from './ring'
import { THEME_KEYS } from './tokens'
import { windowsFromCard, windowsFromRateLimits } from './usage'
import { wordsFor } from './words'

const plan = atom({ plugin: 'usage-glance', key: 'plan' } as const, null)
const now = atom({ plugin: 'usage-glance', key: 'now' } as const, 0)
const isSpinning = atom({ plugin: 'usage-glance', key: 'isSpinning' } as const, false)
const history = atom({ plugin: 'usage-glance', key: 'history' } as const, {})
// The readings outlive the session, so every session's popover draws the same curve.
const HISTORY_KEY = 'history'
// The popover is at least this wide, in cells, to hold the graph.
const POPOVER_MIN_CELLS = 18

const TICK_MS = 60_000
const REFRESH_EVERY_TICKS = 5
// How fresh a reading must be to skip a read: after a turn, and on a click or a session shown again.
const AFTER_TURN_MS = 30_000
const ON_DEMAND_MS = 1_500
// The spinner stays this long after a read, so a fast read is seen and a read
// starting meanwhile keeps the same spinner turning rather than a new one.
const SPINNER_LINGER_MS = 600

const SESSIONS_SERVER = 'ccd_session_mgmt'

let ticks = 0
let isStarted = false
let isReading = false
let hideSpinner: Timer | undefined

const textOf = (result: McpToolResult): string =>
  result.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')

async function readWindows($: EngineInterface): Promise<{ windows: UsageWindow[]; source: UsageSource }> {
  try {
    const result = await $.mcp.call(SESSIONS_SERVER, 'get_usage', {})
    if (result.isError) throw new Error(textOf(result))

    const windows = windowsFromCard(textOf(result))
    if (windows.length > 0) return { windows, source: 'card' }
  } catch {
    // The card is the desktop app's; the engine's reading follows.
  }

  const { rateLimits } = await $.session.usage()

  return { windows: windowsFromRateLimits(rateLimits), source: 'engine' }
}

// Reads the limits unless the last reading is younger than `maxAgeMs` or a read is under way.
// Only a read the person asked for, by clicking the band, shows the spinner.
async function refresh($: EngineInterface, maxAgeMs: number, isAsked = false): Promise<void> {
  if (isReading) return

  const at = await $.clock.now()
  const last = await read($, plan)
  if (last !== null && at - last.fetchedAt < maxAgeMs) return

  isReading = true
  if (isAsked) {
    hideSpinner?.cancel()
    await update($, isSpinning, () => true)
  }
  try {
    const { windows, source } = await readWindows($)
    const next: PlanUsage = { windows, fetchedAt: at }
    // Merged with what other sessions stored since: they all add to one history.
    const recorded = record(historyFrom(await $.store.get(HISTORY_KEY)), windows, at, source)

    await $.store.set(HISTORY_KEY, recorded)
    await update($, history, () => recorded)
    await update($, plan, () => next)
    await update($, now, () => at)
  } catch (error) {
    $.ui.log(`usage-glance: could not read the plan's usage (${String(error)})`)
  } finally {
    isReading = false
    if (isAsked) hideSpinner = $.clock.after(SPINNER_LINGER_MS, () => void update($, isSpinning, () => false))
  }
}

// The first read and the timer, once per load of this module. `session.start`
// runs it; a `/reload-plugins` reloads the module without that event, so the
// band's first draw schedules it then (a draw itself may not write state).
async function start($: EngineInterface): Promise<void> {
  if (isStarted) return

  isStarted = true
  $.clock.every(TICK_MS, () => tick($))
  await refresh($, 0)
}

async function tick($: EngineInterface): Promise<void> {
  ticks += 1
  if (ticks % REFRESH_EVERY_TICKS === 0) return refresh($, 0)

  const at = await $.clock.now()
  await update($, now, () => at)
}

export const register: Register = (on, options) => {
  const words = wordsFor(options.language)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await start($)

    return started
  })

  // After each turn, and when a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    await refresh($, AFTER_TURN_MS)

    return measured
  })

  // A surface joining the session, as when it is shown again.
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await refresh($, ON_DEMAND_MS)

    return attached
  })

  // A click on the band takes its focus ring. A failed read never holds the focus back.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    const focused = await next(e)
    await refresh($, ON_DEMAND_MS, true)

    return focused
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isStarted) $.clock.after(0, () => void start($))
    const current = await read($, plan)
    if (e.props.hasSurvey || current === null || current.windows.length === 0) return next(e)

    const at = Math.max(await read($, now), current.fetchedAt)
    const spinning = await read($, isSpinning)
    const items = layout(current.windows, at, words, e.props.bodyColumns)
    const readings = await read($, history)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // The terminal's table carries an Svg too, drawn as a raster: a glyph reads better there.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined

    return (
      <Box width="100%" flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={3} overflow="hidden">
        {items.map(item => {
          const lines = [
            { key: 'usage', label: words.usage, value: `${item.percent}%` },
            { key: 'reset', label: words.reset, value: item.reset },
          ]
          const window = current.windows.find(candidate => candidate.kind === item.kind)
          const projection = window && project(window, readings[item.kind], at)

          return (
            // Keyed: hovering anywhere on the limit opens its popover.
            <Box key={item.kind} flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={1} flexShrink={0}>
              {Svg ? (
                <Svg
                  source={ringSvg(item.percent, item.level)}
                  alt={`${item.label} · ${words.usage} ${item.percent}%`}
                  width={RING_SIZE}
                  height={RING_SIZE}
                />
              ) : (
                <Text color={THEME_KEYS[item.level]}>{ringGlyph(item.percent)}</Text>
              )}
              {item.isLabelShown && (
                <Text size="footnote" dimColor>
                  {item.label}
                </Text>
              )}
              <Text size="footnote" dimColor tabular>
                {item.percent}%
              </Text>
              <Text size="footnote" dimColor tabular>
                {item.detail}
              </Text>
              <Box
                position="absolute"
                top={0}
                left={0}
                width={Math.max(POPOVER_MIN_CELLS, ...lines.map(line => line.label.length + line.value.length + 2))}
                flexDirection="column"
                display="none"
                hover={{ display: 'flex' }}
              >
                <Text size="caption">
                  {item.label}
                </Text>
                {lines.map(line => (
                  <Box key={line.key} flexDirection="row" columnGap={1}>
                    <Text size="footnote" dimColor>
                      {line.label}
                    </Text>
                    <Text size="footnote" tabular>
                      {line.value}
                    </Text>
                  </Box>
                ))}
                {projection && (
                  <Box flexDirection="column" marginTop={1}>
                    {Svg && (
                      // Interactive when there is a ghost: the drawing's own hover lights it.
                      <Svg
                        source={graphSvg(projection, words.previous[item.kind])}
                        alt={words.graphAlt}
                        width={GRAPH_WIDTH}
                        height={GRAPH_HEIGHT}
                        {...(projection.previous && { isInteractive: true })}
                      />
                    )}
                    <Text size="footnote" dimColor>
                      {formatOutcome(item.kind, projection, words)}
                    </Text>
                  </Box>
                )}
              </Box>
            </Box>
          )
        })}
        {spinning && (
          // Out of the flow at the right edge, so it never pushes the line into a wrap.
          <Box key="spinner" position="absolute" top={0} bottom={0} right={0} alignItems="center" justifyContent="center">
            {Svg ? (
              <Svg source={spinnerSvg()} alt={words.refreshing} width={SPINNER_SIZE} height={SPINNER_SIZE} />
            ) : (
              <Text dimColor>⟳</Text>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
