import path from "node:path";
import { digest, sorted } from "./fingerprint.js";
function isSkill(name) {
  return name === "SKILL.md" || name.endsWith("/SKILL.md");
}
export function discover(files, target, kind) {
  const allSkills = sorted(Object.keys(files).filter(isSkill));
  if (kind === "repository" || kind === "tree" && !target)
    return { allSkills, selected: [...allSkills], scope: "repository" };
  if (kind === "blob" && !allSkills.includes(target))
    throw new Error("blobのURLはSKILL.mdを指定してください");
  const candidate = isSkill(target) ? target : `${target}/SKILL.md`;
  if (allSkills.includes(candidate))
    return { allSkills, selected: [candidate], scope: "skill" };
  if (kind === "tree") {
    const selected = allSkills.filter((s) => s.startsWith(`${target}/`));
    if (selected.length)
      return { allSkills, selected, scope: "subtree" };
  }
  throw new Error("指定パスに通常ファイルのSKILL.mdがありません");
}
function folder(skill) {
  return path.posix.dirname(skill);
}
function encodeComponent(segment) {
  return [...Buffer.from(segment)].map((byte) => /[a-z0-9_.-]/i.test(String.fromCharCode(byte)) ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join("");
}
export function reportPaths(skills) {
  const mapping = Object.create(null);
  for (const skill of skills) {
    let parent = folder(skill);
    for (const prefix of [".agents/skills/", ".claude/skills/", ".codex/skills/", "skills/"]) {
      if (parent.startsWith(prefix)) {
        parent = parent.slice(prefix.length);
        break;
      }
    }
    const name = parent === "." ? "root" : parent.split("/").map(encodeComponent).join("/");
    mapping[skill] = `skill-analyses/${name}.md`;
  }
  const counts = new Map;
  for (const report of Object.values(mapping))
    counts.set(report, (counts.get(report) ?? 0) + 1);
  for (const [skill, report] of Object.entries(mapping)) {
    if (counts.get(report) > 1)
      mapping[skill] = `${report.slice(0, -3)}--${digest(skill).slice(0, 12)}.md`;
  }
  return mapping;
}
