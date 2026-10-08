import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// プラグインの下でエンジンの代わりに答える
const engine = (on: On, store: Record<string, unknown> = {}) => {
  // ストアはメモリーに持ち、書き込みを順に記録する
  const entries = new Map(Object.entries(store))
  const saved: { key: string; value: unknown }[] = []
  on('store.get', (_$, e) => ({ value: entries.get(e.key) }))
  on('store.set', (_$, e) => {
    entries.set(e.key, e.value)
    saved.push({ key: e.key, value: e.value })

    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>ENGINE</Text>
  })

  return { saved }
}

const OUTPUT = { stdout: '\nPASS a.test.ts\nTests: 3 passed\nDone\n', stderr: '', interrupted: false }

const row = (props: { tool?: string; output?: unknown; isErrored?: boolean }) =>
  ({
    plugin: 'compact-tools',
    component: 'ToolResult',
    requestId: 't1',
    viewport: { columns: 80, rows: 24 },
    props: { tool_use_id: 't1', tool: 'Bash', output: OUTPUT, isErrored: false, ...props },
  }) as const

const START = { cwd: '.', surface: 'terminal', isInteractive: true } as const

const summary = { type: 'Text', text: /行 · / }
const standard = { type: 'Text', text: 'ENGINE' }

test('既定では行数と先頭行と末尾の行の 1 行に畳む', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(summary))?.text).toBe('  ⎿  3 行 · PASS a.test.ts … Done')
})

test('PowerShell の出力も畳む', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({ tool: 'PowerShell' }), surface: 'terminal' })

  expect((await ui.find(summary))?.text).toBe('  ⎿  3 行 · PASS a.test.ts … Done')
})

test('show が first なら先頭行だけを出す', { options: { show: 'first' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(summary))?.text).toBe('  ⎿  3 行 · PASS a.test.ts')
})

test('show が last なら末尾の行だけを出す', { options: { show: 'last' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect((await ui.find(summary))?.text).toBe('  ⎿  3 行 · Done')
})

test('stderr を stdout の後ろにつないで数える', async ($, on) => {
  engine(on)
  const output = { ...OUTPUT, stderr: 'warn: a\nwarn: b\n' }
  const ui = await $.ui.mount({ ...row({ output }), surface: 'terminal' })

  expect((await ui.find(summary))?.text).toBe('  ⎿  5 行 · PASS a.test.ts … warn: b')
})

test('stdout が空でも stderr が複数行なら畳む', async ($, on) => {
  engine(on)
  const output = { ...OUTPUT, stdout: '', stderr: 'Cloning into x...\ndone.\n' }
  const ui = await $.ui.mount({ ...row({ output }), surface: 'terminal' })

  expect((await ui.find(summary))?.text).toBe('  ⎿  2 行 · Cloning into x... … done.')
})

test('1 行以下の出力は標準表示のまま', async ($, on) => {
  engine(on)
  const output = { ...OUTPUT, stdout: 'ok\n' }
  const ui = await $.ui.mount({ ...row({ output }), surface: 'terminal' })

  expect(await ui.find(standard)).toBeDefined()
})

test('minLines より短い出力は標準表示のまま', { options: { minLines: 5 } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect(await ui.find(standard)).toBeDefined()
})

test('minLines 以上の出力は畳む', { options: { minLines: 3 } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect(await ui.find(summary)).toBeDefined()
})

test('tools に挙げたツールだけを畳む', { options: { tools: 'PowerShell' } }, async ($, on) => {
  engine(on)
  const bash = await $.ui.mount({ ...row({}), surface: 'terminal' })
  expect(await bash.find(standard)).toBeDefined()

  const ps = await $.ui.mount({ ...row({ tool: 'PowerShell' }), surface: 'terminal' })
  expect(await ps.find(summary)).toBeDefined()
})

test('tools はカンマ区切りで前後の空白を無視する', { options: { tools: ' Bash , Grep ' } }, async ($, on) => {
  engine(on)
  const output = { ...OUTPUT }
  const ui = await $.ui.mount({ ...row({ tool: 'Grep', output }), surface: 'terminal' })

  expect(await ui.find(summary)).toBeDefined()
})

test('/compact-tools で全出力表示と切り替える', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })
  expect(await ui.find(summary)).toBeDefined()

  const off = await $.command.run({ command: 'compact-tools' } as never)
  expect(off.text).toBe('ツール出力: 全出力表示')
  expect(await ui.find(summary)).toBeUndefined()

  const back = await $.command.run({ command: 'compact-tools' } as never)
  expect(back.text).toBe('ツール出力: 1 行表示')
  expect(await ui.find(summary)).toBeDefined()
})

test('前のセッションで全出力表示にしていれば、全出力表示で始まる', async ($, on) => {
  engine(on, { isFull: true })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...row({}), surface: 'terminal' })

  expect(await ui.find(standard)).toBeDefined()
})

test('切り替えた表示をストアに保存する', async ($, on) => {
  const { saved } = engine(on)
  await $.session.start(START)

  await $.command.run({ command: 'compact-tools' } as never)
  await $.command.run({ command: 'compact-tools' } as never)

  expect(saved).toEqual([
    { key: 'isFull', value: true },
    { key: 'isFull', value: false },
  ])
})

test('エラーは標準表示のまま', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({ isErrored: true }), surface: 'terminal' })

  expect(await ui.find(standard)).toBeDefined()
})

test('Edit の diff は標準表示のまま', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({ tool: 'Edit', output: {} }), surface: 'terminal' })

  expect(await ui.find(standard)).toBeDefined()
})

test('ターミナル以外では畳まない', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...row({}), surface: 'vscode' })

  expect(await ui.find(standard)).toBeDefined()
})

test('先頭行が長いときは幅に収める', async ($, on) => {
  engine(on)
  const output = { ...OUTPUT, stdout: `${'x'.repeat(200)}\nb\n` }
  const ui = await $.ui.mount({ ...row({ output }), surface: 'terminal' })

  expect((await ui.find(summary))?.props.wrap).toBe('truncate-end')
})
