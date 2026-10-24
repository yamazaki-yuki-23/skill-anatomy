# Security policy

## Report a vulnerability

Report suspected vulnerabilities through [GitHub's private reporting form](https://github.com/yamazaki-yuki-23/skill-anatomy/security/advisories/new). Do not disclose vulnerability details in public issues or pull requests.

Include:

- The affected version or commit.
- Steps to reproduce the issue and a minimal example, if available.
- The potential impact.

Remove API keys, tokens, and other sensitive information from examples and logs before submitting them.

## External content

This skill reads third-party repository files, issues, and pull requests. They can contain instructions intended to redirect the agent. The skill treats that content as research data, but instructions alone do not provide isolation or guarantee that an agent will resist prompt injection. Keep your agent's sandbox and tool permission checks enabled, and avoid granting access to unrelated sensitive data.

See the [evaluation procedure and limits](docs/security-evaluation.md) for developer checks. The procedure is documented in Japanese.

## 脆弱性を報告する

脆弱性の疑いは、[GitHubの非公開報告フォーム](https://github.com/yamazaki-yuki-23/skill-anatomy/security/advisories/new)から連絡してください。公開IssueやPRには、脆弱性の詳細を投稿しないでください。

報告には次の情報を含めてください。

- 影響を受けるバージョン、またはコミット。
- 再現手順と、可能であれば最小限の再現例。
- 想定される影響。

再現例やログを送る前に、APIキー・トークンなどの機密情報を取り除いてください。

## 外部文章を読む際のリスク

このスキルは、第三者のリポジトリ内のファイルやIssue・PRを読みます。そこにはエージェントを別の操作へ誘導する指示が含まれる可能性があります。調査資料として扱うよう定めていますが、指示文だけで実行環境を隔離したり、誘導を完全に防いだりはできません。利用するエージェントのサンドボックスとツールの権限確認を有効にし、調査に不要な機密情報へのアクセスを与えないでください。

開発者向けの[検証手順と限界](docs/security-evaluation.md)も公開しています。
