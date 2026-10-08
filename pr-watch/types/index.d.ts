// CI の結果。statusCheckRollup がなければ null
export type Checks = 'success' | 'failure' | 'pending' | null

// レビューの判定。reviewDecision がなければ null
export type Review = 'approved' | 'changes' | 'required' | null

export type MyPr = {
  repo: string
  number: number
  title: string
  url: string
  branch: string
  isDraft: boolean
  checks: Checks
  review: Review
  hasConflict: boolean
  // 解決していないレビューコメントのスレッドの数
  unresolved: number
}

export type ReviewPr = { repo: string; number: number; title: string; url: string; author: string }

export type Summary = {
  mine: MyPr[]
  review: ReviewPr[]
  // 今いるブランチの PR。自分の PR の中になければ null
  current: MyPr | null
  error: string | null
  fetchedAt: number
}

// 一覧の Pane で先頭に出す節
export type Section = 'mine' | 'review'

declare module 'claude-code' {
  interface PluginState {
    'pr-watch': { summary: Summary | null; section: Section }
  }
}
