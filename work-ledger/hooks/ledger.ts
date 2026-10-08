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

// 記録の時刻。ローカル時刻に UTC との差を付けた ISO 8601（2026-10-08T12:00:00.000+09:00）
export const localIso = (ms: number) => {
  const d = new Date(ms)
  const offset = -d.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  const millis = String(d.getMilliseconds()).padStart(3, '0')

  return `${localDate(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${millis}${zone}`
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

// ファイルパスを記録するツール。ほかのツールの引数は残さない
export const PATH_TOOLS: readonly string[] = ['Read', 'Edit', 'Write']

// プロンプトの先頭。改行と連続する空白を 1 つの空白にまとめてから、文字数で切る
export const promptHead = (text: string, chars: number) =>
  Array.from(text.replace(/\s+/g, ' ').trim())
    .slice(0, Math.max(0, chars))
    .join('')
