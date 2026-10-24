# Skill anatomy

English | [日本語](README.ja.md)

![Skill anatomy. An exploded book with connected layers illustrates studying the instructions, references, and history behind an agent skill.](assets/skill-anatomy-cover.en.webp)

Understand how your favorite agent skills work, and apply what you learn to your own.

Pass the URL of a skill on GitHub to get a Japanese report on how it works, its design decisions, and ideas for your own skills.

See the [analysis of Skill anatomy itself, in Japanese](examples/skill-anatomy.md), for an example report.

## Get started

Requires Node.js 22 or later and Git.

1. Install the skill with either command. Choose your agent and installation location when prompted.

   ```sh
   # Install
   npx skills add yamazaki-yuki-23/skill-anatomy

   # Update
   npx skills update skill-anatomy
   ```

   Or use the GitHub CLI:

   ```sh
   # Install
   gh skill install yamazaki-yuki-23/skill-anatomy skill-anatomy

   # Update
   gh skill update skill-anatomy
   ```

2. Restart your agent and pass the GitHub URL you want to study.

   Codex:

   ```text
   $skill-anatomy https://github.com/mattpocock/skills
   ```

   Claude Code:

   ```text
   /skill-anatomy https://github.com/mattpocock/skills
   ```

3. Check the proposed research scope and output location, then reply "OK". The agent saves a report for each skill as it works, followed by a report on the repository as a whole.

The URL determines the research scope: a whole repository, [one skill](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me), a folder containing several skills, or a `SKILL.md` file.

To include pull requests and issues, install the GitHub CLI and authenticate with `gh auth login`. If it is unavailable, research continues with files and commits, and missing information is noted in the report.

## What the reports explain

- What problem the author faced, and which changes addressed it.
- How instruction order, approval points, and the division of responsibilities across references shape the agent's decisions.
- What conditions and instructions you would need to apply a design idea to a different problem.

Skill anatomy was built to explore why a skill's instructions work the way they do, and how you might design your own. You can add a question alongside the URL, such as "explain how responsibilities are split between SKILL.md and its references".

Explanations cite their sources and distinguish the author's statements from the analyst's interpretation. Unknown motivations are identified. Research stays within the target repository's files, commits, pull requests, and issues. Target skills are not executed or scored.

## Saved files

Reports are saved under `reports/` in the directory where you run the analysis. They are stored separately from the installed skill and survive updates.

```text
reports/<owner>/<repository>/
├── repository-analysis.md      # Report on the repository as a whole
├── skill-analyses/<path>.md     # Report on each skill
└── .state.json                 # Record used to resume research
```

The repository report covers the skill list and shared design ideas. Each skill's report explains its mechanism, history, and applications. Links in the repository report lead to those reports. If you select one skill, the repository report covers only the researched scope.

Each report type uses consistent headings in a fixed order, so you can find usage, history, design, and applications in the same place when comparing skills.

## Resume or repeat research

Pass the same URL again to research unfinished skills and those affected by changes. Changes to shared references or the pull request and issue list may trigger research of all skills.

Add these options after the URL:

| Option | Behavior |
|---|---|
| `--no-confirm` | Skip research-plan confirmation for this run. Tool permission prompts still apply. |
| `--refresh` | Research the entire selected scope again. |

<details>
<summary>Change the output location and understand reruns</summary>

To choose another location, set this variable before starting your agent:

```sh
export SKILL_ANATOMY_WORKSPACE="$HOME/.local/share/skill-anatomy"
```

Skills with the same name are distinguished by their original paths. Reports for deleted skills are retained. You can track reports and `.state.json` together in Git. Do not research the same repository concurrently in the same output location.

Some updates, such as changes limited to PR reviews, may go undetected. Use `--refresh` when you want to research them again.

</details>

[MIT License](LICENSE)
