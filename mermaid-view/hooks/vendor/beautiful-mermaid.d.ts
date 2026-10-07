// 同梱した beautiful-mermaid のうち、この Mod が使う部分の型
export type AsciiTheme = {
  fg: string
  border: string
  line: string
  arrow: string
  corner?: string
  junction?: string
}

export type AsciiRenderOptions = {
  useAscii?: boolean
  colorMode?: 'none' | 'html'
  theme?: Partial<AsciiTheme>
}

export declare function renderMermaidASCII(text: string, options?: AsciiRenderOptions): string
