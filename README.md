# repo-template

新しいリポジトリを作る時に共通で使う設定ファイルをまとめたテンプレート。
GitHub の Template repository として使う。

## 使い方

```bash
gh repo create <owner>/<new-repo> --template shou6/repo-template --private --clone
```

作成後に次を書き換える。

- [ ] `README.md` をプロジェクトの説明に置き換える
- [ ] `LICENSE` の年と名義を確認する
- [ ] `.claude/rules/commit-message.md` の scope 一覧をプロジェクトに合わせる
- [ ] `.claude/settings.json` の permissions にプロジェクトのコマンド（npm、composer など）を足す
- [ ] `.gitignore` にプロジェクト固有の除外を足す
- [ ] `.vscode/extensions.json` に言語向けの拡張機能を足す
- [ ] プロジェクト直下に `CLAUDE.md` を作る

## 含まれるもの

| ファイル | 役割 |
| --- | --- |
| `.editorconfig` | 文字コード UTF-8、改行 LF、インデント 2 スペース |
| `.gitattributes` | 改行コードを LF に統一。`.bat` と `.ps1` は CRLF |
| `.gitignore` | `.env`、`node_modules`、ビルド成果物、OS のごみファイル |
| `.prettierrc` | Prettier の設定 |
| `.textlintrc` | 日本語文書の校正ルール（ja-technical-writing、jtf-style） |
| `.markdownlint-cli2.jsonc` | Markdown の lint 設定 |
| `.claude/settings.json` | Claude Code の権限と textlint MCP の有効化 |
| `.claude/rules/commit-message.md` | コミットメッセージ規約 |
| `.claude/.gitignore` | Claude Code のローカルファイルを除外 |
| `.automation/` | 自発提案スキルの状態ファイル（まだ手作業リスト、提案ログ） |
| `.vscode/` | 推奨拡張機能と保存時フォーマットの設定 |
| `LICENSE` | MIT |

## 前提

textlint と markdownlint は Claude Code のユーザー共通 hook（`~/.claude/scripts/`）が実行する。
このリポジトリには hook 本体を含めない。
