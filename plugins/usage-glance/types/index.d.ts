export type WindowKind = 'session' | 'week'

export type UsageWindow = {
  kind: WindowKind
  percentUsed: number
  // ISO time; absent while the window has not started (a session at 0%).
  resetsAt?: string
}

export type PlanUsage = { windows: UsageWindow[]; fetchedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-glance': { plan: PlanUsage | null; now: number }
  }
}
