export type Part = { kind: 'markdown'; text: string } | { kind: 'mermaid'; source: string; raw: string }
export type Role = 'text' | 'border' | 'line' | 'arrow'
export type Segment = { text: string; role?: Role }
export type Diagram = { lines: Segment[][]; cut: number }
export type RenderFn = (source: string, options: { useAscii?: boolean }) => string

export const splitMessage = (_text: string): Part[] => []
export const displayWidth = (_text: string): number => 0
export const prepare = (source: string): { source: string; alt?: string } => ({ source })
export const createRenderer =
  (_render: RenderFn) =>
  (_source: string, _options: { ascii: boolean; columns?: number }): Diagram | undefined =>
    undefined
