# claude-mods

Claude Code の Mod 集。1 つのリポジトリを marketplace（`shou6-mods`）として、複数の Mod を配布する。

## Mod

| Mod | 内容 |
| --- | --- |
| [status-band](./status-band) | プロンプト上の帯に、モデル名とコンテキスト・セッション・週間の使用率をバーで表示する |
| [mermaid-view](./mermaid-view) | 返答の mermaid のブロックを、ターミナルの中で色付きの罫線の図として描く |
| [compact-tools](./compact-tools) | ターミナルでシェルの出力を 1 行に畳み、/compact-tools で全出力表示と切り替える |
| [pr-watch](./pr-watch) | 自分の PR の状態とレビュー依頼の件数を帯に出し、/prs で一覧を開く |
| [work-ledger](./work-ledger) | ターンごとのトークンとツール呼び出しを JSONL に記録し、/note で作業メモを残す |

## 導入

Claude Code のターミナルで、入れたい Mod ごとに次を実行する。

```text
/plugin install status-band --marketplace shou6/claude-mods
/plugin install mermaid-view --marketplace shou6/claude-mods
/plugin install compact-tools --marketplace shou6/claude-mods
/plugin install pr-watch --marketplace shou6/claude-mods
/plugin install work-ledger --marketplace shou6/claude-mods
```

marketplace の追加を聞かれたら `y` を押し、スコープを選ぶ。

## 前提

- Claude Code v2.1.287 以降
- 表示はターミナルの `claude` と Desktop アプリの Code タブだけで出る。VS Code 拡張のチャット欄には出ない

## pr-watch の使い方

pr-watch は GitHub CLI（`gh`）で PR を取る。`gh auth login` でログインしておく。

- 帯に `PR 3（CI 失敗 1）  レビュー依頼 2 │ このブランチ #12 CI 失敗 · 未対応 2` のように出す
  - CI の失敗、変更要求、競合があれば、その数も添える
  - 今いるブランチに自分の PR があれば、その CI、レビュー、未対応のレビューコメントの数を出す
- 帯の件数はボタンになっている。押すと、その一覧を先頭にした Pane を開く。fullscreen ではクリック、それ以外では `ctrl+x tab` で帯に移り、`p`（PR）か `r`（レビュー依頼）を押す
- `/prs` で取り直し、自分の PR とレビュー依頼の一覧を Pane に開く
- 一覧のボタンで、Claude への依頼を入力欄に入れる。送信は自分で行う
  - 「コメントに対応」：未対応のレビューコメントか変更要求がある PR
  - 「CI を直す」：CI が失敗した PR
  - 「レビューする」：レビュー依頼
- 取り直したときに、CI の失敗と成功、承認と変更要求、新しいレビュー依頼をトーストで知らせる
- 既定では 5 分ごとに、すべてのリポジトリから取り直す。間隔（`intervalMinutes`）と対象（`scope` を `repo` にすると今いるリポジトリだけ）は設定で変えられる

## work-ledger の記録

work-ledger は、記録を `~/.claude/work-ledger/<日付>/<セッション ID>.jsonl` に 1 件 1 行で書く。置き場所は設定の `dir` で変えられる。日報やコストの分析は、このファイルを読むスキルを作れば行える。

全件に `v`（形式の版）、`type`、`ts`（ローカル時刻の ISO 8601）、`sessionId` が付く。

| type | 項目 | 書く時点 |
| --- | --- | --- |
| `session` | `event`（`start` / `end`）、`cwd`、`repo`（開始時）、`reason`（終了時） | セッションの開始と終了 |
| `turn` | `turnId`、`agentId`（サブエージェントのみ）、`cwd`、`model`、`durationMs`、`reason`、`usage`（`input` / `output` / `cacheRead` / `cacheCreation`）、`prompt`（メインのループのみ） | ターンの終わり |
| `tool` | `turnId`、`agentId`（サブエージェントのみ）、`tool`、`path`（Read / Edit / Write のみ）、`durationMs`、`resultChars`、`isError` | ターンの終わりにまとめて。`ts` は呼び出しを始めた時刻 |
| `note` | `cwd`、`text` | `/note <本文>` |

- `prompt` は、ターンを始めたプロンプトの先頭 100 文字。改行と連続する空白は 1 つの空白にまとめる。文字数は設定の `promptChars` で変えられ、0 にすると記録しない
- ファイルパスのほかのツールの引数、ツールの結果の本文、返答の本文は記録しない。`resultChars` は結果の文字数だけを数える
- 1 つのファイルが 3 MiB を超えたら、続きを `<セッション ID>-2.jsonl` に書く

## ライセンス

MIT
