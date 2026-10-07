import { expect, test } from 'claude-code/testing'

import { createRenderer, displayWidth, prepare, splitMessage } from '../hooks/diagram'

// 描画ライブラリの代役。html の色指定付きで、決まった行を返す
const fakeRender = (outputs: Record<string, string>) => {
  const calls: { source: string; useAscii: boolean }[] = []
  const render = (source: string, options: { useAscii?: boolean }) => {
    calls.push({ source, useAscii: options.useAscii ?? false })
    const out = outputs[source]
    if (out === undefined) throw new Error('unsupported')

    return out
  }

  return { render, calls }
}

const span = (color: string, text: string) => `<span style="color:${color}">${text}</span>`

test('mermaid のブロックと前後の文章に分ける', () => {
  const text = '前の文\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n後の文'

  expect(splitMessage(text)).toEqual([
    { kind: 'markdown', text: '前の文\n' },
    { kind: 'mermaid', source: 'graph LR\n  A --> B', raw: '```mermaid\ngraph LR\n  A --> B\n```' },
    { kind: 'markdown', text: '\n後の文' },
  ])
})

test('チルダの囲みと大文字の言語名も mermaid とみなす', () => {
  expect(splitMessage('~~~Mermaid\ngraph LR\n~~~')).toEqual([
    { kind: 'mermaid', source: 'graph LR', raw: '~~~Mermaid\ngraph LR\n~~~' },
  ])
})

test('閉じていない mermaid のブロックは文章のまま残す', () => {
  const text = '前の文\n```mermaid\ngraph LR\n  A --> B'

  expect(splitMessage(text)).toEqual([{ kind: 'markdown', text }])
})

test('ほかのコードブロックの中の mermaid は図にしない', () => {
  const text = '````markdown\n```mermaid\ngraph LR\n```\n````'

  expect(splitMessage(text)).toEqual([{ kind: 'markdown', text }])
})

test('全角の文字は 2 桁と数える', () => {
  expect(displayWidth('ab')).toBe(2)
  expect(displayWidth('開始')).toBe(4)
  expect(displayWidth('Ａ１')).toBe(4)
})

test('縦向きのフローチャートに横向きの候補を用意する', () => {
  expect(prepare('graph TD\n  A --> B')).toEqual({ source: 'graph TD\n  A --> B', alt: 'graph LR\n  A --> B' })
  expect(prepare('flowchart TB\n  A --> B').alt).toBe('flowchart LR\n  A --> B')
  expect(prepare('flowchart\n  A --> B').alt).toBe('flowchart LR\n  A --> B')
  expect(prepare('graph TD; A --> B').alt).toBe('graph LR; A --> B')
  expect(prepare('graph BT\n  A --> B').alt).toBe('graph RL\n  A --> B')
  expect(prepare('%% コメント\n\ngraph TD\n  A --> B').alt).toBe('%% コメント\n\ngraph LR\n  A --> B')
})

test('横向きの図と、フローチャートと状態遷移図以外には候補を作らない', () => {
  expect(prepare('graph LR\n  A --> B').alt).toBeUndefined()
  expect(prepare('graph RL\n  A --> B').alt).toBeUndefined()
  expect(prepare('sequenceDiagram\n  A->>B: hi').alt).toBeUndefined()
})

test('状態遷移図に横向きの候補を用意する', () => {
  expect(prepare('stateDiagram-v2\n  A --> B').alt).toBe('stateDiagram-v2\ndirection LR\n  A --> B')
  expect(prepare('stateDiagram-v2\n  direction TB\n  A --> B').alt).toBe('stateDiagram-v2\n  direction LR\n  A --> B')
  expect(prepare('stateDiagram-v2\n  direction LR\n  A --> B').alt).toBeUndefined()
})

test('状態遷移図の [*] を省く', () => {
  const source = 'stateDiagram-v2\n  [*] --> A\n  A --> B\n  B --> [*]'

  expect(prepare(source).source).toBe('stateDiagram-v2\n  A --> B')
})

test('[*] を省くと遷移が残らない状態遷移図は、そのまま描く', () => {
  const source = 'stateDiagram-v2\n  [*] --> A'

  expect(prepare(source).source).toBe(source)
})

test('図の行を色の役割ごとの区切りにする', () => {
  const { render } = fakeRender({
    'graph LR': [`${span('#000002', '┌─┐')}  ${span('#000003', '─')}${span('#000004', '►')}`, `${span('#000001', 'A &amp; B')}`].join('\n'),
  })
  const draw = createRenderer(render)

  expect(draw('graph LR', { ascii: false })).toEqual({
    lines: [
      [
        { text: '┌─┐', role: 'border' },
        { text: '  ' },
        { text: '─', role: 'line' },
        { text: '►', role: 'arrow' },
      ],
      [{ text: 'A & B', role: 'text' }],
    ],
    cut: 0,
  })
})

test('横向きのほうが行が少なく、幅に収まるなら横向きで描く', () => {
  const { render } = fakeRender({ 'graph TD': 'A\n|\nB', 'graph LR': 'A-B' })
  const draw = createRenderer(render)

  expect(draw('graph TD', { ascii: false, columns: 80 })?.lines).toEqual([[{ text: 'A-B' }]])
})

test('横向きにすると幅に収まらないなら縦向きのまま描く', () => {
  const { render } = fakeRender({ 'graph TD': 'A\n|\nB', 'graph LR': 'A--------B' })
  const draw = createRenderer(render)

  expect(draw('graph TD', { ascii: false, columns: 5 })?.lines).toEqual([[{ text: 'A' }], [{ text: '|' }], [{ text: 'B' }]])
})

test('幅に収まらない行は右端を切り、切った桁数を返す', () => {
  const { render } = fakeRender({ 'graph LR': 'A--------B   \nC' })
  const draw = createRenderer(render)

  expect(draw('graph LR', { ascii: false, columns: 6 })).toEqual({
    lines: [[{ text: 'A-----' }], [{ text: 'C' }]],
    cut: 4,
  })
})

test('全角の文字の途中で切らない', () => {
  const { render } = fakeRender({ 'graph LR': '│開始│' })
  const draw = createRenderer(render)

  expect(draw('graph LR', { ascii: false, columns: 4 })).toEqual({ lines: [[{ text: '│開' }]], cut: 3 })
})

test('全角の文字を 2 桁の幅として描画ライブラリに渡す', () => {
  const calls: string[] = []
  const draw = createRenderer(source => {
    calls.push(source)

    return source.split('\n')[1]!
  })

  expect(draw('graph LR\n開始', { ascii: false })?.lines).toEqual([[{ text: '開始' }]])
  expect(calls[0]).not.toContain('開')
  expect(calls[0]!.length).toBe('graph LR\n'.length + 4)
})

test('ascii の指定を描画ライブラリに渡す', () => {
  const { render, calls } = fakeRender({ 'graph LR': 'A' })
  createRenderer(render)('graph LR', { ascii: true })

  expect(calls[0]!.useAscii).toBe(true)
})

test('同じ図は描き直さない', () => {
  const { render, calls } = fakeRender({ 'graph LR': 'A' })
  const draw = createRenderer(render)
  draw('graph LR', { ascii: false, columns: 80 })
  draw('graph LR', { ascii: false, columns: 80 })

  expect(calls).toHaveLength(1)
})

test('描けない図は undefined を返す', () => {
  const { render } = fakeRender({})

  expect(createRenderer(render)('pie\n  "a": 1', { ascii: false })).toBeUndefined()
})
