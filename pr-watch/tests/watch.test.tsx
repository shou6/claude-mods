import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { EMPTY, RESPONSE } from './fixtures'

const NOW = new Date(2026, 9, 9, 12, 0, 0).getTime()
const START = { cwd: 'D:/work/app', surface: 'terminal', isInteractive: true } as const

type Run = { exitCode: number; stdout: string; stderr: string } | Error

type Options = { run?: () => Run; remote?: string | null }

// プラグインの下でエンジンの代わりに答える。gh の呼び出しは argv を残す
const engine = (on: On, { run = () => ok(RESPONSE), remote = 'git@github.com:example/app.git' }: Options = {}) => {
  const clock = mock.clock(on, { now: NOW })
  const calls: (readonly string[])[] = []
  const opened: string[] = []

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: remote === null ? null : { root: START.cwd, remote, internal: false, name: null } }))
  on('process.run', (_$, e) => {
    calls.push(e.argv)
    const result = run()
    if (result instanceof Error) throw result

    return { value: { ...result, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('ui.open', (_$, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>ENGINE</Text>
  })

  return { clock, calls, opened }
}

const ok = (body: unknown) => ({ exitCode: 0, stdout: JSON.stringify(body), stderr: '' })

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

const band = { type: 'Text', text: /^PR / }

test('セッションが始まると gh で PR を取り、帯に件数を出す', async ($, on) => {
  const { clock, calls } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount(BAND)

  expect(calls).toHaveLength(1)
  expect(calls[0]?.slice(0, 4)).toEqual(['gh', 'api', 'graphql', '-f'])
  expect(calls[0]?.[4]).toStartWith('query=')
  expect((await ui.find(band))?.text).toBe('PR 4（CI 失敗 1・変更要求 1・競合 1）· レビュー依頼 1')
  // Claude Code とほかの Mod が描くものは残す
  expect(await ui.find({ type: 'Text', text: 'ENGINE' })).toBeDefined()
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

  expect(await ui.find(band)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'ENGINE' })).toBeDefined()
})

test('gh が失敗したら、標準エラーの 1 行目を帯に出す', async ($, on) => {
  const { clock } = engine(on, {
    run: () => ({ exitCode: 1, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login\nmore' }),
  })
  await $.session.start(START)
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND })

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
  expect(await ui.find(band)).toBeUndefined()
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

test('/prs で取り直して Pane を開き、一覧を描く', async ($, on) => {
  const { clock, calls, opened } = engine(on)
  await $.session.start(START)
  await clock.advance(0)
  await $.command.run({ command: 'prs', args: '' } as never)
  const ui = await $.ui.mount(PANE)

  expect(calls).toHaveLength(2)
  expect(opened).toEqual(['prs'])
  const text = (await ui.find({ type: 'Markdown' }))?.text ?? ''
  expect(text).toContain('## 自分の PR（4）')
  expect(text).toContain('## レビュー依頼（1）')
})
