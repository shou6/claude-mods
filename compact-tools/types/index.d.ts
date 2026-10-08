export type IsFull = boolean

declare module 'claude-code' {
  interface PluginState {
    'compact-tools': { isFull: IsFull }
  }
}
