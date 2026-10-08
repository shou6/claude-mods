import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// プラグインの下でエンジンの代わりに答える。ToolUse の行は受け取った出力をそのまま描く
const engine = (on: On, store: Record<string, unknown> = {}) => {
  const entries = new Map(Object.entries(store))
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, e.value)

    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const output = (e.props as { output?: { stdout?: string; stderr?: string } }).output

    return <Text>{`ENGINE stdout=${JSON.stringify(output?.stdout)} stderr=${JSON.stringify(output?.stderr)}`}</Text>
  })
}

const OUTPUT = { stdout: '\nPASS a.test.ts\nTests: 3 passed\nDone\n', stderr: '', interrupted: false }

// fullscreen でまとめられた呼び出しを開いたときの 1 行
const row = (props: { tool?: string; output?: unknown; isErrored?: boolean; isRunning?: boolean }) =>
  ({
    plugin: 'compact-tools',
    component: 'ToolUse',
    requestId: 't1',
    viewport: { columns: 80, rows: 24 },
    props: {
      tool_use_id: 't1',
      tool: 'Bash',
      input: { command: 'bun test' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: OUTPUT,
      ...props,
    },
  }) as const

const START = { cwd: '.', surface: 'terminal', isInteractive: true } as const

const drawn = { type: 'Text', text: /^ENGINE / }

const folded = (text: string) => `ENGINE stdout=${JSON.stringify(text)} stderr=""`
const asIs = `ENGINE stdout=${JSON.stringify(OUTPUT.stdout)} stderr=""`

test('まとめられた呼び出しの行でも、出力を 1 行に畳んでエンジンに渡す', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(folded('3 行 · PASS a.test.ts … Done'))
})

test('ToolUse の行でも stderr をつないで数え、stderr は空にする', async ($, on) => {
  engine(on)
  const output = { ...OUTPUT, stderr: 'warn: a\n' }
  const ui = await $.ui.mount({ ...row({ output }), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(folded('4 行 · PASS a.test.ts … warn: a'))
})

test('ToolUse の行でも show の設定に従う', { options: { show: 'last' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(folded('3 行 · Done'))
})

test('実行中の行は畳まない', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({ isRunning: true }), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(asIs)
})

test('エラーの行は畳まない', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({ isErrored: true }), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(asIs)
})

test('tools にないツールの行は畳まない', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({ tool: 'Grep' }), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(asIs)
})

test('minLines より短い出力の行は畳まない', { options: { minLines: 5 } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(asIs)
})

test('ターミナル以外では ToolUse の行を畳まない', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'desktop' })

  expect((await ui.find(drawn))?.text).toBe(asIs)
})

test('全出力表示のときは ToolUse の行を畳まない', async ($, on) => {
  engine(on, { isFull: true })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(drawn))?.text).toBe(asIs)
})
