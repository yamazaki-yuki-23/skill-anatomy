import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { digest, sorted, createSourceSigner } from './fingerprint.js';
import { htmlPath } from './html.js';
import { acquire, parseUrl, resolveTarget, fileInventory, fetchIndex } from './repository.js';
import { discover, reportPaths } from './skills.js';
import { inside, readJson, writeJson, withStateLock } from './storage.js';
import { VERSION, timestamp } from './state.js';
import type {
  Entry,
  GithubIndex,
  Plan,
  PrepareOptions,
  SkillState,
  State,
  Target,
} from './types.js';
export function prepare(options: PrepareOptions): unknown {
  const target = parseUrl(options.url);
  mkdirSync(options.workspace, { recursive: true });
  const root = realpathSync(options.workspace);
  return withStateLock(repositoryStateFile(root, target), () => {
    const { cache, defaultRef } = acquire(target, root);
    return prepareSnapshotUnlocked(options, target, root, cache, defaultRef, fetchIndex(target));
  });
}

function repositoryStateFile(root: string, target: Target): string {
  return inside(inside(root, `reports/${target.owner}/${target.repo}`), '.state.json');
}

export function prepareSnapshot(
  options: PrepareOptions,
  target: Target,
  root: string,
  cache: string,
  defaultRef: string,
  index: GithubIndex,
): Record<string, unknown> {
  return withStateLock(repositoryStateFile(root, target), () =>
    prepareSnapshotUnlocked(options, target, root, cache, defaultRef, index),
  );
}

function prepareSnapshotUnlocked(
  options: PrepareOptions,
  target: Target,
  root: string,
  cache: string,
  defaultRef: string,
  index: GithubIndex,
): Record<string, unknown> {
  const { commit, target: targetPath, kind } = resolveTarget(cache, defaultRef, target.tail);
  const files = fileInventory(cache, commit);
  const { allSkills, selected, scope } = discover(files, targetPath, kind);
  if (!selected.length) throw new Error('通常ファイルのSKILL.mdが見つかりませんでした');
  const destination = inside(root, `reports/${target.owner}/${target.repo}`);
  const stateFile = inside(destination, '.state.json');
  const state: State = existsSync(stateFile)
    ? readJson<State>(stateFile)
    : {
        version: VERSION,
        active_plan: '',
        skills: {},
        inventory: [],
        removed: [],
        repository: null,
      };
  if (state.version !== VERSION) throw new Error('状態ファイルのバージョンが異なります');
  const indexHash = digest({ status: index.status, items: index.items });
  const unavailableIndexHash = digest({ status: 'unavailable', items: [] });
  const discussionUpdates: string[] = [];
  const mappings = reportPaths(
    allSkills,
    Object.fromEntries(Object.entries(state.skills).map(([skill, entry]) => [skill, entry.report])),
  );
  const entries: Entry[] = [];
  const signSource = createSourceSigner(cache, commit, files, allSkills);
  const selectedSkills = new Set(selected);
  for (const skill of allSkills) {
    const old: SkillState = state.skills[skill] ?? {
      status: 'pending',
      report: '',
      dependencies: [],
      source_signature: '',
      index_hash: '',
      report_hash: '',
      analyzed_commit: null,
      analyzed_at: null,
    };
    const report = mappings[skill]!;
    const signature = signSource(skill, old.dependencies);
    const reportPath = inside(destination, report);
    let reportHash: string | undefined;
    if (existsSync(reportPath)) reportHash = digest(readFileSync(reportPath, 'utf8'));
    const previousIndexStatus =
      old.index_status ?? (old.index_hash === unavailableIndexHash ? 'unavailable' : 'available');
    const unchanged =
      !(options.refresh && selectedSkills.has(skill)) &&
      old.status === 'done' &&
      old.source_signature === signature &&
      previousIndexStatus === index.status &&
      old.report === report &&
      old.report_hash === reportHash;
    if (
      unchanged &&
      index.status === 'available' &&
      old.index_hash !== indexHash &&
      selectedSkills.has(skill)
    )
      discussionUpdates.push(skill);
    old.status = unchanged ? 'done' : 'pending';
    old.report = report;
    state.skills[skill] = old;
    entries.push({
      skill,
      report: reportPath,
      html: inside(destination, htmlPath(report)),
      status: old.status,
      selected: selectedSkills.has(skill),
    });
  }
  const planRoot = inside(root, '.cache/plans');
  mkdirSync(planRoot, { recursive: true });
  const planDir = mkdtempSync(path.join(planRoot, 'run-'));
  const id = path.basename(planDir);
  const planFile = path.join(planDir, 'plan.json');
  const indexFile = path.join(planDir, 'github-index.json');
  const plan: Plan = {
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
    index_status: index.status,
    index_hash: indexHash,
    approved: !!options.noConfirm,
    confirmation: options.noConfirm ? 'skipped-by-user' : 'required',
    format: options.format ?? 'markdown',
    files,
    skills: entries,
  };
  state.active_plan = id;
  state.inventory = allSkills;
  state.removed = sorted(Object.keys(state.skills).filter((s) => !allSkills.includes(s)));
  if (entries.some((entry) => entry.status === 'pending')) state.repository = null;
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
    pending: entries.filter((e) => e.selected && e.status === 'pending').map((e) => e.skill),
    approved: plan.approved,
    format: plan.format,
    index_status: index.status,
    discussion_updates: discussionUpdates,
    warning:
      [
        index.status === 'unavailable'
          ? `GitHub索引を取得できないため、PR・Issueの更新は未確認です。${index.error ? ` ${index.error}` : ''}`
          : null,
        ...cleanupWarnings,
        discussionUpdates.length
          ? 'PR・Issue索引に更新があります。完了済み本文は保持し、議論の更新は未確認です。再確認する場合は--refreshを指定してください。'
          : null,
      ]
        .filter(Boolean)
        .join(' ') || null,
    destination,
  };
}

export function pruneSupersededPlans(planRoot: string, active: Plan): string[] {
  try {
    return pruneKnownPlans(planRoot, active);
  } catch (error) {
    return [`古い計画を整理できませんでした: ${(error as Error).message}`];
  }
}

function pruneKnownPlans(planRoot: string, active: Plan): string[] {
  const warnings: string[] = [];
  for (const entry of readdirSync(planRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-') || entry.name === active.id)
      continue;
    const directory = path.join(planRoot, entry.name);
    const planFile = path.join(directory, 'plan.json');
    const indexFile = path.join(directory, 'github-index.json');
    try {
      const files = readdirSync(directory);
      if (
        files.length !== 2 ||
        !files.includes('plan.json') ||
        !files.includes('github-index.json')
      )
        continue;
      if (![planFile, indexFile].every((file) => lstatSync(file).isFile())) continue;
      const previous = readJson<Plan>(planFile);
      if (
        !previous ||
        previous.version !== VERSION ||
        previous.owner !== active.owner ||
        previous.repo !== active.repo ||
        previous.state_file !== active.state_file ||
        previous.id !== entry.name ||
        previous.plan_file !== planFile ||
        previous.github_index !== indexFile
      )
        continue;
      unlinkSync(indexFile);
      unlinkSync(planFile);
      rmdirSync(directory);
    } catch (error) {
      warnings.push(`古い計画を整理できませんでした: ${entry.name}。${(error as Error).message}`);
    }
  }
  return warnings;
}
