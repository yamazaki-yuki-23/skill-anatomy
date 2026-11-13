import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync
} from "node:fs";
import path from "node:path";
import { sorted } from "./hash.js";
import { htmlPath } from "./html.js";
import {
  acquire,
  parseUrl,
  resolveTarget,
  fileInventory,
  fetchDiscussion,
  fetchIndex
} from "./repository.js";
import { materializeSource } from "./source.js";
import { discover, reportPaths } from "./skills.js";
import { inside, readJson, writeJson, withStateLock } from "./storage.js";
import { VERSION, readPlan, timestamp } from "./state.js";
export function prepare(options) {
  const target = parseUrl(options.url);
  mkdirSync(options.workspace, { recursive: true });
  const root = realpathSync(options.workspace);
  return withStateLock(repositoryStateFile(root, target), () => {
    const { cache, defaultRef } = acquire(target, root);
    return prepareSnapshotUnlocked(options, target, root, cache, defaultRef, fetchIndex(target));
  });
}
function repositoryStateFile(root, target) {
  return inside(inside(root, `reports/${target.owner}/${target.repo}`), ".state.json");
}
export function prepareSnapshot(options, target, root, cache, defaultRef, index) {
  return withStateLock(repositoryStateFile(root, target), () => prepareSnapshotUnlocked(options, target, root, cache, defaultRef, index));
}
function prepareSnapshotUnlocked(options, target, root, cache, defaultRef, index) {
  const { commit, target: targetPath, kind } = resolveTarget(cache, defaultRef, target.tail);
  const files = fileInventory(cache, commit);
  const { allSkills, selected, scope } = discover(files, targetPath, kind);
  if (!selected.length)
    throw new Error("通常ファイルのSKILL.mdが見つかりませんでした");
  const source = materializeSource(root, target, cache, commit, files);
  const destination = inside(root, `reports/${target.owner}/${target.repo}`);
  const stateFile = inside(destination, ".state.json");
  const existing = existsSync(stateFile) ? readJson(stateFile) : null;
  const state = existing && existing.version === VERSION ? existing : upgradeState(existing);
  const mappings = reportPaths(allSkills, Object.fromEntries(Object.entries(state.skills).map(([skill, entry]) => [skill, entry.report])));
  const entries = [];
  const selectedSkills = new Set(selected);
  for (const skill of allSkills) {
    const old = state.skills[skill] ?? {
      status: "pending",
      report: "",
      report_hash: "",
      analyzed_commit: null,
      analyzed_at: null
    };
    const report = mappings[skill];
    const reportPath = inside(destination, report);
    if (selectedSkills.has(skill) || old.report !== report)
      old.status = "pending";
    old.report = report;
    state.skills[skill] = old;
    entries.push({
      skill,
      report: reportPath,
      html: inside(destination, htmlPath(report)),
      status: old.status,
      selected: selectedSkills.has(skill)
    });
  }
  const planRoot = inside(root, ".cache/plans");
  mkdirSync(planRoot, { recursive: true });
  const planDir = mkdtempSync(path.join(planRoot, "run-"));
  const id = path.basename(planDir);
  const planFile = path.join(planDir, "plan.json");
  const indexFile = path.join(planDir, "github-index.json");
  const plan = {
    version: VERSION,
    id,
    created_at: timestamp(),
    url: options.url,
    owner: target.owner,
    repo: target.repo,
    commit,
    scope,
    target: targetPath,
    cache,
    destination,
    state_file: stateFile,
    plan_file: planFile,
    github_index: indexFile,
    source: source.directory,
    source_index: source.index,
    approved: !!options.noConfirm,
    confirmation: options.noConfirm ? "skipped-by-user" : "required",
    files,
    skills: entries
  };
  state.active_plan = id;
  state.inventory = allSkills;
  state.removed = sorted(Object.keys(state.skills).filter((s) => !allSkills.includes(s)));
  if (entries.some((entry) => entry.status === "pending"))
    state.repository = null;
  writeJson(indexFile, index);
  writeJson(planFile, plan);
  writeJson(stateFile, state);
  const cleanupWarnings = pruneSupersededPlans(planRoot, plan);
  return {
    plan_file: planFile,
    commit,
    scope,
    total_skills: allSkills.length,
    selected_skills: selected.length,
    pending: entries.filter((e) => e.selected && e.status === "pending").map((e) => e.skill),
    approved: plan.approved,
    index_status: index.status,
    source: source.directory,
    source_index: source.index,
    source_files: source.expanded,
    source_skipped: source.skipped,
    warning: [
      index.status === "unavailable" ? `GitHub索引を取得できないため、PR・Issueは未確認です。${index.error ? ` ${index.error}` : ""}` : null,
      ...cleanupWarnings
    ].filter(Boolean).join(" ") || null,
    destination
  };
}
function upgradeState(previous) {
  const skills = {};
  const entries = previous && typeof previous === "object" && "skills" in previous ? previous.skills : null;
  if (entries && typeof entries === "object")
    for (const [skill, entry] of Object.entries(entries)) {
      const report = entry && typeof entry === "object" && "report" in entry && typeof entry.report === "string" ? entry.report : "";
      skills[skill] = {
        status: "pending",
        report,
        report_hash: "",
        analyzed_commit: null,
        analyzed_at: null
      };
    }
  return {
    version: VERSION,
    active_plan: "",
    skills,
    inventory: [],
    removed: [],
    repository: null
  };
}
export function pruneSupersededPlans(planRoot, active) {
  try {
    return pruneKnownPlans(planRoot, active);
  } catch (error) {
    return [`古い計画を整理できませんでした: ${error.message}`];
  }
}
function pruneKnownPlans(planRoot, active) {
  const warnings = [];
  for (const entry of readdirSync(planRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-") || entry.name === active.id)
      continue;
    const directory = path.join(planRoot, entry.name);
    const planFile = path.join(directory, "plan.json");
    const indexFile = path.join(directory, "github-index.json");
    try {
      const files = readdirSync(directory);
      if (files.length !== 2 || !files.includes("plan.json") || !files.includes("github-index.json"))
        continue;
      if (![planFile, indexFile].every((file) => lstatSync(file).isFile()))
        continue;
      const previous = readJson(planFile);
      if (!previous || previous.version !== VERSION || previous.owner !== active.owner || previous.repo !== active.repo || previous.state_file !== active.state_file || previous.id !== entry.name || previous.plan_file !== planFile || previous.github_index !== indexFile)
        continue;
      unlinkSync(indexFile);
      unlinkSync(planFile);
      rmdirSync(directory);
    } catch (error) {
      warnings.push(`古い計画を整理できませんでした: ${entry.name}。${error.message}`);
    }
  }
  return warnings;
}
export function discussion(planFile, numbers) {
  const plan = readPlan(planFile);
  const parsed = numbers.map((value) => {
    if (!/^[1-9]\d{0,8}$/.test(value))
      throw new Error(`Issue・PR番号が不正です: ${value}`);
    return Number(value);
  });
  if (!parsed.length)
    throw new Error("--number で Issue・PR番号を1つ以上指定してください");
  const items = fetchDiscussion({ owner: plan.owner, repo: plan.repo, tail: [] }, [...new Set(parsed)].sort((a, b) => a - b));
  return {
    repository: `${plan.owner}/${plan.repo}`,
    items,
    warning: items.some((item) => item.errors.length) ? "GitHub APIから取得できなかった項目があります。該当箇所は未確認と記録してください" : null
  };
}
