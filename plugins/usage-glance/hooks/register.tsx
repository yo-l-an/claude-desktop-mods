import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register } from 'claude-code'

import type { PlanUsage, UsageWindow } from '../types'
import { layout } from './layout'
import { RING_SIZE, ringGlyph, ringSvg } from './ring'
import { THEME_KEYS } from './tokens'
import { windowsFromCard, windowsFromRateLimits } from './usage'
import { wordsFor } from './words'

const plan = atom({ plugin: 'usage-glance', key: 'plan' } as const, null)
const now = atom({ plugin: 'usage-glance', key: 'now' } as const, 0)

const TICK_MS = 60_000
const REFRESH_EVERY_TICKS = 5
const MIN_REFRESH_MS = 30_000

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

export const register: Register = (on, options) => {
  const words = wordsFor(options.language)

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
    const items = layout(current.windows, at, words, e.props.bodyColumns)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // The terminal's table carries an Svg too, drawn as a raster: a glyph reads better there.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined

    return (
      <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={3} overflow="hidden">
        {items.map(item => {
          const lines = [
            { key: 'usage', label: words.usage, value: `${item.percent}%` },
            { key: 'reset', label: words.reset, value: item.reset },
          ]

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
                width={Math.max(...lines.map(line => line.label.length + line.value.length)) + 2}
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
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
