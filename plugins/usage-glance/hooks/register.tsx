import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register } from 'claude-code'

import type { PlanUsage, UsageWindow } from '../types'
import { formatRemaining } from './format'
import { RING_SIZE, ringGlyph, ringSvg } from './ring'
import { THEME_KEYS, levelOf } from './tokens'
import { windowsFromCard, windowsFromRateLimits } from './usage'

const plan = atom({ plugin: 'usage-glance', key: 'plan' } as const, null)
const now = atom({ plugin: 'usage-glance', key: 'now' } as const, 0)

const TICK_MS = 60_000
const REFRESH_EVERY_TICKS = 5
const MIN_REFRESH_MS = 30_000
// Under this width the labels go and only ring, percent and countdown stay.
const COMPACT_BELOW_COLUMNS = 56

const LABELS = { session: 'Session', week: 'Week' } as const

const SESSIONS_SERVER = 'ccd_session_mgmt'

let ticks = 0

const textOf = (result: McpToolResult): string =>
  result.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')

async function readWindows($: EngineInterface): Promise<UsageWindow[]> {
  try {
    const result = await $.mcp.call(SESSIONS_SERVER, 'get_usage', {})
    if (result.isError) throw new Error(textOf(result))

    const windows = windowsFromCard(textOf(result))
    if (windows.length > 0) return windows
  } catch {
    // The card is the desktop app's; the engine's reading follows.
  }

  const { rateLimits } = await $.session.usage()

  return windowsFromRateLimits(rateLimits)
}

async function refresh($: EngineInterface, isForced: boolean): Promise<void> {
  const at = await $.clock.now()
  const last = await read($, plan)
  if (!isForced && last !== null && at - last.fetchedAt < MIN_REFRESH_MS) return

  try {
    const next: PlanUsage = { windows: await readWindows($), fetchedAt: at }

    await update($, plan, () => next)
    await update($, now, () => at)
  } catch (error) {
    $.ui.log(`usage-glance: could not read the plan's usage (${String(error)})`)
  }
}

async function tick($: EngineInterface): Promise<void> {
  ticks += 1
  if (ticks % REFRESH_EVERY_TICKS === 0) return refresh($, true)

  const at = await $.clock.now()
  await update($, now, () => at)
}

const remainingText = (window: UsageWindow, at: number): string | undefined =>
  window.resetsAt === undefined ? undefined : formatRemaining(Date.parse(window.resetsAt) - at)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await refresh($, true)
    $.clock.every(TICK_MS, () => tick($))

    return started
  })

  // After each turn, and when a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    await refresh($, false)

    return measured
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, plan)
    if (e.props.hasSurvey || current === null || current.windows.length === 0) return next(e)

    const at = Math.max(await read($, now), current.fetchedAt)
    const isCompact = e.props.bodyColumns < COMPACT_BELOW_COLUMNS
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // The terminal's table carries an Svg too, drawn as a raster: a glyph reads better there.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined

    return (
      <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={3} overflow="hidden">
        {current.windows.map(window => {
          const percent = Math.round(window.percentUsed)
          const level = levelOf(percent)
          const remaining = remainingText(window, at)
          const label = LABELS[window.kind]

          return (
            <Box key={window.kind} flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={1} flexShrink={0}>
              {Svg ? (
                <Svg
                  source={ringSvg(percent, level)}
                  alt={`${label}: ${percent}% used`}
                  width={RING_SIZE}
                  height={RING_SIZE}
                />
              ) : (
                <Text color={THEME_KEYS[level]}>{ringGlyph(percent)}</Text>
              )}
              {!isCompact && (
                <Text size="footnote" dimColor>
                  {label}
                </Text>
              )}
              <Text size="footnote" weight="medium" tabular>
                {percent}%
              </Text>
              {remaining !== undefined && (
                <Text size="footnote" dimColor tabular wrap="truncate">
                  {remaining}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
