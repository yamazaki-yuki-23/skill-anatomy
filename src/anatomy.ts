import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { digest, sorted, createSourceSigner } from './fingerprint.js';
import { acquire, parseUrl, resolveTarget, fileInventory, fetchIndex } from './repository.js';
import { discover, reportPaths } from './skills.js';
import { inside, readJson, writeJson } from './storage.js';
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
  mkdirSync(options.toolRoot, { recursive: true });
  const root = realpathSync(options.toolRoot);
  const { cache, defaultRef } = acquire(target, root);
  return prepareSnapshot(options, target, root, cache, defaultRef, fetchIndex(target));
}

export function prepareSnapshot(
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
    const unchanged =
      !(options.refresh && selectedSkills.has(skill)) &&
      old.status === 'done' &&
      old.source_signature === signature &&
      old.index_hash === indexHash &&
      index.status === 'available' &&
      old.report === report &&
      old.report_hash === reportHash;
    old.status = unchanged ? 'done' : 'pending';
    old.report = report;
    state.skills[skill] = old;
    entries.push({
      skill,
      report: reportPath,
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
    files,
    skills: entries,
  };
  state.active_plan = id;
  state.inventory = allSkills;
  state.removed = sorted(Object.keys(state.skills).filter((s) => !allSkills.includes(s)));
  writeJson(indexFile, index);
  writeJson(planFile, plan);
  writeJson(stateFile, state);
  return {
    plan_file: planFile,
    commit,
    scope,
    total_skills: allSkills.length,
    selected_skills: selected.length,
    pending: entries.filter((e) => e.selected && e.status === 'pending').map((e) => e.skill),
    approved: plan.approved,
    index_status: index.status,
    warning: index.error ?? null,
    destination,
  };
}
