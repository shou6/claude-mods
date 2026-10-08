import type { Summary } from '../hooks/prs'

declare module 'claude-code' {
  interface PluginState {
    'pr-watch': { summary: Summary | null }
  }
}
