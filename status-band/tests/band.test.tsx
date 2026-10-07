import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// 2026-10-07 12:00 UTC
const NOW = Date.parse('2026-10-07T12:00:00Z')

type Engine = { model?: () => string; compactAt?: number; isAutoCompactEnabled?: boolean }

// プラグインの下でエンジンの代わりに答える。帯の描画は ENGINE という Text を返す
const engine = (
  on: On,
  { model = () => 'claude-opus-5-5', compactAt = 160000, isAutoCompactEnabled = true }: Engine = {},
) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  // $ の呼び出しの代役は { value } で答える
  on('session.model', () => ({ value: model() }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 200000,
        breakdown: { autoCompactThreshold: compactAt, isAutoCompactEnabled } as never,
      },
      rateLimits: [],
    },
  }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({ result: {} }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>ENGINE</Text>
  })

  return clock
}

const BAND = {
  plugin: 'status-band',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const LIMITS = [
  { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-07T14:14:00Z' },
  { kind: 'seven_day', percentUsed: 61, resetsAt: '2026-10-11T12:00:00Z' },
]

const measure = (percent = 42, rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[] = LIMITS) => ({
  context: { window: 200000, tokens: percent * 2000, percent },
  rateLimits,
  cost: { usd: 1.234 },
  changed: ['context', 'rateLimits', 'cost'] as ('context' | 'rateLimits' | 'cost')[],
})

const COMPLETE = {
  answer: '',
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  durationMs: 1000,
} as const

// 部分一致を避けるため、文字列は完全一致の正規表現にして探す
const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

const START = { cwd: '.', surface: 'terminal', isInteractive: true } as const

test('1 行目にモデル名を表示する', async ($, on) => {
  engine(on)
  await $.session.start(START)
  await $.session.measure(measure())
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact('Opus 5.5') })).toBeDefined()
})

test('ターンが終わるとモデル名を取り直す', async ($, on) => {
  let model = 'claude-opus-5-5'
  engine(on, { model: () => model })
  await $.session.start(START)
  await $.session.measure(measure())
  model = 'claude-fable-5-1'
  await $.turn.complete(COMPLETE)
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact('Fable 5.1') })).toBeDefined()
})

test('ctx を 5h・7d と同じ 8 マスのバーと % で表示する', async ($, on) => {
  engine(on)
  await $.session.measure(measure(42, []))
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact('ctx ') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('▰▰▰') }))?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: exact('▱▱▱▱▱') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact(' 42%') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /█|░/ })).toBeUndefined()
})

test('5h と 7d を 8 マスのバーと % とリセットまでの時間で表示する', async ($, on) => {
  engine(on)
  await $.session.measure(measure())
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact('5h ') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('▰▰') }))?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: exact('▱▱▱▱▱▱') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact(' 23.5% 2h14m') })).toBeDefined()

  expect(await ui.find({ type: 'Text', text: exact('7d ') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('▰▰▰▰▰') }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: exact('▱▱▱') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact(' 61% 4d') })).toBeDefined()
})

test('1 時間を切ると分だけで表示する', async ($, on) => {
  engine(on)
  await $.session.measure(
    measure(42, [{ kind: 'five_hour', percentUsed: 90, resetsAt: '2026-10-07T12:30:00Z' }]),
  )
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact(' 90% 30m') })).toBeDefined()
})

test('時間がたつとリセットまでの時間を描き直す', async ($, on) => {
  const clock = engine(on)
  await $.session.start(START)
  await $.session.measure(measure())
  const ui = await $.ui.mount(BAND)
  await clock.advance(60_000)

  expect(await ui.find({ type: 'Text', text: exact(' 23.5% 2h13m') })).toBeDefined()
})

test('使用率 60% 以上で黄、80% 以上で赤にする', async ($, on) => {
  engine(on)
  await $.session.measure(measure(65, []))
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /^▰+$/ }))?.props.color).toBe('warning')

  await $.session.measure(measure(85, []))
  expect((await ui.find({ type: 'Text', text: /^▰+$/ }))?.props.color).toBe('error')
})

test('自動 compact までの残りは表示しない', async ($, on) => {
  engine(on, { compactAt: 160000 })
  await $.session.start(START)
  await $.session.measure(measure(42))
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: /compact/ })).toBeUndefined()
})

test('費用は表示しない', async ($, on) => {
  engine(on)
  await $.session.measure(measure())
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
})

test('5h と 7d 以外の制限は表示しない', async ($, on) => {
  engine(on)
  await $.session.measure(measure(42, [...LIMITS, { kind: 'spend_limit', percentUsed: 10 }]))
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: /spend/ })).toBeUndefined()
})

test('直前ターンの要約は表示しない', async ($, on) => {
  engine(on)
  await $.session.measure(measure())
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: 'b.ts', content: '' })
  await $.turn.complete({ ...COMPLETE, durationMs: 34000 })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /前ターン/ })).toBeUndefined()
})

test('ほかの Mod の帯を消さずに並べる', async ($, on) => {
  engine(on)
  await $.session.measure(measure())
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact('ctx ') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})

test('使用量が無ければ自分の行を出さない', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: exact('ctx ') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})

test('サーベイ表示中は帯を譲る', async ($, on) => {
  engine(on)
  await $.session.measure(measure())
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })

  expect(await ui.find({ type: 'Text', text: exact('ctx ') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('ENGINE') })).toBeDefined()
})
