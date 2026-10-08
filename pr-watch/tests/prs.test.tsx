import { expect, test } from 'claude-code/testing'

import { bandText, paneMarkdown, parse, queryOf, repoOf, type Summary } from '../hooks/prs'
import { EMPTY, RESPONSE } from './fixtures'

const AT = new Date(2026, 9, 9, 12, 5, 0).getTime()

test('gh の答えから自分の PR とレビュー依頼を読む', () => {
  const summary = parse(JSON.stringify(RESPONSE), AT)

  expect(summary.error).toBe(null)
  expect(summary.fetchedAt).toBe(AT)
  expect(summary.mine[0]).toEqual({
    repo: 'example/app',
    number: 1,
    title: '自分の PR 1',
    url: 'https://github.com/example/app/pull/1',
    isDraft: false,
    checks: 'success',
    review: null,
    hasConflict: false,
  })
  expect(summary.review).toEqual([
    {
      repo: 'example/lib',
      number: 7,
      title: 'レビュー依頼 7',
      url: 'https://github.com/example/lib/pull/7',
      author: 'alice',
    },
  ])
})

test('CI とレビューの判定と競合を短い値にする', () => {
  const summary = parse(JSON.stringify(RESPONSE), AT)

  expect(summary.mine.map(pr => [pr.checks, pr.review, pr.hasConflict, pr.isDraft])).toEqual([
    ['success', null, false, false],
    ['failure', 'changes', false, false],
    ['pending', 'required', true, false],
    [null, 'approved', false, true],
  ])
})

test('ERROR は失敗、EXPECTED は実行中として扱う', () => {
  const nodes = (state: string) => ({
    data: {
      mine: { nodes: [{ ...RESPONSE.data.mine.nodes[0], commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } }] },
      review: { nodes: [] },
    },
  })

  expect(parse(JSON.stringify(nodes('ERROR')), AT).mine[0]?.checks).toBe('failure')
  expect(parse(JSON.stringify(nodes('EXPECTED')), AT).mine[0]?.checks).toBe('pending')
})

test('JSON として読めなければ error に理由を入れる', () => {
  const summary = parse('not json', AT)

  expect(summary.mine).toEqual([])
  expect(summary.review).toEqual([])
  expect(summary.error).toBe('gh の答えを読めない')
})

test('GraphQL のエラーが返ったら error に最初のメッセージを入れる', () => {
  const summary = parse(JSON.stringify({ errors: [{ message: 'Bad credentials' }] }), AT)

  expect(summary.error).toBe('Bad credentials')
})

test('クエリは自分の PR とレビュー依頼を 1 回で取る', () => {
  const query = queryOf(null)

  expect(query).toContain('is:open is:pr author:@me archived:false')
  expect(query).toContain('is:open is:pr review-requested:@me archived:false')
  expect(query).toContain('statusCheckRollup')
  expect(query).not.toContain('repo:')
})

test('リポジトリを渡すと、そのリポジトリだけに絞る', () => {
  const query = queryOf('example/app')

  expect(query).toContain('is:open is:pr author:@me archived:false repo:example/app')
  expect(query).toContain('is:open is:pr review-requested:@me archived:false repo:example/app')
})

test('origin の URL から owner/name を取り出す', () => {
  expect(repoOf('git@github.com:example/app.git')).toBe('example/app')
  expect(repoOf('https://github.com/example/app.git')).toBe('example/app')
  expect(repoOf('https://github.com/example/app')).toBe('example/app')
  expect(repoOf('ssh://git@github.com/example/app.git')).toBe('example/app')
  expect(repoOf('https://gitlab.com/example/app.git')).toBe(null)
  expect(repoOf(null)).toBe(null)
})

test('帯には件数と、手を打つべき PR の数を出す', () => {
  const summary = parse(JSON.stringify(RESPONSE), AT)

  expect(bandText(summary)).toBe('PR 4（CI 失敗 1・変更要求 1・競合 1）· レビュー依頼 1')
})

test('手を打つべき PR がなければ件数だけを出す', () => {
  const summary: Summary = { ...parse(JSON.stringify(RESPONSE), AT), review: [] }
  summary.mine = summary.mine.slice(0, 1)

  expect(bandText(summary)).toBe('PR 1 · レビュー依頼 0')
})

test('PR もレビュー依頼もなければ帯に何も出さない', () => {
  expect(bandText(parse(JSON.stringify(EMPTY), AT))).toBe('')
})

test('取得に失敗したら帯に理由を出す', () => {
  const summary: Summary = { mine: [], review: [], error: 'gh が見つからない', fetchedAt: AT }

  expect(bandText(summary)).toBe('PR: gh が見つからない')
})

test('Pane には自分の PR とレビュー依頼を分けて、リンク付きで並べる', () => {
  const text = paneMarkdown(parse(JSON.stringify(RESPONSE), AT))

  expect(text).toContain('## 自分の PR（4）')
  expect(text).toContain('- [example/app#1 自分の PR 1](https://github.com/example/app/pull/1) · CI 成功')
  expect(text).toContain('- [example/app#2 自分の PR 2](https://github.com/example/app/pull/2) · CI 失敗 · 変更要求')
  expect(text).toContain(
    '- [example/app#3 自分の PR 3](https://github.com/example/app/pull/3) · CI 実行中 · レビュー待ち · 競合あり',
  )
  expect(text).toContain('- [example/app#4 自分の PR 4](https://github.com/example/app/pull/4) · 下書き · 承認済み')
  expect(text).toContain('## レビュー依頼（1）')
  expect(text).toContain('- [example/lib#7 レビュー依頼 7](https://github.com/example/lib/pull/7) · @alice')
  expect(text).toContain('最終更新 12:05')
})

test('一覧が空なら、その節に「なし」と書く', () => {
  const text = paneMarkdown(parse(JSON.stringify(EMPTY), AT))

  expect(text).toContain('## 自分の PR（0）\n\nなし')
  expect(text).toContain('## レビュー依頼（0）\n\nなし')
})

test('取得に失敗したら Pane の先頭に理由を出す', () => {
  const text = paneMarkdown({ mine: [], review: [], error: 'gh が見つからない', fetchedAt: AT })

  expect(text.startsWith('取得できなかった: gh が見つからない')).toBe(true)
})
