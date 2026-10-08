import { expect, test } from 'claude-code/testing'

import {
  changes,
  ciPrompt,
  commentPrompt,
  currentLabel,
  currentOf,
  mineLabel,
  parse,
  queryOf,
  repoOf,
  reviewLabel,
  reviewPrompt,
  rowLabels,
} from '../hooks/prs'
import { EMPTY, mine, response, RESPONSE, review } from './fixtures'

const AT = new Date(2026, 9, 9, 12, 5, 0).getTime()

const summaryOf = (body: unknown) => parse(JSON.stringify(body), AT)

test('gh の答えから自分の PR とレビュー依頼を読む', () => {
  const summary = summaryOf(RESPONSE)

  expect(summary.error).toBe(null)
  expect(summary.current).toBe(null)
  expect(summary.fetchedAt).toBe(AT)
  expect(summary.mine[0]).toEqual({
    repo: 'example/app',
    number: 1,
    title: '自分の PR 1',
    url: 'https://github.com/example/app/pull/1',
    branch: 'feat/pr-1',
    isDraft: false,
    checks: 'success',
    review: null,
    hasConflict: false,
    unresolved: 0,
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
  const summary = summaryOf(RESPONSE)

  expect(summary.mine.map(pr => [pr.checks, pr.review, pr.hasConflict, pr.isDraft])).toEqual([
    ['success', null, false, false],
    ['failure', 'changes', false, false],
    ['pending', 'required', true, false],
    [null, 'approved', false, true],
  ])
})

test('解決していないレビューコメントのスレッドだけを数える', () => {
  expect(summaryOf(RESPONSE).mine.map(pr => pr.unresolved)).toEqual([0, 2, 0, 0])
})

test('ERROR は失敗、EXPECTED は実行中として扱う', () => {
  expect(summaryOf(response([mine(1, { checks: 'ERROR' })], [])).mine[0]?.checks).toBe('failure')
  expect(summaryOf(response([mine(1, { checks: 'EXPECTED' })], [])).mine[0]?.checks).toBe('pending')
})

test('JSON として読めなければ error に理由を入れる', () => {
  const summary = parse('not json', AT)

  expect(summary.mine).toEqual([])
  expect(summary.review).toEqual([])
  expect(summary.error).toBe('gh の答えを読めない')
})

test('GraphQL のエラーが返ったら error に最初のメッセージを入れる', () => {
  expect(summaryOf({ errors: [{ message: 'Bad credentials' }] }).error).toBe('Bad credentials')
})

test('クエリは自分の PR とレビュー依頼を 1 回で取る', () => {
  const query = queryOf(null)

  expect(query).toContain('is:open is:pr author:@me archived:false')
  expect(query).toContain('is:open is:pr review-requested:@me archived:false')
  expect(query).toContain('statusCheckRollup')
  expect(query).toContain('headRefName')
  expect(query).toContain('reviewThreads')
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

test('今いるリポジトリとブランチに合う自分の PR を探す', () => {
  const summary = summaryOf(RESPONSE)

  expect(currentOf(summary.mine, 'example/app', 'feat/pr-2')?.number).toBe(2)
  expect(currentOf(summary.mine, 'example/other', 'feat/pr-2')).toBe(null)
  expect(currentOf(summary.mine, 'example/app', 'main')).toBe(null)
  expect(currentOf(summary.mine, null, 'feat/pr-2')).toBe(null)
})

test('帯の PR のボタンには件数と、手を打つべき PR の数を出す', () => {
  expect(mineLabel(summaryOf(RESPONSE))).toBe('PR 4（CI 失敗 1・変更要求 1・競合 1）')
  expect(mineLabel(summaryOf(response([mine(1)], [])))).toBe('PR 1')
})

test('帯のレビュー依頼のボタンには件数を出す', () => {
  expect(reviewLabel(summaryOf(RESPONSE))).toBe('レビュー依頼 1')
  expect(reviewLabel(summaryOf(EMPTY))).toBe('レビュー依頼 0')
})

test('今のブランチの PR は番号と状態と未対応のコメント数を出す', () => {
  const [one, two] = summaryOf(RESPONSE).mine

  expect(currentLabel(two!)).toBe('このブランチ #2 CI 失敗 · 変更要求 · 未対応 2')
  expect(currentLabel(one!)).toBe('このブランチ #1 CI 成功')
})

test('一覧の行には下書き、CI、レビュー、競合、未対応のコメント数を並べる', () => {
  const summary = summaryOf(RESPONSE)

  expect(summary.mine.map(rowLabels)).toEqual([
    ['CI 成功'],
    ['CI 失敗', '変更要求', '未対応 2'],
    ['CI 実行中', 'レビュー待ち', '競合あり'],
    ['下書き', '承認済み'],
  ])
})

test('CI の失敗と成功を知らせる', () => {
  const before = summaryOf(response([mine(1, { checks: 'PENDING' }), mine(2, { checks: 'FAILURE' })], []))
  const after = summaryOf(response([mine(1, { checks: 'FAILURE' }), mine(2)], []))

  expect(changes(before, after)).toEqual([
    'CI 失敗: example/app#1 自分の PR 1',
    'CI 成功: example/app#2 自分の PR 2',
  ])
})

test('承認と変更要求が付いたら知らせる', () => {
  const before = summaryOf(response([mine(1), mine(2, { review: 'REVIEW_REQUIRED' })], []))
  const after = summaryOf(
    response([mine(1, { review: 'APPROVED' }), mine(2, { review: 'CHANGES_REQUESTED' })], []),
  )

  expect(changes(before, after)).toEqual(['承認: example/app#1 自分の PR 1', '変更要求: example/app#2 自分の PR 2'])
})

test('新しいレビュー依頼を知らせる', () => {
  const before = summaryOf(response([], [review(7)]))
  const after = summaryOf(response([], [review(7), review(8)]))

  expect(changes(before, after)).toEqual(['レビュー依頼: example/lib#8 レビュー依頼 8（@alice）'])
})

test('変わらなければ、また前の値がなければ知らせない', () => {
  expect(changes(summaryOf(RESPONSE), summaryOf(RESPONSE))).toEqual([])
  expect(changes(null, summaryOf(RESPONSE))).toEqual([])
})

test('新しく出した PR や、取得に失敗した前後では知らせない', () => {
  const failed = { ...summaryOf(EMPTY), error: 'gh が見つからない' }

  expect(changes(summaryOf(EMPTY), summaryOf(response([mine(1, { checks: 'FAILURE' })], [])))).toEqual([])
  expect(changes(failed, summaryOf(RESPONSE))).toEqual([])
  expect(changes(summaryOf(RESPONSE), failed)).toEqual([])
})

test('Claude に渡すプロンプトは PR の URL を含める', () => {
  const [, two] = summaryOf(RESPONSE).mine
  const [seven] = summaryOf(RESPONSE).review

  expect(commentPrompt(two!)).toBe(
    'https://github.com/example/app/pull/2 の未解決のレビューコメントを gh で確認して対応して',
  )
  expect(ciPrompt(two!)).toBe(
    'https://github.com/example/app/pull/2 の CI が失敗している。gh で失敗したチェックのログを確認して直して',
  )
  expect(reviewPrompt(seven!)).toBe('https://github.com/example/lib/pull/7 をレビューして')
})
