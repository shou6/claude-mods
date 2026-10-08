import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const COMMAND = 'compact-tools'

// 全出力表示かどうかを、セッションをまたいで残すストアのキー
const STORE_KEY = 'isFull'

const isFull = atom({ plugin: 'compact-tools', key: 'isFull' } as const, false)

type Show = 'both' | 'first' | 'last'

// stdout の後ろに stderr をつなぎ、行に分ける
const linesOf = (output: unknown) => {
  const { stdout, stderr } = (output ?? {}) as { stdout?: unknown; stderr?: unknown }
  const text = [stdout, stderr]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .map(part => part.trim())
    .join('\n')

  return text === '' ? [] : text.split(/\r?\n/)
}

const pick = (lines: string[], show: Show) => {
  const first = lines[0]?.trim() ?? ''
  const last = lines[lines.length - 1]?.trim() ?? ''

  if (show === 'first') return first
  if (show === 'last') return last

  return lines.length === 1 ? first : `${first} … ${last}`
}

export const register: Register = (on, options) => {
  const show: Show = options.show === 'first' || options.show === 'last' ? options.show : 'both'
  const minLines = typeof options.minLines === 'number' ? options.minLines : 2
  const tools = String(options.tools ?? 'Bash,PowerShell')
    .split(',')
    .map(name => name.trim())
    .filter(name => name !== '')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'ツール出力の 1 行表示と全出力表示を切り替える',
    })

    // 前のセッションで選んだ表示を引き継ぐ
    const saved = await $.store.get(STORE_KEY)
    if (typeof saved === 'boolean') await update($, isFull, () => saved)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const full = await update($, isFull, now => !now)
    await $.store.set(STORE_KEY, full)

    return { text: full ? 'ツール出力: 全出力表示' : 'ツール出力: 1 行表示' }
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const isCompactable = e.surface === 'terminal' && !e.props.isErrored && tools.includes(e.props.tool)

    if (!isCompactable || (await read($, isFull))) {
      return next(e)
    }

    const lines = linesOf(e.props.output)

    // 短い出力は畳んでも読みやすくならない
    if (lines.length === 0 || lines.length < minLines) {
      return next(e)
    }

    const { Text } = $.ui.resolve(e)

    return (
      <Text dimColor wrap="truncate-end">
        {'  ⎿  '}
        {lines.length} 行 · {pick(lines, show)}
      </Text>
    )
  })
}
