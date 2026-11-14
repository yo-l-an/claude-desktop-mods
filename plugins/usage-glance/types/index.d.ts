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
export type WindowHistory = { resetsAt: number; samples: Sample[] }
export type History = Partial<Record<WindowKind, WindowHistory>>

declare module 'claude-code' {
  interface PluginState {
    'usage-glance': { plan: PlanUsage | null; now: number; isSpinning: boolean; history: History }
  }
}
