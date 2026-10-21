# Skill anatomy

English | [日本語](README.ja.md)

Analyze skills published on GitHub and create Japanese Markdown reports covering their purpose, usage, history, design choices, and ideas for your own skills. Works with Codex and Claude Code.

## Install

```sh
npx skills add yamazaki-yuki-23/skill-anatomy
```

Requires Node.js 22 or later and Git. To research pull requests and issues, install the GitHub CLI and authenticate with `gh auth login`.

Choose your agent and installation scope when prompted. Restart your agent after installation. See the [skills CLI documentation](https://github.com/vercel-labs/skills#install-a-skill).

## Use

In Codex:

```text
$skill-anatomy https://github.com/mattpocock/skills
```

In Claude Code, this example targets an individual skill:

```text
/skill-anatomy https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me
```

The skill automatically detects repositories, individual skills, and folders containing multiple skills. URLs ending in `blob/REF/PATH/SKILL.md` are also supported.

It presents a research plan and output location, then waits for your approval before analyzing. You can also request a focus, such as how instructions are split across files.

| Option | Behavior |
|---|---|
| `--no-confirm` | Skip research-plan confirmation for this run. Tool permission prompts still apply. |
| `--refresh` | Reanalyze the entire selected scope. |

Research is limited to files, commits, pull requests, and issues in the target repository, with sources cited. Reports mark unknown author motivations as “確認できず” and unavailable information as “未確認”. The skill does not execute the target skills or assess their weaknesses.

## Output

```text
reports/<owner>/<repository>/
├── repository-analysis.md      # Overview, skill list, and shared design choices
├── skill-analyses/<path>.md     # Individual skill analysis and application examples
└── .state.json                 # Resume state
```

With the installation above, reports are saved in your working directory. To choose another location, set this variable before starting your agent:

```sh
export SKILL_ANATOMY_WORKSPACE="$HOME/.local/share/skill-anatomy"
```

Run the same URL again to resume unfinished work and reanalyze items affected by changes. Skills with the same name are distinguished by their original paths. Reports for deleted skills are retained. Do not analyze the same repository concurrently.

Changes to shared files or the pull request and issue index trigger reanalysis of all skills. Changes missing from the index may go undetected; use `--refresh` when needed. If the GitHub CLI is unavailable, analysis continues with files and commits, and pull requests and issues are marked as unverified.

## Update

```sh
npx skills update skill-anatomy
```

With an npx installation, reports are stored outside the installed skill and survive updates. You can track reports and `.state.json` together in Git. The skill does not commit or push automatically.

MIT License. Code and text in analyzed repositories belong to their respective authors.
