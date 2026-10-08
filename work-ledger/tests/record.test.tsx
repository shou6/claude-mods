import { expect, mock, test } from 'claude-code/testing'

import { COMPLETE, DIR, engine, NOW, START, TODAY, TS, USAGE } from './engine'

const OPTIONS = { options: { dir: DIR } }
const FILE = `${TODAY}/s1.jsonl`

test('セッションが始まると session の start を書く', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.session.start(START)

  expect(records(FILE)).toEqual([
    {
      v: 1,
      type: 'session',
      ts: TS,
      sessionId: 's1',
      event: 'start',
      cwd: START.cwd,
      repo: null,
    },
  ])
})

test('ターンが終わると turn を 1 行書き、usage を短い名前にする', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.complete({ ...COMPLETE, usage: USAGE })

  expect(records(FILE)).toEqual([
    {
      v: 1,
      type: 'turn',
      ts: TS,
      sessionId: 's1',
      turnId: 't1',
      cwd: START.cwd,
      model: 'claude-opus-5-5',
      durationMs: 1000,
      reason: 'answer',
      usage: { input: 1200, output: 3400, cacheRead: 82000, cacheCreation: 5100 },
    },
  ])
})

test('時刻はローカル時刻に UTC との差を付けて書き、読み戻すと同じ時刻になる', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.complete(COMPLETE)

  const ts = String(records(FILE)[0]?.ts)
  expect(ts).toBe(TS)
  expect(Date.parse(ts)).toBe(NOW)
})

test('usage がないターンは usage を null にし、モデルはセッションのものを書く', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.complete({ ...COMPLETE, reason: 'aborted', isAborted: true })

  expect(records(FILE)[0]).toMatchObject({ type: 'turn', model: 'claude-sonnet-5-5', reason: 'aborted', usage: null })
})

test('ターン中のツール呼び出しは、ターンの終わりに tool としてまとめて書く', OPTIONS, async ($, on) => {
  const { records } = engine(on, { results: { Read: 'x'.repeat(500), Bash: 'ok' } })
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)

  // ターンが終わるまでは書かない
  expect(records(FILE)).toEqual([])

  await $.turn.complete({ ...COMPLETE, usage: USAGE })

  expect(records(FILE).map(r => r.type)).toEqual(['tool', 'tool', 'turn'])
  expect(records(FILE)[0]).toEqual({
    v: 1,
    type: 'tool',
    ts: TS,
    sessionId: 's1',
    turnId: 't1',
    tool: 'Read',
    path: 'a.ts',
    durationMs: expect.any(Number),
    resultChars: 500,
    isError: false,
  })
  expect(records(FILE)[1]).toMatchObject({ tool: 'Bash', resultChars: 2 })
  expect(records(FILE)[1]).not.toHaveProperty('path')
})

test('tool の時刻は、ターンの終わりではなく呼び出しを始めた時刻にする', OPTIONS, async ($, on) => {
  const { records, clock } = engine(on)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as never)
  await clock.set(NOW + 60_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await clock.set(NOW + 120_000)
  await $.turn.complete(COMPLETE)

  expect(records(FILE).map(r => Date.parse(String(r.ts)) - NOW)).toEqual([0, 60_000, 120_000])
})

test('Read、Edit、Write はファイルパスを path に書き、ほかのツールの引数は書かない', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.tool.call({ tool: 'Read', file_path: 'D:/work/sample/a.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'D:/work/sample/b.ts', old_string: 'x', new_string: 'y' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'D:/work/sample/c.ts', content: 'z' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'D:/work/sample' } as never)
  await $.turn.complete(COMPLETE)

  expect(records(FILE).map(r => [r.tool, r.path])).toEqual([
    ['Read', 'D:/work/sample/a.ts'],
    ['Edit', 'D:/work/sample/b.ts'],
    ['Write', 'D:/work/sample/c.ts'],
    ['Grep', undefined],
    [undefined, undefined],
  ])
})

test('ターンを始めたプロンプトの先頭 100 文字を turn の prompt に書く', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.start({ text: `${'あ'.repeat(99)}いう`, turnId: 't1' })
  await $.turn.complete(COMPLETE)

  expect(records(FILE)[0]?.prompt).toBe(`${'あ'.repeat(99)}い`)
})

test('prompt は改行と連続する空白を 1 つの空白にまとめる', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.start({ text: '  README を\n\n  直して\t ください  ', turnId: 't1' })
  await $.turn.complete(COMPLETE)

  expect(records(FILE)[0]?.prompt).toBe('README を 直して ください')
})

test('promptChars で残す文字数を変える', { options: { dir: DIR, promptChars: 5 } }, async ($, on) => {
  const { records } = engine(on)
  await $.turn.start({ text: 'abcdefgh', turnId: 't1' })
  await $.turn.complete(COMPLETE)

  expect(records(FILE)[0]?.prompt).toBe('abcde')
})

test('promptChars が 0 ならプロンプトを書かない', { options: { dir: DIR, promptChars: 0 } }, async ($, on) => {
  const { records, fs } = engine(on)
  await $.turn.start({ text: 'SECRET-PROMPT', turnId: 't1' })
  await $.turn.complete(COMPLETE)

  expect(records(FILE)[0]).not.toHaveProperty('prompt')
  expect(fs.get(FILE)).not.toContain('SECRET-PROMPT')
})

test('プロンプトのないターンとサブエージェントのターンには prompt を書かない', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete({ ...COMPLETE, turnId: 't1' })
  await $.turn.complete({ ...COMPLETE, turnId: 'sub', agentId: 'a1' })

  expect(records(FILE)[0]).not.toHaveProperty('prompt')
  expect(records(FILE)[1]).not.toHaveProperty('prompt')
})

test('prompt は同じ turnId のターンにだけ書く', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.turn.start({ text: '最初の依頼', turnId: 't1' })
  await $.turn.complete({ ...COMPLETE, turnId: 't1' })
  await $.turn.complete({ ...COMPLETE, turnId: 't2' })

  expect(records(FILE).map(r => r.prompt)).toEqual(['最初の依頼', undefined])
})

test('書いたツール呼び出しは次のターンに持ち越さない', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as never)
  await $.turn.complete({ ...COMPLETE, turnId: 't1' })
  await $.turn.complete({ ...COMPLETE, turnId: 't2' })

  expect(records(FILE).map(r => `${r.type}:${r.turnId}`)).toEqual(['tool:t1', 'turn:t1', 'turn:t2'])
})

test('サブエージェントのツール呼び出しは、そのサブエージェントのターンに結び付ける', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as never)
  await $.turn.complete({ ...COMPLETE, turnId: 'sub', agentId: 'a1' })

  expect(records(FILE).map(r => [r.type, r.turnId, r.agentId, r.tool])).toEqual([
    ['tool', 'sub', 'a1', 'Grep'],
    ['turn', 'sub', 'a1', undefined],
  ])

  await $.turn.complete({ ...COMPLETE, turnId: 'main' })

  expect(records(FILE).slice(2).map(r => [r.type, r.turnId, r.tool])).toEqual([
    ['tool', 'main', 'Read'],
    ['turn', 'main', undefined],
  ])
})

test('エラーになったツール呼び出しと拒否された呼び出しは isError を true にする', OPTIONS, async ($, on) => {
  // 先に登録したフックが上に立ち、engine の答えより先に答える
  on('tool.call', { tool: 'Bash' }, () => ({ result: {}, text: 'failed', isError: true }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ deny: 'no' }))
  const { records } = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'false' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'a', content: 'b' } as never)
  await $.turn.complete(COMPLETE)

  expect(records(FILE).slice(0, 2).map(r => [r.tool, r.isError])).toEqual([
    ['Bash', true],
    ['Write', true],
  ])
})

test('既存の行を消さずに足す', OPTIONS, async ($, on) => {
  const old = JSON.stringify({ v: 1, type: 'note', text: '前のメモ' })
  const { records } = engine(on, { files: { [FILE]: `${old}\n` } })
  await $.turn.complete(COMPLETE)

  expect(records(FILE).map(r => r.type)).toEqual(['note', 'turn'])
})

test('日付が変わると新しい日付のフォルダに書く', OPTIONS, async ($, on) => {
  const { records, clock } = engine(on)
  await $.turn.complete({ ...COMPLETE, turnId: 't1' })
  await clock.set(new Date(2026, 9, 9, 0, 5, 0).getTime())
  await $.turn.complete({ ...COMPLETE, turnId: 't2' })

  expect(records(FILE).map(r => r.turnId)).toEqual(['t1'])
  expect(records(`${DIR}/2026-10-09/s1.jsonl`).map(r => r.turnId)).toEqual(['t2'])
})

test('/clear でセッションの id が変わると、新しい id のファイルに書く', OPTIONS, async ($, on) => {
  const { records, session } = engine(on)
  await $.turn.complete({ ...COMPLETE, turnId: 't1' })
  session.id = 's2'
  await $.turn.complete({ ...COMPLETE, turnId: 't2' })

  expect(records(FILE).map(r => r.turnId)).toEqual(['t1'])
  expect(records(`${TODAY}/s2.jsonl`)).toEqual([expect.objectContaining({ sessionId: 's2', turnId: 't2' })])
})

test('ファイルが 3 MiB を超えたら、続きを番号付きのファイルに書く', OPTIONS, async ($, on) => {
  const big = `${JSON.stringify({ v: 1, type: 'note', text: 'x'.repeat(3 * 1024 * 1024) })}\n`
  const { records, fs } = engine(on, { files: { [FILE]: big } })
  await $.turn.complete(COMPLETE)

  expect(fs.get(FILE)).toBe(big)
  expect(records(`${TODAY}/s1-2.jsonl`).map(r => r.type)).toEqual(['turn'])
})

test('セッションが終わると session の end を理由つきで書く', OPTIONS, async ($, on) => {
  const { records } = engine(on)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: {} } as never)

  expect(records(FILE)).toEqual([expect.objectContaining({ type: 'session', event: 'end', reason: 'prompt_input_exit' })])
})

test('ファイルパスのほかのツールの引数、結果の本文、返答の本文は記録に含めない', OPTIONS, async ($, on) => {
  const { fs } = engine(on, { results: { Read: 'SECRET-RESULT' } })
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', offset: 'SECRET-OFFSET' } as never)
  await $.tool.call({ tool: 'Bash', command: 'SECRET-COMMAND' } as never)
  await $.turn.complete({ ...COMPLETE, answer: 'SECRET-ANSWER' })

  const text = fs.get(FILE) ?? ''
  expect(text).not.toContain('SECRET-RESULT')
  expect(text).not.toContain('SECRET-OFFSET')
  expect(text).not.toContain('SECRET-COMMAND')
  expect(text).not.toContain('SECRET-ANSWER')
})

test('dir が空なら HOME の下の .claude/work-ledger に書く', async ($, on) => {
  const { records } = engine(on)
  mock.env(on, { HOME: '/home/test' })
  await $.turn.complete(COMPLETE)

  expect(records('/home/test/.claude/work-ledger/2026-10-08/s1.jsonl')).toHaveLength(1)
})

test('HOME がなければ USERPROFILE の下に書く', async ($, on) => {
  const { records } = engine(on)
  mock.env(on, { USERPROFILE: 'C:/Users/test' })
  await $.turn.complete(COMPLETE)

  expect(records('C:/Users/test/.claude/work-ledger/2026-10-08/s1.jsonl')).toHaveLength(1)
})
