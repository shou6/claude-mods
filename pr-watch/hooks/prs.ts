import type { Checks, MyPr, Review, ReviewPr, Summary } from '../types'

export type { Summary }

// 自分の PR とレビュー依頼を 1 回の GraphQL で取る
export const queryOf = (repo: string | null) => {
  const scope = repo === null ? '' : ` repo:${repo}`
  const fields = 'number title url isDraft repository { nameWithOwner }'

  return `query {
  mine: search(query: "is:open is:pr author:@me archived:false${scope}", type: ISSUE, first: 50) {
    nodes { ... on PullRequest { ${fields} reviewDecision mergeable
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } }
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
  repository?: { nameWithOwner?: string }
  reviewDecision?: string | null
  mergeable?: string
  author?: { login?: string } | null
  commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] }
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

export const parse = (stdout: string, fetchedAt: number): Summary => {
  let body: Response
  try {
    body = JSON.parse(stdout) as Response
  } catch {
    return { mine: [], review: [], current: null, error: 'gh の答えを読めない', fetchedAt }
  }

  const message = body.errors?.[0]?.message
  if (message !== undefined) return { mine: [], review: [], current: null, error: message, fetchedAt }

  // 検索結果には PR 以外の空のノードが混ざることがあるので、番号のないものは外す
  const nodes = (list?: { nodes?: Node[] }) => (list?.nodes ?? []).filter((node) => typeof node.number === 'number')

  const mine = nodes(body.data?.mine).map((node) => {
    const state = node.commits?.nodes?.at(-1)?.commit?.statusCheckRollup?.state

    return {
      ...base(node),
      branch: '',
      unresolved: 0,
      isDraft: node.isDraft === true,
      checks: (state && CHECKS[state]) || null,
      review: (node.reviewDecision && REVIEWS[node.reviewDecision]) || null,
      hasConflict: node.mergeable === 'CONFLICTING',
    }
  })
  const review = nodes(body.data?.review).map((node) => ({
    ...base(node),
    author: node.author?.login ?? '',
  }))

  return { mine, review, current: null, error: null, fetchedAt }
}

// origin の URL から GitHub の owner/name を取り出す。GitHub でなければ null
export const repoOf = (remote: string | null) => {
  if (remote === null) return null

  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote)

  return m ? `${m[1]}/${m[2]}` : null
}

const count = (prs: readonly MyPr[], is: (pr: MyPr) => boolean) => prs.filter(is).length

export const bandText = (summary: Summary) => {
  if (summary.error !== null) return `PR: ${summary.error}`
  if (summary.mine.length === 0 && summary.review.length === 0) return ''

  const problems = [
    ['CI 失敗', count(summary.mine, (pr) => pr.checks === 'failure')],
    ['変更要求', count(summary.mine, (pr) => pr.review === 'changes')],
    ['競合', count(summary.mine, (pr) => pr.hasConflict)],
  ] as const
  const notes = problems.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`)

  // 全角の括弧の後ろには空白を入れない
  const head = notes.length > 0 ? `PR ${summary.mine.length}（${notes.join('・')}）· ` : `PR ${summary.mine.length} · `

  return `${head}レビュー依頼 ${summary.review.length}`
}

const CHECK_LABELS: Record<NonNullable<Checks>, string> = {
  success: 'CI 成功',
  failure: 'CI 失敗',
  pending: 'CI 実行中',
}
const REVIEW_LABELS: Record<NonNullable<Review>, string> = {
  approved: '承認済み',
  changes: '変更要求',
  required: 'レビュー待ち',
}

const link = (pr: { repo: string; number: number; title: string; url: string }) =>
  `[${pr.repo}#${pr.number} ${pr.title}](${pr.url})`

const pad = (n: number) => String(n).padStart(2, '0')

const section = (title: string, lines: readonly string[]) =>
  `## ${title}（${lines.length}）\n\n${lines.length > 0 ? lines.join('\n') : 'なし'}`

export const paneMarkdown = (summary: Summary) => {
  const mine = summary.mine.map((pr) => {
    const labels = [
      pr.isDraft ? '下書き' : null,
      pr.checks === null ? null : CHECK_LABELS[pr.checks],
      pr.review === null ? null : REVIEW_LABELS[pr.review],
      pr.hasConflict ? '競合あり' : null,
    ].filter((label): label is string => label !== null)

    return `- ${[link(pr), ...labels].join(' · ')}`
  })
  const review = summary.review.map((pr) => `- ${link(pr)} · @${pr.author}`)
  const at = new Date(summary.fetchedAt)

  return [
    ...(summary.error === null ? [] : [`取得できなかった: ${summary.error}`]),
    section('自分の PR', mine),
    section('レビュー依頼', review),
    `最終更新 ${pad(at.getHours())}:${pad(at.getMinutes())}`,
  ].join('\n\n')
}

// 以下は未実装（テストを先にコミットするための仮の形）
export const currentOf = (_mine: readonly MyPr[], _repo: string | null, _branch: string): MyPr | null => null
export const mineLabel = (_summary: Summary) => ''
export const reviewLabel = (_summary: Summary) => ''
export const currentLabel = (_pr: MyPr) => ''
export const rowLabels = (_pr: MyPr): string[] => []
export const changes = (_prev: Summary | null, _next: Summary): string[] => []
export const commentPrompt = (_pr: MyPr) => ''
export const ciPrompt = (_pr: MyPr) => ''
export const reviewPrompt = (_pr: ReviewPr) => ''
