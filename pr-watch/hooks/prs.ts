// CI の結果。statusCheckRollup がなければ null
export type Checks = 'success' | 'failure' | 'pending' | null

// レビューの判定。reviewDecision がなければ null
export type Review = 'approved' | 'changes' | 'required' | null

export type MyPr = {
  repo: string
  number: number
  title: string
  url: string
  isDraft: boolean
  checks: Checks
  review: Review
  hasConflict: boolean
}

export type ReviewPr = { repo: string; number: number; title: string; url: string; author: string }

export type Summary = { mine: MyPr[]; review: ReviewPr[]; error: string | null; fetchedAt: number }

export const queryOf = (_repo: string | null): string => ''

export const parse = (_stdout: string, _fetchedAt: number): Summary => ({ mine: [], review: [], error: null, fetchedAt: 0 })

export const repoOf = (_remote: string | null): string | null => null

export const bandText = (_summary: Summary): string => ''

export const paneMarkdown = (_summary: Summary): string => ''
