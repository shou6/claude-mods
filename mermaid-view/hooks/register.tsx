import type { Color, Register } from 'claude-code'

import { createRenderer, splitMessage } from './diagram'
import type { Diagram, Role } from './diagram'
import { renderMermaidASCII } from './vendor/beautiful-mermaid.js'

// 色の役割ごとのテーマの色。テーマの名前で指定し、利用者のテーマに合わせる
const COLORS: Record<Role, Color | undefined> = {
  text: undefined,
  border: 'suggestion',
  line: 'inactive',
  arrow: 'suggestion',
}

// 返答の本文は行頭の記号の分だけ右に寄るので、その桁を幅から引く
const INDENT = 2

const draw = createRenderer(renderMermaidASCII)

export const register: Register = (on, options) => {
  const ascii = options.ascii === true

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)

    const parts = splitMessage(e.props.text)
    if (!parts.some(part => part.kind === 'mermaid')) return next(e)

    const columns = e.viewport ? Math.max(1, e.viewport.columns - INDENT) : undefined
    const drawn = parts.map(part => (part.kind === 'mermaid' ? draw(part.source, { ascii, columns }) : undefined))
    if (drawn.every(diagram => diagram === undefined)) return next(e)

    const { Box, Text, Markdown } = $.ui.resolve(e)

    const diagramView = (diagram: Diagram, index: number) => (
      <Box key={`mermaid-${index}`} flexDirection="column">
        {diagram.lines.map(line => (
          <Text wrap="truncate-end">
            {line.length === 0
              ? ' '
              : line.map(segment => {
                  const color = segment.role && COLORS[segment.role]

                  return color ? <Text color={color}>{segment.text}</Text> : segment.text
                })}
          </Text>
        ))}
        {diagram.cut > 0 && <Text dimColor>{`右端の ${diagram.cut} 桁を省略`}</Text>}
      </Box>
    )

    let diagramIndex = 0

    return (
      <Box flexDirection="column" gap={1}>
        {parts.map((part, i) => {
          const diagram = drawn[i]
          if (diagram) return diagramView(diagram, diagramIndex++)

          const text = part.kind === 'mermaid' ? part.raw : part.text
          if (text.trim() === '') return null

          return <Markdown text={text.replace(/^\n+|\n+$/g, '')} />
        })}
      </Box>
    )
  })
}
