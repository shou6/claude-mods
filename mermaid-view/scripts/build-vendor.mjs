// beautiful-mermaid の ASCII 描画だけを 1 ファイルにまとめ、hooks/vendor/ に置く
// パッケージの入口は SVG 用の elkjs まで含むので、ASCII の入口を直接まとめる
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = 'node_modules/beautiful-mermaid'
const { version } = JSON.parse(readFileSync(`${pkg}/package.json`, 'utf8'))
const license = readFileSync(`${pkg}/LICENSE`, 'utf8').trim()

await build({
  entryPoints: [`${pkg}/src/ascii/index.ts`],
  outfile: 'hooks/vendor/beautiful-mermaid.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  minifySyntax: true,
  tsconfigRaw: '{}',
  banner: { js: `/*!\n * beautiful-mermaid ${version} (ASCII renderer only)\n * https://github.com/lukilabs/beautiful-mermaid\n *\n${license.replace(/^/gm, ' * ')}\n */` },
})
