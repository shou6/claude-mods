import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const COMMAND = 'compact-tools'
const SHELLS = ['Bash', 'PowerShell']

const isFull = atom({ plugin: 'compact-tools', key: 'isFull' } as const, false)

const linesOf = (output: unknown) => {
  const stdout = (output as { stdout?: unknown } | null)?.stdout

  return typeof stdout === 'string' ? stdout.trim().split(/\r?\n/) : []
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'ツール出力の 1 行表示と全出力表示を切り替える',
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const full = await update($, isFull, now => !now)

    return { text: full ? 'ツール出力: 全出力表示' : 'ツール出力: 1 行表示' }
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const isCompactable =
      e.surface === 'terminal' && !e.props.isErrored && SHELLS.includes(e.props.tool)

    if (!isCompactable || (await read($, isFull))) {
      return next(e)
    }

    const lines = linesOf(e.props.output)

    // 1 行以下なら畳んでも短くならない
    if (lines.length <= 1) {
      return next(e)
    }

    const { Text } = $.ui.resolve(e)

    return (
      <Text dimColor wrap="truncate-end">
        {'  ⎿  '}
        {lines.length} 行 · {lines[0]?.trim()}
      </Text>
    )
  })
}
