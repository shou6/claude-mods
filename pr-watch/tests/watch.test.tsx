import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { EMPTY, mine, response, RESPONSE } from './fixtures'

const NOW = new Date(2026, 9, 9, 12, 0, 0).getTime()
const START = { cwd: 'D:/work/app', surface: 'terminal', isInteractive: true } as const

type Run = { exitCode: number; stdout: string; stderr: string } | Error

type Options = { run?: () => Run; remote?: string | null; branch?: Run }

const ok = (body: unknown) => ({ exitCode: 0, stdout: JSON.stringify(body), stderr: '' })

// プラグインの下でエンジンの代わりに答える。gh の呼び出しは argv を残す
const engine = (
  on: On,
  {
    run = () => ok(RESPONSE),
    remote = 'git@github.com:example/app.git',
    branch = { exitCode: 0, stdout: 'feat/pr-2\n', stderr: '' },
  }: Options = {},
) => {
  const clock = mock.clock(on, { now: NOW })
  const calls: (readonly string[])[] = []
  const opened: string[] = []
  const toasts: string[] = []
  const fills: string[] = []

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({
    value: remote === null ? null : { root: START.cwd, remote, internal: false, name: null },
  }))
  on('process.run', (_$, e) => {
    const result = e.argv[0] === 'git' ? branch : (calls.push(e.argv), run())
    if (result instanceof Error) throw result

    return { value: { ...result, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('ui.open', (_$, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('prompt.fill', (_$, e) => {
    fills.push(e.text)

    return { isFilled: true } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>ENGINE</Text>
  })

  return { clock, calls, opened, toasts, fills }
}

const BAND = {
  plugin: 'pr-watch',
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

const PANE = {
  plugin: 'pr-watch',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'prs',
  props: { title: 'PR', isFocused: false, bodyColumns: 80, placement: 'dock' },
} as never

const engineText = { type: 'Text', text: 'ENGINE' }

test('セッションが始まると gh で PR を取り、帯に件数のボタンを出す', async ($, on) => {
  const { clock, calls } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(calls).toHaveLength(1)
  expect(calls[0]?.slice(0, 4)).toEqual(['gh', 'api', 'graphql', '-f'])
  expect(calls[0]?.[4]).toStartWith('query=')
  expect((await ui.find({ type: 'Button', key: 'mine' }))?.text).toBe('PR 4（CI 失敗 1・変更要求 1・競合 1）')
  expect((await ui.find({ type: 'Button', key: 'review' }))?.text).toBe('レビュー依頼 1')
  // Claude Code とほかの Mod が描くものは残す
  expect(await ui.find(engineText)).toBeDefined()
})

test('今いるブランチに自分の PR があれば、その状態を帯に出す', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: 'このブランチ #2 CI 失敗 · 変更要求 · 未対応 2' })).toBeDefined()
})

test('今いるブランチに自分の PR がなければ、ブランチの状態は出さない', async ($, on) => {
  const { clock } = engine(on, { branch: { exitCode: 0, stdout: 'main\n', stderr: '' } })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: /このブランチ/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'mine' })).toBeDefined()
})

test('git でブランチを取れなくても、件数は出す', async ($, on) => {
  const { clock } = engine(on, { branch: new Error('ENOENT') })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Text', text: /このブランチ/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'mine' })).toBeDefined()
})

test('既定では 5 分ごとに取り直す', async ($, on) => {
  const { clock, calls } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await clock.advance(5 * 60_000 - 1)

  expect(calls).toHaveLength(1)

  await clock.advance(1)

  expect(calls).toHaveLength(2)
})

test('intervalMinutes で取り直す間隔を変える', { options: { intervalMinutes: 1 } }, async ($, on) => {
  const { clock, calls } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await clock.advance(60_000)

  expect(calls).toHaveLength(2)
})

test('PR もレビュー依頼もなければ帯に何も足さない', async ($, on) => {
  const { clock } = engine(on, { run: () => ok(EMPTY) })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.find(engineText)).toBeDefined()
})

test('gh が失敗したら、標準エラーの 1 行目を帯に出す', async ($, on) => {
  const { clock } = engine(on, {
    run: () => ({ exitCode: 1, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login\nmore' }),
  })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect((await ui.find({ type: 'Text', text: /^PR: / }))?.text).toBe(
    'PR: To get started with GitHub CLI, please run:  gh auth login',
  )
})

test('gh を起動できなければ「gh が見つからない」と帯に出す', async ($, on) => {
  const { clock } = engine(on, { run: () => new Error('ENOENT') })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect((await ui.find({ type: 'Text', text: /^PR: / }))?.text).toBe('PR: gh が見つからない')
})

test('scope が repo なら、今いるリポジトリに絞って取る', { options: { scope: 'repo' } }, async ($, on) => {
  const { clock, calls } = engine(on)
  await $.session.start(START)
  await clock.advance(0)

  expect(calls[0]?.[4]).toContain('repo:example/app')
})

test('scope が repo で GitHub のリポジトリでなければ、gh を呼ばない', { options: { scope: 'repo' } }, async ($, on) => {
  const { clock, calls } = engine(on, { remote: null })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(calls).toHaveLength(0)
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
})

test('セッションが始まると /prs を登録する', async ($, on) => {
  const names: string[] = []
  // 先に登録したフックが上に立ち、engine の答えより先に答える
  on('command.register', { name: 'prs' }, (_$, e) => {
    names.push(e.name)

    return { value: { command: e.name } }
  })
  engine(on)
  await $.session.start(START)

  expect(names).toEqual(['prs'])
})

const headings = { type: 'Text', text: /^(自分の PR|レビュー依頼)（\d+）$/ }

test('/prs で取り直して Pane を開き、自分の PR から並べる', async ($, on) => {
  const { clock, calls, opened } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  expect(calls).toHaveLength(2)
  expect(opened).toEqual(['prs'])
  expect((await ui.findAll(headings)).map(h => h.text)).toEqual(['自分の PR（4）', 'レビュー依頼（1）'])
  expect((await ui.find({ type: 'Markdown', key: 'row:example/app#2' }))?.text).toBe(
    '[example/app#2 自分の PR 2](https://github.com/example/app/pull/2) · CI 失敗 · 変更要求 · 未対応 2',
  )
  expect((await ui.find({ type: 'Markdown', key: 'row:example/lib#7' }))?.text).toBe(
    '[example/lib#7 レビュー依頼 7](https://github.com/example/lib/pull/7) · @alice',
  )
  expect(await ui.find({ type: 'Text', text: '最終更新 12:00' })).toBeDefined()
})

test('帯の PR の件数を押すと、自分の PR から並べた Pane を開く', async ($, on) => {
  const { clock, opened } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'mine' })
  const ui = await $.ui.mount(PANE)

  expect(opened).toEqual(['prs'])
  expect((await ui.findAll(headings)).map(h => h.text)).toEqual(['自分の PR（4）', 'レビュー依頼（1）'])
})

test('帯のレビュー依頼の件数を押すと、レビュー依頼から並べた Pane を開く', async ($, on) => {
  const { clock, opened } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'review' })
  const ui = await $.ui.mount(PANE)

  expect(opened).toEqual(['prs'])
  expect((await ui.findAll(headings)).map(h => h.text)).toEqual(['レビュー依頼（1）', '自分の PR（4）'])
})

test('一覧が空なら、その節に「なし」と書く', async ($, on) => {
  const { clock } = engine(on, { run: () => ok(EMPTY) })
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  expect(await ui.findAll({ type: 'Text', text: 'なし' })).toHaveLength(2)
})

test('取得に失敗したら Pane の先頭に理由を出す', async ($, on) => {
  const { clock } = engine(on, { run: () => new Error('ENOENT') })
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Text', text: '取得できなかった: gh が見つからない' })).toBeDefined()
})

test('未対応のコメントか変更要求がある PR には「コメントに対応」を出し、押すと入力欄に入れる', async ($, on) => {
  const { clock, fills } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Button', key: 'comment:example/app#1' })).toBeUndefined()
  await ui.press({ key: 'comment:example/app#2' })

  expect(fills).toEqual(['https://github.com/example/app/pull/2 の未解決のレビューコメントを gh で確認して対応して'])
})

test('CI が失敗した PR には「CI を直す」を出し、押すと入力欄に入れる', async ($, on) => {
  const { clock, fills } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ type: 'Button', key: 'ci:example/app#1' })).toBeUndefined()
  await ui.press({ key: 'ci:example/app#2' })

  expect(fills).toEqual([
    'https://github.com/example/app/pull/2 の CI が失敗している。gh で失敗したチェックのログを確認して直して',
  ])
})

test('レビュー依頼には「レビューする」を出し、押すと入力欄に入れる', async ($, on) => {
  const { clock, fills } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'review:example/lib#7' })

  expect(fills).toEqual(['https://github.com/example/lib/pull/7 をレビューして'])
})

test('取り直したときに変化があればトーストで知らせる。最初の取得では知らせない', async ($, on) => {
  let body: unknown = response([mine(1, { checks: 'PENDING' })], [])
  const { clock, toasts } = engine(on, { run: () => ok(body) })
  await $.session.start(START)
  await clock.advance(0)

  expect(toasts).toEqual([])

  body = response([mine(1, { checks: 'FAILURE' })], [])
  await clock.advance(5 * 60_000)

  expect(toasts).toEqual(['CI 失敗: example/app#1 自分の PR 1'])
})
