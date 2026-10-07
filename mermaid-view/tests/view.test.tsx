import type { On, RenderSurface } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { displayWidth } from '../hooks/diagram'

// プラグインの下でエンジンの代わりに答える。返答の描画は ENGINE という Text を返す
const engine = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>ENGINE</Text>
  })
}

const MESSAGE = 'AssistantMessage'

const mount = (
  $: Engine,
  text: string,
  { surface = 'terminal', columns = 120 }: { surface?: RenderSurface; columns?: number } = {},
) =>
  $.ui.mount({
    plugin: 'mermaid-view',
    surface,
    component: MESSAGE,
    props: { text, isFirstOfReply: true },
    viewport: { columns, rows: 50 },
  })

// 部分一致を避けるため、文字列は完全一致の正規表現にして探す
const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

// 描いた要素の文字を、入れ子の Text も含めてつなぐ
const textOf = (node: unknown): string => {
  if (typeof node === 'string') return node
  if (node === null || typeof node !== 'object') return ''
  const { children, props } = node as { children?: unknown[]; props?: { children?: unknown } }
  const kids = children ?? (props?.children === undefined ? [] : [props.children].flat())

  return kids.map(textOf).join('')
}

// 図の行。図は key が mermaid-<番号> の Box に、1 行 1 要素で入る
const diagramLines = async (ui: { find: (q: { key: string }) => Promise<{ children: unknown[] } | undefined> }, index = 0) =>
  ((await ui.find({ key: `mermaid-${index}` }))?.children ?? []).map(textOf)

const fence = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``

test('mermaid のブロックがない返答はエンジンに任せる', async ($, on) => {
  engine(on)
  const ui = await mount($, '普通の返答\n\n```ts\nconst a = 1\n```')

  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})

test('mermaid のブロックを罫線の図にし、前後の文章は Markdown で描く', async ($, on) => {
  engine(on)
  const ui = await mount($, `前の文\n\n${fence('graph LR\n  A --> B')}\n\n後の文`)

  expect(await ui.find({ type: 'Markdown', text: /前の文/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /後の文/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /graph LR/ })).toBeUndefined()
  expect((await diagramLines(ui)).join('\n')).toMatch(/┌───┐\s+┌───┐/)
})

test('図の枠・線・矢印に色を付ける', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph LR\n  A --> B'))

  expect((await ui.find({ type: 'Text', text: exact('┌───┐') }))?.props.color).toBe('suggestion')
  expect((await ui.find({ type: 'Text', text: /^─+$/ }))?.props.color).toBe('inactive')
  expect((await ui.find({ type: 'Text', text: exact('►') }))?.props.color).toBe('suggestion')
})

test('日本語のラベルでも枠がずれない', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph LR\n  A[開始] --> B[終了]'))
  const lines = await diagramLines(ui)
  const label = lines.find(line => line.includes('開始'))!

  expect(label).toMatch(/│\s*開始\s*[│├]/)
  expect(displayWidth(label.trimEnd())).toBe(displayWidth(lines[0]!.trimEnd()))
})

test('縦長のフローチャートを横向きに並べ直す', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph TD\n  A --> B --> C'))

  expect((await diagramLines(ui)).some(line => /A.*B.*C/.test(line))).toBe(true)
})

test('横向きにすると幅に収まらないなら縦向きのまま描く', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph TD\n  A --> B --> C'), { columns: 20 })
  const lines = await diagramLines(ui)

  expect(lines.some(line => /A.*B/.test(line))).toBe(false)
  expect(lines.some(line => line.includes('C'))).toBe(true)
})

test('状態遷移図の [*] を省いて描く', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n  Run --> [*]'))
  const drawn = (await diagramLines(ui)).join('\n')

  expect(drawn).toContain('Idle')
  expect(drawn).toContain('Run')
  expect(drawn).not.toMatch(/[●╔]/)
})

test('横幅が足りないときは右端を切り、切った桁数を表示する', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph LR\n  A --> B --> C --> D --> E'), { columns: 24 })
  const lines = await diagramLines(ui)
  const notice = lines.at(-1)!

  expect(notice).toMatch(/^右端の \d+ 桁を省略$/)
  for (const line of lines.slice(0, -1)) expect(displayWidth(line)).toBeLessThanOrEqual(22)
  expect((await ui.find({ type: 'Text', text: /桁を省略/ }))?.props.dimColor).toBe(true)
})

test('ascii の設定で、罫線の文字を使わずに描く', { options: { ascii: true } }, async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph LR\n  A --> B'))
  const drawn = (await diagramLines(ui)).join('\n')

  expect(drawn).toContain('+---+')
  expect(drawn).not.toMatch(/[┌─│►]/)
})

test('描けない図は元のコードブロックのまま描く', async ($, on) => {
  engine(on)
  const ui = await mount($, `${fence('graph LR\n  A --> B')}\n\n${fence('pie\n  "a": 1')}`)

  expect((await diagramLines(ui)).length).toBeGreaterThan(0)
  expect(await ui.find({ type: 'Markdown', text: /```mermaid\npie/ })).toBeDefined()
})

test('描ける図が 1 つもなければエンジンに任せる', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('pie\n  "a": 1'))

  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})

test('書きかけで閉じていない mermaid のブロックはエンジンに任せる', async ($, on) => {
  engine(on)
  const ui = await mount($, '```mermaid\ngraph LR\n  A --> B')

  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})

test('Desktop アプリの Code タブでも図にする', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph LR\n  A --> B'), { surface: 'desktop' })

  expect((await diagramLines(ui)).length).toBeGreaterThan(0)
})

test('ターミナルと Desktop アプリ以外ではエンジンに任せる', async ($, on) => {
  engine(on)
  const ui = await mount($, fence('graph LR\n  A --> B'), { surface: 'vscode' })

  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})
