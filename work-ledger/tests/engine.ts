import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

// 2026-10-08 12:00（ローカル時刻）。日付のフォルダはローカルの日付で決まる
export const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime()

// 記録の時刻はローカル時刻に UTC との差を付けた ISO 8601（日本なら 2026-10-08T12:00:00.000+09:00）
const offset = -new Date(NOW).getTimezoneOffset()
const hhmm = `${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`
export const TS = `2026-10-08T12:00:00.000${offset < 0 ? '-' : '+'}${hhmm}`

export const DIR = '/ledger'
export const TODAY = `${DIR}/2026-10-08`

export const START = { cwd: 'D:/work/sample', surface: 'terminal', isInteractive: true } as const

export const COMPLETE = {
  answer: '',
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  durationMs: 1000,
} as const

export const USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 1200,
  output_tokens: 3400,
  cache_read_input_tokens: 82000,
  cache_creation_input_tokens: 5100,
} as const

type Options = {
  files?: Record<string, string>
  // ツール名ごとに、モデルが読む結果の本文
  results?: Record<string, string>
}

// エンジンはパスを OS の絶対パスにしてから渡す（Windows では D:\ledger\...）。
// 区切りを / にそろえ、ドライブ名を外して比べる
const normalize = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/)/, '')

// プラグインの下でエンジンの代わりに答える。ファイルはメモリーに持つ
export const engine = (on: On, { files = {}, results = {} }: Options = {}) => {
  const stored = new Map(Object.entries(files).map(([path, text]) => [normalize(path), text]))
  const fs = {
    has: (path: string) => stored.has(normalize(path)),
    get: (path: string) => stored.get(normalize(path)),
    set: (path: string, text: string) => stored.set(normalize(path), text),
  }
  const session = { id: 's1' }
  const clock = mock.clock(on, { now: NOW })

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  // $ の呼び出しの代役は { value } で答える
  on('session.id', () => ({ value: session.id }))
  on('session.cwd', () => ({ value: START.cwd }))
  on('session.repo', () => ({ value: null }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('fs.exists', (_$, e) => ({ value: fs.has(e.path) }))
  on('fs.read', (_$, e) => ({ value: fs.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    fs.set(e.path, e.text)

    return { value: undefined }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', (_$, e) => ({ result: {}, text: results[e.tool] ?? '' }) as never)

  // JSONL を 1 行ずつ読む。ファイルがなければ空
  const records = (path: string) =>
    (fs.get(path) ?? '')
      .split('\n')
      .filter(line => line !== '')
      .map(line => JSON.parse(line) as Record<string, unknown>)

  return { fs, session, clock, records }
}
