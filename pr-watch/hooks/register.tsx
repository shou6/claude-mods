import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { bandText, paneMarkdown, parse, queryOf, repoOf } from './prs'

const COMMAND = 'prs'
const PANE = 'prs'

const summary = atom({ plugin: 'pr-watch', key: 'summary' } as const, null)

type Config = { intervalMs: number; isRepoOnly: boolean }

// gh で取り直して $.state に置く。帯と Pane はそれを読んで描き直す
async function refresh($: EngineInterface, config: Config) {
  const now = await $.clock.now()

  let repo: string | null = null
  if (config.isRepoOnly) {
    repo = repoOf((await $.session.repo())?.remote ?? null)
    // GitHub のリポジトリでなければ、取るものがない
    if (repo === null) {
      await update($, summary, () => ({ mine: [], review: [], error: null, fetchedAt: now }))
      return
    }
  }

  try {
    const result = await $.process.run(['gh', 'api', 'graphql', '-f', `query=${queryOf(repo)}`])
    const next =
      result.exitCode === 0
        ? parse(result.stdout, now)
        : {
            mine: [],
            review: [],
            error: result.stderr.split(/\r?\n/)[0]?.trim() || `gh が ${result.exitCode} で終わった`,
            fetchedAt: now,
          }
    await update($, summary, () => next)
  } catch {
    await update($, summary, () => ({
      mine: [],
      review: [],
      error: 'gh が見つからない',
      fetchedAt: now,
    }))
  }
}

export const register: Register = (on, options) => {
  const minutes = typeof options.intervalMinutes === 'number' ? Math.max(1, options.intervalMinutes) : 5
  const config: Config = { intervalMs: minutes * 60_000, isRepoOnly: options.scope === 'repo' }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: '自分の PR とレビュー依頼の一覧を開く',
    })

    // 起動を待たせないよう、最初の取得もタイマーから行う
    $.clock.after(0, () => refresh($, config))
    $.clock.every(config.intervalMs, () => refresh($, config))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($) => {
    await refresh($, config)
    await $.ui.open({ id: PANE, title: 'PR', closeOnEscape: true })

    return {}
  }).catch(() => ({ text: 'PR の一覧を開けなかった' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // ほかの Mod と Claude Code が帯に描くものは、自分の行の下に残す
    const rest = await next(e)
    const now = await read($, summary)
    const text = now === null || e.props.hasSurvey ? '' : bandText(now)
    if (text === '') return rest

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text color={now?.error === null ? undefined : 'warning'} wrap="truncate-end">
          {text}
        </Text>
        {rest}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await read($, summary)
    const { Markdown, Text } = $.ui.resolve(e)

    return now === null ? <Text dimColor>取得中…</Text> : <Markdown text={paneMarkdown(now)} />
  })
}
