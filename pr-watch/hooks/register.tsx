import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Section } from '../types'
import {
  changes,
  ciPrompt,
  commentPrompt,
  currentLabel,
  currentOf,
  failed,
  mineLabel,
  parse,
  queryOf,
  repoOf,
  reviewLabel,
  reviewPrompt,
  rowLabels,
} from './prs'

const COMMAND = 'prs'
const PANE = 'prs'

const summary = atom({ plugin: 'pr-watch', key: 'summary' } as const, null)
const section = atom({ plugin: 'pr-watch', key: 'section' } as const, 'mine' as Section)

type Config = { intervalMs: number; isRepoOnly: boolean }

const pad = (n: number) => String(n).padStart(2, '0')

// 今いるブランチの名前。git でなければ空
async function branchOf($: EngineInterface) {
  try {
    const result = await $.process.run(['git', 'branch', '--show-current'])

    return result.exitCode === 0 ? result.stdout.trim() : ''
  } catch {
    return ''
  }
}

// gh で取り直して $.state に置く。帯と Pane はそれを読んで描き直す
async function refresh($: EngineInterface, config: Config) {
  const now = await $.clock.now()
  const prev = await read($, summary)
  const repo = repoOf((await $.session.repo())?.remote ?? null)

  // 今いるリポジトリに絞るのに GitHub のリポジトリでなければ、取るものがない
  if (config.isRepoOnly && repo === null) {
    await update($, summary, () => ({ mine: [], review: [], current: null, error: null, fetchedAt: now }))
    return
  }

  let next
  try {
    const query = queryOf(config.isRepoOnly ? repo : null)
    const result = await $.process.run(['gh', 'api', 'graphql', '-f', `query=${query}`])
    next =
      result.exitCode === 0
        ? parse(result.stdout, now)
        : failed(result.stderr.split(/\r?\n/)[0]?.trim() || `gh が ${result.exitCode} で終わった`, now)
  } catch {
    next = failed('gh が見つからない', now)
  }

  if (next.error === null) next = { ...next, current: currentOf(next.mine, repo, await branchOf($)) }
  const fetched = next
  await update($, summary, () => fetched)

  for (const message of changes(prev, fetched)) $.ui.toast(message)
}

// 一覧の Pane を、指定した節を先頭にして開く
async function openPane($: EngineInterface, first: Section) {
  await update($, section, () => first)
  await $.ui.open({ id: PANE, title: 'PR', closeOnEscape: true, focus: true })
}

export const register: Register = (on, options) => {
  const minutes = typeof options.intervalMinutes === 'number' ? Math.max(1, options.intervalMinutes) : 5
  const config: Config = { intervalMs: minutes * 60_000, isRepoOnly: options.scope === 'repo' }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: '自分の PR とレビュー依頼の一覧を開く' })

    // 起動を待たせないよう、最初の取得もタイマーから行う
    $.clock.after(0, () => refresh($, config))
    $.clock.every(config.intervalMs, () => refresh($, config))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await refresh($, config)
    await openPane($, 'mine')

    return {}
  }).catch(() => ({ text: 'PR の一覧を開けなかった' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // ほかの Mod と Claude Code が帯に描くものは、自分の行の下に残す
    const rest = await next(e)
    const now = await read($, summary)
    if (now === null || e.props.hasSurvey) return rest

    const { Box, Button, Text } = $.ui.resolve(e)

    if (now.error !== null) {
      return (
        <Box flexDirection="column">
          <Text color="warning" wrap="truncate-end">
            {`PR: ${now.error}`}
          </Text>
          {rest}
        </Box>
      )
    }

    if (now.mine.length === 0 && now.review.length === 0) return rest

    // 件数のボタンを押すと、その節を先頭にした一覧を開く
    return (
      <Box flexDirection="column">
        <Box columnGap={2}>
          <Button key="mine" label={mineLabel(now)} hotkey="p" plain onPress={() => openPane($, 'mine')} />
          <Button key="review" label={reviewLabel(now)} hotkey="r" plain onPress={() => openPane($, 'review')} />
          {now.current !== null && <Text dimColor>│</Text>}
          {now.current !== null && <Text wrap="truncate-end">{currentLabel(now.current)}</Text>}
        </Box>
        {rest}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await read($, summary)
    const first = await read($, section)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)

    if (now === null) return <Text dimColor>取得中…</Text>

    const mine = (
      <Box flexDirection="column">
        <Text bold>{`自分の PR（${now.mine.length}）`}</Text>
        {now.mine.length === 0 && <Text dimColor>なし</Text>}
        {now.mine.map(pr => {
          const id = `${pr.repo}#${pr.number}`
          const hasComments = pr.unresolved > 0 || pr.review === 'changes'

          return (
            <Box flexDirection="column">
              <Markdown key={`row:${id}`} text={[`[${id} ${pr.title}](${pr.url})`, ...rowLabels(pr)].join(' · ')} />
              <Box columnGap={2}>
                {hasComments && (
                  <Button
                    key={`comment:${id}`}
                    label="コメントに対応"
                    onPress={() => $.prompt.fill({ text: commentPrompt(pr) })}
                  />
                )}
                {pr.checks === 'failure' && (
                  <Button key={`ci:${id}`} label="CI を直す" onPress={() => $.prompt.fill({ text: ciPrompt(pr) })} />
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )

    const review = (
      <Box flexDirection="column">
        <Text bold>{`レビュー依頼（${now.review.length}）`}</Text>
        {now.review.length === 0 && <Text dimColor>なし</Text>}
        {now.review.map(pr => {
          const id = `${pr.repo}#${pr.number}`

          return (
            <Box flexDirection="column">
              <Markdown key={`row:${id}`} text={`[${id} ${pr.title}](${pr.url}) · @${pr.author}`} />
              <Box>
                <Button
                  key={`review:${id}`}
                  label="レビューする"
                  onPress={() => $.prompt.fill({ text: reviewPrompt(pr) })}
                />
              </Box>
            </Box>
          )
        })}
      </Box>
    )

    const at = new Date(now.fetchedAt)

    return (
      <Box flexDirection="column" rowGap={1}>
        {now.error !== null && <Text color="warning">{`取得できなかった: ${now.error}`}</Text>}
        {first === 'review' ? review : mine}
        {first === 'review' ? mine : review}
        <Text dimColor>{`最終更新 ${pad(at.getHours())}:${pad(at.getMinutes())}`}</Text>
      </Box>
    )
  })
}
