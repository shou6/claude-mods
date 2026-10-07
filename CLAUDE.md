# claude-mods

Claude Code の Mod（関数フックのプラグイン）を開発し、marketplace として配布するリポジトリ。

## 構成

```text
claude-mods/
├── .claude-plugin/marketplace.json   # 配布する Mod の一覧（marketplace 名: shou6-mods）
└── <mod>/                            # Mod ごとに 1 フォルダ
    ├── .claude-plugin/plugin.json    # マニフェスト（name、version、description、types）
    ├── hooks/hooks.json              # { "modules": ["./register.tsx"] }
    ├── hooks/register.tsx            # フックモジュール
    ├── types/index.d.ts              # $.state を使う場合の型の契約
    ├── tests/*.test.tsx              # claude plugin test で実行するテスト
    └── tsconfig.json                 # 生成される型定義を extends する
```

## 開発の進め方

- Mod を読み込んだ状態で作業する。リポジトリ直下で `claude --plugin-dir ./<mod>` と起動する
  - ターン中の編集は、ターンの終わりに自動で読み直される
- API の正は、読み込み時に生成される `<mod>/.claude-plugin/types/claude-code/index.d.ts`。ドキュメントと食い違ったら型定義に従う
- 書き方の詳細は `plugin-authoring` スキルを読む。ただし Mod はこのリポジトリの `<mod>/` に書く。スキルが案内する `~/.claude/dev-mods/` には書かない
- 原則として TDD で進める。テストを書いて失敗を確認し、テストだけを先にコミットしてから実装する

## コミット前の確認

Mod を変えたら、その Mod のフォルダで次を通す。

```bash
claude plugin validate ./<mod>
claude plugin test ./<mod>
npx tsc -p ./<mod> --noEmit
```

`tsc` は Mod を一度読み込んで型定義が生成された後に使える。

## 新しい Mod を足すとき

1. `<mod>/` に上の構成でファイルを作る
2. `.claude-plugin/marketplace.json` の `plugins` に `{ "name", "source": "./<mod>", "description" }` を足す
3. Mod の名前は `claude-` で始めない（validate で弾かれる）

## 配布と更新

- 配布先に変更を届けるときは、その Mod の `plugin.json` の `version` を上げる。上げないと、インストール済みの人には届かない
- 利用者の導入手順は README に書く

## git に含めるもの、含めないもの

- 含める：各 Mod のソース、テスト、マニフェスト、`types/index.d.ts`、`tsconfig.json`、`marketplace.json`
- 含めない：`.claude-plugin/types/`（読み込みのたびに生成される）、`.env`、`node_modules/`、`.claude/` の `*.local.*`

## 機密情報の扱い

このリポジトリは公開する前提で扱う。

- API キー、トークン、パスワードをコードやテストに書かない。必要なら Mod の `userConfig`（`sensitive: true`）か環境変数で受け取る
- 社内の URL、ホスト名、業務データ、個人名をコード、テスト、コミットメッセージに書かない
- テストに使う値は架空のものにする
- 社内向けの情報を扱う Mod は、このリポジトリに置かない
