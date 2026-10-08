// gh api graphql の答えの形。値は架空のもの
const mine = (
  number: number,
  {
    checks = 'SUCCESS',
    review = null,
    mergeable = 'MERGEABLE',
    isDraft = false,
  }: { checks?: string | null; review?: string | null; mergeable?: string; isDraft?: boolean } = {},
) => ({
  number,
  title: `自分の PR ${number}`,
  url: `https://github.com/example/app/pull/${number}`,
  isDraft,
  repository: { nameWithOwner: 'example/app' },
  reviewDecision: review,
  mergeable,
  commits: { nodes: [{ commit: { statusCheckRollup: checks === null ? null : { state: checks } } }] },
})

const review = (number: number) => ({
  number,
  title: `レビュー依頼 ${number}`,
  url: `https://github.com/example/lib/pull/${number}`,
  isDraft: false,
  repository: { nameWithOwner: 'example/lib' },
  author: { login: 'alice' },
})

export const RESPONSE = {
  data: {
    mine: {
      issueCount: 4,
      nodes: [
        mine(1),
        mine(2, { checks: 'FAILURE', review: 'CHANGES_REQUESTED' }),
        mine(3, { checks: 'PENDING', review: 'REVIEW_REQUIRED', mergeable: 'CONFLICTING' }),
        mine(4, { checks: null, review: 'APPROVED', isDraft: true }),
      ],
    },
    review: { issueCount: 1, nodes: [review(7)] },
  },
}

export const EMPTY = { data: { mine: { issueCount: 0, nodes: [] }, review: { issueCount: 0, nodes: [] } } }
