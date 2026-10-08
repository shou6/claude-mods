import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

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

type Fold = { tools: string[]; minLines: number }

// 畳むときは出力の行を返す。畳まないときは undefined
async function foldable(
  $: EngineInterface,
  surface: string,
  props: { tool: string; output?: unknown; isErrored: boolean },
  fold: Fold,
) {
  const isCompactable = surface === 'terminal' && !props.isErrored && fold.tools.includes(props.tool)
  if (!isCompactable || (await read($, isFull))) return undefined

  const lines = linesOf(props.output)

  // 短い出力は畳んでも読みやすくならない
  return lines.length === 0 || lines.length < fold.minLines ? undefined : lines
}

export const register: Register = (on, options) => {
  const show: Show = options.show === 'first' || options.show === 'last' ? options.show : 'both'
  const minLines = typeof options.minLines === 'number' ? options.minLines : 2
  const tools = String(options.tools ?? 'Bash,PowerShell')
    .split(',')
    .map(name => name.trim())
    .filter(name => name !== '')
  const fold: Fold = { tools, minLines }

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

  // fullscreen でまとめられた呼び出しを開くと、出力は ToolUse の行が描く。出力だけを 1 行に書き換えて渡す
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.isRunning) return next(e)

    const lines = await foldable($, e.surface, e.props, fold)
    if (lines === undefined) return next(e)

    const output = { ...(e.props.output as object), stdout: `${lines.length} 行 · ${pick(lines, show)}`, stderr: '' }

    return next({ ...e, props: { ...e.props, output } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const lines = await foldable($, e.surface, e.props, fold)
    if (lines === undefined) return next(e)

    const { Text } = $.ui.resolve(e)

    return (
      <Text dimColor wrap="truncate-end">
        {'  ⎿  '}
        {lines.length} 行 · {pick(lines, show)}
      </Text>
    )
  })
}
