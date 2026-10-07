import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Meta, Usage } from '../types'

const usage = atom({ plugin: 'status-band', key: 'usage' } as const, null)
const meta = atom({ plugin: 'status-band', key: 'meta' } as const, null)

// 帯に出すレート制限。セッション（5 時間）と週間（7 日）だけ
const RATE_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

// ctx・5h・7d のバーはどれも同じ幅
const CELLS = 8

// リセットまでの時間を描き直す間隔
const TICK_MS = 60_000

const level = (percent: number) => (percent < 60 ? 'success' : percent < 80 ? 'warning' : 'error')

const filledCells = (percent: number) => Math.min(CELLS, Math.max(0, Math.round((percent / 100) * CELLS)))

// claude-opus-5-5 を Opus 5.5 にする。形が違えばそのまま返す
const formatModel = (model: string) => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|\[|$)/.exec(model)
  if (!m) return model

  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)

  return `${family} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

// リセットまでの残り。1 時間未満は分、1 日未満は時間と分、それ以上は日
const formatReset = (resetsAt: string | undefined, now: number) => {
  const ms = resetsAt === undefined ? NaN : Date.parse(resetsAt) - now
  if (!(ms > 0)) return ''

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return ` ${minutes}m`
  if (minutes < 24 * 60) return ` ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`

  return ` ${Math.floor(minutes / (24 * 60))}d`
}

// モデル名を取り直す。取れなければ前の値を残す
async function refreshMeta($: EngineInterface) {
  try {
    const model = await $.session.model()
    await update($, meta, () => ({ model }))
  } catch {
    // 取得に失敗しても帯の残りは描く
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    await refreshMeta($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now: Usage = {
      percent: e.context.percent ?? null,
      rateLimits: e.rateLimits
        .filter(({ kind }) => kind in RATE_LABELS)
        .map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    }
    await update($, usage, () => now)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // サブエージェントのターンでは取り直さない
    if (e.agentId === undefined) await refreshMeta($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // ほかの Mod と Claude Code が帯に描くものは、自分の行の下に残す
    const rest = await next(e)
    const now = await read($, usage)

    if (e.props.hasSurvey || now === null) return rest

    const info = await read($, meta)
    const clock = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    // ラベル、バー、数値をひとまとまりにする
    const gauge = (label: string, percent: number | null, tail: string) => {
      const filled = percent === null ? 0 : filledCells(percent)

      return (
        <Box>
          <Text dimColor>{`${label} `}</Text>
          {percent !== null && filled > 0 && <Text color={level(percent)}>{'▰'.repeat(filled)}</Text>}
          {filled < CELLS && <Text dimColor>{'▱'.repeat(CELLS - filled)}</Text>}
          <Text>{` ${percent ?? '--'}%${tail}`}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          {info !== null && <Text bold>{formatModel(info.model)}</Text>}
          {info !== null && <Text dimColor> │ </Text>}
          <Box columnGap={3}>
            {gauge('ctx', now.percent, '')}
            {now.rateLimits.map(one =>
              gauge(RATE_LABELS[one.kind]!, one.percentUsed, formatReset(one.resetsAt, clock)),
            )}
          </Box>
        </Box>
        {rest}
      </Box>
    )
  })
}
