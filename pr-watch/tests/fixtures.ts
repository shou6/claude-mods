// gh api graphql の答えの形。値は架空のもの
type Mine = {
  checks?: string | null
  review?: string | null
  mergeable?: string
  isDraft?: boolean
  unresolved?: number
  resolved?: number
}

export const mine = (
  number: number,
  {
    checks = 'SUCCESS',
    review = null,
    mergeable = 'MERGEABLE',
    isDraft = false,
    unresolved = 0,
    resolved = 0,
  }: Mine = {},
) => ({
  number,
  title: `自分の PR ${number}`,
  url: `https://github.com/example/app/pull/${number}`,
  isDraft,
  headRefName: `feat/pr-${number}`,
  repository: { nameWithOwner: 'example/app' },
  reviewDecision: review,
  mergeable,
  commits: { nodes: [{ commit: { statusCheckRollup: checks === null ? null : { state: checks } } }] },
  reviewThreads: {
    nodes: [
      ...Array.from({ length: unresolved }, () => ({ isResolved: false })),
      ...Array.from({ length: resolved }, () => ({ isResolved: true })),
    ],
  },
})

export const review = (number: number) => ({
  number,
  title: `レビュー依頼 ${number}`,
  url: `https://github.com/example/lib/pull/${number}`,
  isDraft: false,
  headRefName: `feat/lib-${number}`,
  repository: { nameWithOwner: 'example/lib' },
  author: { login: 'alice' },
})

export const response = (mineNodes: unknown[], reviewNodes: unknown[]) => ({
  data: { mine: { nodes: mineNodes }, review: { nodes: reviewNodes } },
})

export const RESPONSE = response(
  [
    mine(1),
    mine(2, { checks: 'FAILURE', review: 'CHANGES_REQUESTED', unresolved: 2, resolved: 1 }),
    mine(3, { checks: 'PENDING', review: 'REVIEW_REQUIRED', mergeable: 'CONFLICTING' }),
    mine(4, { checks: null, review: 'APPROVED', isDraft: true }),
  ],
  [review(7)],
)

export const EMPTY = response([], [])
