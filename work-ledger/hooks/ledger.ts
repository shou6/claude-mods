// 記録の形式の版。項目の意味を変えたら上げる
export const VERSION = 1

// $.fs の読み書きは 4 MiB まで。余裕を見て 3 MiB で次のファイルに移る
export const LIMIT = 3 * 1024 * 1024

export type LedgerRecord = { type: string } & Record<string, unknown>

const pad = (n: number) => String(n).padStart(2, '0')

// 日付のフォルダはローカルの日付で決める
export const localDate = (ms: number) => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const bytes = (text: string) => new TextEncoder().encode(text).length

// userConfig の dir、なければホームの下の .claude/work-ledger。区切りは / にそろえる
export const resolveDir = (dir: string, home: string) =>
  (dir !== '' ? dir : `${home}/.claude/work-ledger`).replace(/\\/g, '/').replace(/\/+$/, '')

// 3 MiB を超えたら <id>-2.jsonl、<id>-3.jsonl と進む
export const fileOf = (base: string, n: number) => (n === 1 ? `${base}.jsonl` : `${base}-${n}.jsonl`)

// 共通の項目を前に付けて、1 件 1 行の JSONL にする
export const toLines = (records: readonly LedgerRecord[], ts: string, sessionId: string) =>
  records.map(({ type, ...rest }) => `${JSON.stringify({ v: VERSION, type, ts, sessionId, ...rest })}\n`).join('')

// 既存の中身の末尾に改行がなければ足してからつなぐ
export const joinLines = (text: string, lines: string) =>
  (text === '' || text.endsWith('\n') ? text : `${text}\n`) + lines
