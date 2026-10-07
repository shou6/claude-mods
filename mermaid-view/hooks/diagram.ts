// 返答を mermaid のブロックとそれ以外に分け、図を色の役割付きの行にする。Claude Code の API には触れない

export type Part = { kind: 'markdown'; text: string } | { kind: 'mermaid'; source: string; raw: string }
export type Role = 'text' | 'border' | 'line' | 'arrow'
export type Segment = { text: string; role?: Role }
export type Diagram = { lines: Segment[][]; cut: number }
export type RenderFn = (source: string, options: { useAscii?: boolean; colorMode?: 'html'; theme?: Record<string, string> }) => string
export type DrawOptions = { ascii: boolean; columns?: number }

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/

// 返答を mermaid のブロックと前後の文章に分ける。閉じていないブロックと、ほかの囲みの中は文章のまま
export const splitMessage = (text: string): Part[] => {
  const lines = text.split('\n')
  const parts: Part[] = []
  let markdown: string[] = []

  const flush = () => {
    if (markdown.length > 0) parts.push({ kind: 'markdown', text: markdown.join('\n') })
    markdown = []
  }

  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]!)
    if (!open) {
      markdown.push(lines[i]!)
      continue
    }

    const marker = open[1]!
    const closing = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
    let end = i + 1
    while (end < lines.length && !closing.test(lines[end]!)) end++

    const block = lines.slice(i, end + 1)
    if (end < lines.length && open[2]!.toLowerCase() === 'mermaid') {
      flush()
      parts.push({ kind: 'mermaid', source: block.slice(1, -1).join('\n'), raw: block.join('\n') })
    } else {
      markdown.push(...block)
    }
    i = end
  }
  flush()

  return parts
}

// 端末で 2 桁を占める文字（東アジアの全角と絵文字）
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u

const charWidth = (char: string) => (WIDE.test(char) ? 2 : 1)

export const displayWidth = (text: string) => [...text].reduce((sum, char) => sum + charWidth(char), 0)

// 先頭の空行とコメント（%%）を飛ばした、図の種類を書いた行の位置
const headerIndex = (lines: string[]) => lines.findIndex(line => line.trim() !== '' && !line.trim().startsWith('%%'))

// 縦向きを横向きにする対応。上下を左右に置き換えるだけなので、矢印の向きと意味は変わらない
const TURN: Record<string, string> = { TD: 'LR', TB: 'LR', BT: 'RL' }

const turnFlowchart = (lines: string[], at: number) => {
  const m = /^(\s*(?:graph|flowchart))(?:\s+(TD|TB|BT|LR|RL))?(?=\s|;|$)/.exec(lines[at]!)
  if (!m) return undefined
  const direction = m[2] ?? 'TD'
  if (!TURN[direction]) return undefined

  const turned = [...lines]
  turned[at] = `${m[1]} ${TURN[direction]}${lines[at]!.slice(m[0].length)}`

  return turned.join('\n')
}

// 状態遷移図の一番外側の direction を横向きにする。書いていなければ、図の種類の行の次に足す
const turnState = (lines: string[], at: number) => {
  let depth = 0
  for (let i = at + 1; i < lines.length; i++) {
    const m = /^(\s*direction\s+)(TB|TD|BT|LR|RL)\s*$/.exec(lines[i]!)
    if (depth === 0 && m) {
      const turned = TURN[m[2]!]
      if (!turned) return undefined
      const out = [...lines]
      out[i] = `${m[1]}${turned}`

      return out.join('\n')
    }
    depth += (lines[i]!.match(/\{/g) ?? []).length - (lines[i]!.match(/\}/g) ?? []).length
  }

  return [...lines.slice(0, at + 1), 'direction LR', ...lines.slice(at + 1)].join('\n')
}

const isState = (header: string) => /^\s*stateDiagram(?:-v2)?\s*$/.test(header)

// 状態遷移図の [*]（開始と終了）を含む遷移を省く。遷移が 1 つも残らなければ元のまま
const stripTerminals = (lines: string[]) => {
  const kept = lines.filter(line => !(line.includes('[*]') && line.includes('-->')))
  if (!kept.some(line => line.includes('-->'))) return lines

  return kept
}

// 描く元の図と、縦向きの図なら横向きにした候補を作る
export const prepare = (source: string): { source: string; alt?: string } => {
  let lines = source.split('\n')
  const at = headerIndex(lines)
  if (at < 0) return { source }

  if (isState(lines[at]!)) {
    lines = stripTerminals(lines)

    return { source: lines.join('\n'), alt: turnState(lines, at) }
  }

  return { source, alt: turnFlowchart(lines, at) }
}

// 色の役割を見分けるため、役割ごとに別の色を描画ライブラリに指定する
const ROLE_COLORS: Record<string, Role> = {
  '#000001': 'text',
  '#000002': 'border',
  '#000003': 'line',
  '#000004': 'arrow',
  '#000005': 'line',
  '#000006': 'border',
}
const THEME = { fg: '#000001', border: '#000002', line: '#000003', arrow: '#000004', corner: '#000005', junction: '#000006' }

const unescape = (text: string) =>
  text.replace(/&(lt|gt|quot|#39|amp);/g, (_, name: string) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[name]!)

// html の色指定付きの 1 行を区切りにする
const parseLine = (line: string): Segment[] => {
  const segments: Segment[] = []
  const pattern = /<span style="color:(#[0-9a-fA-F]{6})">([\s\S]*?)<\/span>/g
  let last = 0
  for (let m = pattern.exec(line); m; m = pattern.exec(line)) {
    if (m.index > last) segments.push({ text: unescape(line.slice(last, m.index)) })
    const role = ROLE_COLORS[m[1]!.toLowerCase()]
    segments.push(role ? { text: unescape(m[2]!), role } : { text: unescape(m[2]!) })
    last = pattern.lastIndex
  }
  if (last < line.length) segments.push({ text: unescape(line.slice(last)) })

  return segments
}

// 全角の文字を「私用領域の文字 + 詰め物」の 2 文字に置き換える。描画ライブラリは 1 文字を 1 桁と数えるので、これで桁がそろう
const FILLER = ''
const PRIVATE_BASE = 0xe001

const widen = (source: string) => {
  const toPrivate = new Map<string, string>()
  const fromPrivate = new Map<string, string>()
  const text = [...source]
    .map(char => {
      if (charWidth(char) === 1) return char
      let p = toPrivate.get(char)
      if (!p) {
        p = String.fromCharCode(PRIVATE_BASE + toPrivate.size)
        toPrivate.set(char, p)
        fromPrivate.set(p, char)
      }

      return p + FILLER
    })
    .join('')
  const restore = (out: string) =>
    fromPrivate.size === 0 ? out : out.replace(/([-])/g, (s, p: string) => fromPrivate.get(p) ?? s)

  return { text, restore }
}

// 行末の空白を落とす
const trimEnd = (segments: Segment[]) => {
  const out = [...segments]
  while (out.length > 0) {
    const last = out[out.length - 1]!
    const text = last.text.replace(/\s+$/, '')
    if (text !== '') {
      out[out.length - 1] = { ...last, text }
      break
    }
    out.pop()
  }

  return out
}

const lineWidth = (segments: Segment[]) => segments.reduce((sum, s) => sum + displayWidth(s.text), 0)

// 幅に収まるところまで残す。全角の文字は途中で切らない
const cutLine = (segments: Segment[], columns: number) => {
  const out: Segment[] = []
  let used = 0
  for (const segment of segments) {
    let text = ''
    for (const char of segment.text) {
      if (used + charWidth(char) > columns) break
      text += char
      used += charWidth(char)
    }
    if (text !== '') out.push({ ...segment, text })
    if (text !== segment.text) break
  }

  return out
}

const CACHE_SIZE = 100

// 図を描く関数を作る。描いた結果は図・ASCII の指定・幅ごとに覚えておく
export const createRenderer = (render: RenderFn) => {
  const cache = new Map<string, Diagram | undefined>()

  const toLines = (source: string, ascii: boolean) => {
    const { text, restore } = widen(source)
    const out = restore(render(text, { useAscii: ascii, colorMode: 'html', theme: THEME }))

    return out.split('\n').map(line => trimEnd(parseLine(line)))
  }

  const draw = ({ ascii, columns }: DrawOptions, source: string): Diagram | undefined => {
    const prepared = prepare(source)
    let lines: Segment[][]
    try {
      lines = toLines(prepared.source, ascii)
    } catch {
      return undefined
    }

    if (prepared.alt !== undefined) {
      try {
        const alt = toLines(prepared.alt, ascii)
        const fits = columns === undefined || Math.max(0, ...alt.map(lineWidth)) <= columns
        if (fits && alt.length < lines.length) lines = alt
      } catch {
        // 横向きで描けなければ元の向きのまま
      }
    }

    if (columns === undefined) return { lines, cut: 0 }

    let cut = 0
    const fitted = lines.map(line => {
      const width = lineWidth(line)
      if (width <= columns) return line
      const kept = cutLine(line, columns)
      cut = Math.max(cut, width - lineWidth(kept))

      return kept
    })

    return { lines: fitted, cut }
  }

  return (source: string, options: DrawOptions): Diagram | undefined => {
    const key = `${options.ascii ? 1 : 0}|${options.columns ?? ''}|${source}`
    if (cache.has(key)) {
      const hit = cache.get(key)
      cache.delete(key)
      cache.set(key, hit)

      return hit
    }

    const diagram = draw(options, source)
    cache.set(key, diagram)
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)

    return diagram
  }
}
