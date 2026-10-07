export type Usage = {
  percent: number | null
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
}

export type Meta = {
  model: string
}

declare module 'claude-code' {
  interface PluginState {
    'status-band': { usage: Usage | null; meta: Meta | null }
  }
}
