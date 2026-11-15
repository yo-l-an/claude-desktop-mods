export type WindowKind = 'session' | 'week'

export type UsageWindow = {
  kind: WindowKind
  percentUsed: number
  // ISO time; absent while the window has not started (a session at 0%).
  resetsAt?: string
}

export type PlanUsage = { windows: UsageWindow[]; fetchedAt: number }

// The readings of one window, from its start to its reset.
export type Sample = { at: number; percent: number }
export type WindowReadings = { resetsAt: number; samples: Sample[] }
// The desktop app's usage card, or the engine's rate limits when there is no card:
// they count different limits, so one window's readings come from one of them.
export type UsageSource = 'card' | 'engine'
// The current window's readings, and the last window's until the next one starts.
export type WindowHistory = WindowReadings & { source: UsageSource; previous?: WindowReadings }
export type History = Partial<Record<WindowKind, WindowHistory>>

declare module 'claude-code' {
  interface PluginState {
    'usage-glance': { plan: PlanUsage | null; now: number; isSpinning: boolean; history: History }
  }
}
