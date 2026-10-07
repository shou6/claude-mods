# claude-mods

Claude Code の Mod 集。1 つのリポジトリを marketplace（`shou6-mods`）として、複数の Mod を配布する。

## Mod

| Mod | 内容 |
| --- | --- |
| [status-band](./status-band) | プロンプト上の帯に、モデル名とコンテキスト・セッション・週間の使用率をバーで表示する |
| [mermaid-view](./mermaid-view) | 返答の mermaid のブロックを、ターミナルの中で色付きの罫線の図として描く |

## 導入

Claude Code のターミナルで、入れたい Mod ごとに次を実行する。

```text
/plugin install status-band --marketplace shou6/claude-mods
/plugin install mermaid-view --marketplace shou6/claude-mods
```

marketplace の追加を聞かれたら `y` を押し、スコープを選ぶ。

## 前提

- Claude Code v2.1.287 以降
- 表示はターミナルの `claude` と Desktop アプリの Code タブだけで出る。VS Code 拡張のチャット欄には出ない

## ライセンス

MIT
