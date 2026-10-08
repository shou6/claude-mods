import type { Checks, MyPr, Review, ReviewPr, Summary } from '../types'

export type { MyPr, ReviewPr, Summary }

// 自分の PR とレビュー依頼を 1 回の GraphQL で取る
export const queryOf = (repo: string | null) => {
  const scope = repo === null ? '' : ` repo:${repo}`
  const fields = 'number title url isDraft headRefName repository { nameWithOwner }'

  return `query {
  mine: search(query: "is:open is:pr author:@me archived:false${scope}", type: ISSUE, first: 50) {
    nodes { ... on PullRequest { ${fields} reviewDecision mergeable
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      reviewThreads(first: 100) { nodes { isResolved } } } }
  }
  review: search(query: "is:open is:pr review-requested:@me archived:false${scope}", type: ISSUE, first: 50) {
    nodes { ... on PullRequest { ${fields} author { login } } }
  }
}`
}

const CHECKS: Record<string, Checks> = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  PENDING: 'pending',
  EXPECTED: 'pending',
}

const REVIEWS: Record<string, Review> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes',
  REVIEW_REQUIRED: 'required',
}

// GraphQL の答えは形を信用せず、欠けた項目は空の値で読む
type Node = {
  number?: number
  title?: string
  url?: string
  isDraft?: boolean
  headRefName?: string
  repository?: { nameWithOwner?: string }
  reviewDecision?: string | null
  mergeable?: string
  author?: { login?: string } | null
  commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] }
  reviewThreads?: { nodes?: { isResolved?: boolean }[] }
}

type Response = {
  data?: { mine?: { nodes?: Node[] }; review?: { nodes?: Node[] } }
  errors?: { message?: string }[]
}

const base = (node: Node) => ({
  repo: node.repository?.nameWithOwner ?? '',
  number: node.number ?? 0,
  title: node.title ?? '',
  url: node.url ?? '',
})

// 取得に失敗したときの中身
export const failed = (error: string, fetchedAt: number): Summary => ({
  mine: [],
  review: [],
  current: null,
  error,
  fetchedAt,
})

export const parse = (stdout: string, fetchedAt: number): Summary => {
  let body: Response
  try {
    body = JSON.parse(stdout) as Response
  } catch {
    return failed('gh の答えを読めない', fetchedAt)
  }

  const message = body.errors?.[0]?.message
  if (message !== undefined) return failed(message, fetchedAt)

  // 検索結果には PR 以外の空のノードが混ざることがあるので、番号のないものは外す
  const nodes = (list?: { nodes?: Node[] }) => (list?.nodes ?? []).filter(node => typeof node.number === 'number')

  const mine = nodes(body.data?.mine).map(node => {
    const state = node.commits?.nodes?.at(-1)?.commit?.statusCheckRollup?.state

    return {
      ...base(node),
      branch: node.headRefName ?? '',
      isDraft: node.isDraft === true,
      checks: (state && CHECKS[state]) || null,
      review: (node.reviewDecision && REVIEWS[node.reviewDecision]) || null,
      hasConflict: node.mergeable === 'CONFLICTING',
      unresolved: (node.reviewThreads?.nodes ?? []).filter(thread => thread.isResolved === false).length,
    }
  })
  const review = nodes(body.data?.review).map(node => ({ ...base(node), author: node.author?.login ?? '' }))

  return { mine, review, current: null, error: null, fetchedAt }
}

// origin の URL から GitHub の owner/name を取り出す。GitHub でなければ null
export const repoOf = (remote: string | null) => {
  if (remote === null) return null

  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote)

  return m ? `${m[1]}/${m[2]}` : null
}

// 今いるリポジトリとブランチに合う自分の PR
export const currentOf = (mine: readonly MyPr[], repo: string | null, branch: string) =>
  repo === null || branch === '' ? null : (mine.find(pr => pr.repo === repo && pr.branch === branch) ?? null)

const count = (prs: readonly MyPr[], is: (pr: MyPr) => boolean) => prs.filter(is).length

export const mineLabel = (summary: Summary) => {
  const problems = [
    ['CI 失敗', count(summary.mine, pr => pr.checks === 'failure')],
    ['変更要求', count(summary.mine, pr => pr.review === 'changes')],
    ['競合', count(summary.mine, pr => pr.hasConflict)],
  ] as const
  const notes = problems.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`)

  return `PR ${summary.mine.length}${notes.length > 0 ? `（${notes.join('・')}）` : ''}`
}

export const reviewLabel = (summary: Summary) => `レビュー依頼 ${summary.review.length}`

const CHECK_LABELS: Record<NonNullable<Checks>, string> = { success: 'CI 成功', failure: 'CI 失敗', pending: 'CI 実行中' }
const REVIEW_LABELS: Record<NonNullable<Review>, string> = {
  approved: '承認済み',
  changes: '変更要求',
  required: 'レビュー待ち',
}

export const rowLabels = (pr: MyPr) =>
  [
    pr.isDraft ? '下書き' : null,
    pr.checks === null ? null : CHECK_LABELS[pr.checks],
    pr.review === null ? null : REVIEW_LABELS[pr.review],
    pr.hasConflict ? '競合あり' : null,
    pr.unresolved > 0 ? `未対応 ${pr.unresolved}` : null,
  ].filter((label): label is string => label !== null)

export const currentLabel = (pr: MyPr) => `このブランチ #${pr.number} ${rowLabels(pr).join(' · ')}`.trim()

const name = (pr: { repo: string; number: number; title: string }) => `${pr.repo}#${pr.number} ${pr.title}`

// 前の取得から変わったことを知らせる文。前がない、またはどちらかが失敗なら知らせない
export const changes = (prev: Summary | null, next: Summary) => {
  if (prev === null || prev.error !== null || next.error !== null) return []

  const messages: string[] = []
  for (const pr of next.mine) {
    // 新しく出した PR は前と比べられない
    const before = prev.mine.find(one => one.url === pr.url)
    if (before === undefined) continue

    if (pr.checks !== before.checks && pr.checks === 'failure') messages.push(`CI 失敗: ${name(pr)}`)
    if (pr.checks !== before.checks && pr.checks === 'success') messages.push(`CI 成功: ${name(pr)}`)
    if (pr.review !== before.review && pr.review === 'approved') messages.push(`承認: ${name(pr)}`)
    if (pr.review !== before.review && pr.review === 'changes') messages.push(`変更要求: ${name(pr)}`)
  }
  for (const pr of next.review) {
    if (!prev.review.some(one => one.url === pr.url)) messages.push(`レビュー依頼: ${name(pr)}（@${pr.author}）`)
  }

  return messages
}

export const commentPrompt = (pr: MyPr) => `${pr.url} の未解決のレビューコメントを gh で確認して対応して`

export const ciPrompt = (pr: MyPr) =>
  `${pr.url} の CI が失敗している。gh で失敗したチェックのログを確認して直して`

export const reviewPrompt = (pr: ReviewPr) => `${pr.url} をレビューして`
