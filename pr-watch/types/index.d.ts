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

declare module 'claude-code' {
  interface PluginState {
    'pr-watch': { summary: Summary | null }
  }
}
