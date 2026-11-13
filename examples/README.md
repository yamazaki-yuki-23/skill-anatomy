# 作例

Skill anatomyが生成したレポートです。どのレポートも対象スキルを実行せずに調べています。実モデル評価の2題材と同じ対象で、分量の範囲と評価の比較対象を兼ねます。本文は生成結果のままで、手直ししていません。HTML版は `complete` がMarkdownから生成したものです。

| 作例 | 対象と調査日 | 生成条件 |
| --- | --- | --- |
| [total-recall の分析](total-recall/skill-analyses/root.md)、[全体分析](total-recall/repository-analysis.md)（それぞれ隣にHTML版） | [gavdalf/total-recall コミット `437ab36`](https://github.com/gavdalf/total-recall/tree/437ab3656ecdf52c7ed0c3ee63a3cdae68d5b90f)、2026年11月13日 | 1スキルのリポジトリ。実モデル評価 `single`（Codex CLI 0.167.0、既定モデル）の出力。記録 `.cache/issue-work/single-1794533488048` |
| [git-guardrails-claude-code](mattpocock-skills-misc/skill-analyses/misc/git-guardrails-claude-code.md)、[migrate-to-shoehorn](mattpocock-skills-misc/skill-analyses/misc/migrate-to-shoehorn.md)、[scaffold-exercises](mattpocock-skills-misc/skill-analyses/misc/scaffold-exercises.md)、[setup-pre-commit](mattpocock-skills-misc/skill-analyses/misc/setup-pre-commit.md)、[全体分析](mattpocock-skills-misc/repository-analysis.md)（それぞれ隣にHTML版） | [mattpocock/skills の `skills/misc` コミット `4ae2317`](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc)、2026年11月13日 | 4スキルのフォルダ。実モデル評価 `multi` の出力。記録 `.cache/issue-work/multi-1794533788929` |

分量の範囲（個別分析 5,000〜24,000バイト、全体分析 1,500〜12,000バイト）はこの2組から決めた。各レポートの採点は該当PR（#93）に記録している。生成結果の誤記（setup-pre-commit の「確かまりません」）も直さず残している。
