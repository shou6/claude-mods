import { expect, test } from 'claude-code/testing'

import { DIR, engine, NOW, START, TODAY } from './engine'

const OPTIONS = { options: { dir: DIR } }
const FILE = `${TODAY}/s1.jsonl`

test('セッションが始まると /note を登録する', OPTIONS, async ($, on) => {
  // 先に登録したフックが上に立ち、engine の答えより先に答える
  const names: string[] = []
  on('command.register', { name: 'note' }, (_$, e) => {
    names.push(e.name)

    return { value: { command: e.name } }
  })
  engine(on)
  await $.session.start(START)

  expect(names).toContain('note')
})

test('/note の本文を note として書き、書いたことを返す', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.session.start(START)
  const result = await $.command.run({ command: 'note', args: '  認証まわりの調査を終えた  ' } as never)

  expect(records(FILE).at(-1)).toEqual({
    v: 1,
    type: 'note',
    ts: new Date(NOW).toISOString(),
    sessionId: 's1',
    cwd: START.cwd,
    text: '認証まわりの調査を終えた',
  })
  expect(result.text).toBe('メモを残した: 認証まわりの調査を終えた')
})

test('/note の本文が空なら書かずに使い方を返す', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.session.start(START)
  const result = await $.command.run({ command: 'note', args: '   ' } as never)

  expect(records(FILE).filter(r => r.type === 'note')).toEqual([])
  expect(result.text).toBe('使い方: /note <本文>')
})
