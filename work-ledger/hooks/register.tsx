import type { EngineInterface, Register } from 'claude-code'

import { bytes, fileOf, joinLines, LIMIT, localDate, resolveDir, toLines, type LedgerRecord } from './ledger'

const NOTE = 'note'

// ターンが終わるまで、ツール呼び出しをループ（メインは ''、サブエージェントは agentId）ごとに溜める
type PendingTool = { tool: string; durationMs: number; resultChars: number; isError: boolean }
const pending = new Map<string, PendingTool[]>()

// 書き込みは 1 つずつ順に行う。並んだサブエージェントが同じファイルを読み書きしても行を失わない
let queue: Promise<void> = Promise.resolve()

// 書き足す先のファイルと、その中身
async function target($: EngineInterface, base: string, size: number) {
  for (let n = 1; ; n++) {
    const path = fileOf(base, n)
    if (!(await $.fs.exists(path))) return { path, text: '' }

    const text = await $.fs.read(path)
    if (bytes(text) + size <= LIMIT) return { path, text }
  }
}

// ホームは dir が空のときだけ読む
async function ledgerDir($: EngineInterface, dir: string) {
  if (dir !== '') return resolveDir(dir, '')

  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || '.'

  return resolveDir(dir, home)
}

// $.fs には追記がないため、読んでから全体を書き直す。書き手はこのセッションだけ
async function append($: EngineInterface, dir: string, records: readonly LedgerRecord[]) {
  const now = await $.clock.now()
  const sessionId = await $.session.id()
  const lines = toLines(records, new Date(now).toISOString(), sessionId)

  const { path, text } = await target($, `${await ledgerDir($, dir)}/${localDate(now)}/${sessionId}`, bytes(lines))
  await $.fs.write(path, joinLines(text, lines))
}

async function write($: EngineInterface, dir: string, records: readonly LedgerRecord[]) {
  const previous = queue
  let release = () => {}
  queue = new Promise<void>(resolve => {
    release = resolve
  })
  await previous

  try {
    await append($, dir, records)
  } catch (error) {
    // 記録に失敗しても、作業は止めない
    await $.ui.log(`work-ledger: 記録を書けなかった: ${String(error)}`)
  } finally {
    release()
  }
}

export const register: Register = (on, options) => {
  const dir = typeof options.dir === 'string' ? options.dir.trim() : ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: NOTE, description: '作業メモを記録に残す', argumentHint: '<本文>' })

    const repo = await $.session.repo()
    await write($, dir, [{ type: 'session', event: 'start', cwd: e.cwd, repo: repo?.root ?? null }])

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await write($, dir, [{ type: 'session', event: 'end', reason: e.reason }])

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const result = await next(e)
    const durationMs = (await $.clock.now()) - startedAt

    // 引数と結果の本文は残さない。結果は文字数だけを測る
    const isDenied = result.deny !== undefined
    const call: PendingTool = {
      tool: e.tool,
      durationMs,
      resultChars: isDenied ? 0 : (result.text?.length ?? 0),
      isError: isDenied || result.isError === true,
    }
    const loop = e.agentId ?? ''
    pending.set(loop, [...(pending.get(loop) ?? []), call])

    return result
  }).catch(($, e, next) => next(e)) // 記録に失敗しても、ツールの呼び出しはそのまま通す

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    const loop = e.agentId ?? ''
    const tools = pending.get(loop) ?? []
    pending.delete(loop)

    const agent = e.agentId === undefined ? {} : { agentId: e.agentId }
    const usage = e.usage
      ? {
          input: e.usage.input_tokens,
          output: e.usage.output_tokens,
          cacheRead: e.usage.cache_read_input_tokens,
          cacheCreation: e.usage.cache_creation_input_tokens,
        }
      : null

    await write($, dir, [
      ...tools.map(call => ({ type: 'tool', turnId: e.turnId, ...agent, ...call })),
      {
        type: 'turn',
        turnId: e.turnId,
        ...agent,
        cwd: await $.session.cwd(),
        model: e.usage?.model ?? (await $.session.model()),
        durationMs: e.durationMs,
        reason: e.reason,
        usage,
      },
    ])

    return result
  })

  on('command.run', { command: NOTE }, async ($, e) => {
    const text = e.args.trim()
    if (text === '') return { text: `使い方: /${NOTE} <本文>` }

    await write($, dir, [{ type: 'note', cwd: await $.session.cwd(), text }])

    return { text: `メモを残した: ${text}` }
  }).catch(() => ({ text: 'メモを残せなかった' }))
}
