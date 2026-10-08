# claude-mods

Claude Code の Mod 集。1 つのリポジトリを marketplace（`shou6-mods`）として、複数の Mod を配布する。

## Mod

| Mod | 内容 |
| --- | --- |
| [status-band](./status-band) | プロンプト上の帯に、モデル名とコンテキスト・セッション・週間の使用率をバーで表示する |
| [mermaid-view](./mermaid-view) | 返答の mermaid のブロックを、ターミナルの中で色付きの罫線の図として描く |
| [compact-tools](./compact-tools) | ターミナルでシェルの出力を 1 行に畳み、/compact-tools で全出力表示と切り替える |
| [work-ledger](./work-ledger) | ターンごとのトークンとツール呼び出しを JSONL に記録し、/note で作業メモを残す |

## 導入

Claude Code のターミナルで、入れたい Mod ごとに次を実行する。

```text
/plugin install status-band --marketplace shou6/claude-mods
/plugin install mermaid-view --marketplace shou6/claude-mods
/plugin install compact-tools --marketplace shou6/claude-mods
/plugin install work-ledger --marketplace shou6/claude-mods
```

marketplace の追加を聞かれたら `y` を押し、スコープを選ぶ。

## 前提

- Claude Code v2.1.287 以降
- 表示はターミナルの `claude` と Desktop アプリの Code タブだけで出る。VS Code 拡張のチャット欄には出ない

## work-ledger の記録

work-ledger は、記録を `~/.claude/work-ledger/<日付>/<セッション ID>.jsonl` に 1 件 1 行で書く。置き場所は設定の `dir` で変えられる。日報やコストの分析は、このファイルを読むスキルを作れば行える。

全件に `v`（形式の版）、`type`、`ts`（ISO 8601）、`sessionId` が付く。

| type | 項目 | 書く時点 |
| --- | --- | --- |
| `session` | `event`（`start` / `end`）、`cwd`、`repo`（開始時）、`reason`（終了時） | セッションの開始と終了 |
| `turn` | `turnId`、`agentId`（サブエージェントのみ）、`cwd`、`model`、`durationMs`、`reason`、`usage`（`input` / `output` / `cacheRead` / `cacheCreation`） | ターンの終わり |
| `tool` | `turnId`、`agentId`（サブエージェントのみ）、`tool`、`durationMs`、`resultChars`、`isError` | ターンの終わりにまとめて |
| `note` | `cwd`、`text` | `/note <本文>` |

- ツールの引数、ツールの結果の本文、プロンプトと返答の本文は記録しない。`resultChars` は結果の文字数だけを数える
- 1 つのファイルが 3 MiB を超えたら、続きを `<セッション ID>-2.jsonl` に書く

## ライセンス

MIT
