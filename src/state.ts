import { readFileSync } from 'node:fs';
import { digest, sorted, sourceSignature } from './fingerprint.js';
import { inside, readJson, writeJson } from './storage.js';
import type { Plan, State } from './types.js';
export const VERSION = 2;
export function timestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function loadActive(planFile: string): { plan: Plan; state: State } {
  const plan = readJson<Plan>(planFile);
  if (!plan || plan.version !== VERSION) throw new Error('PLANのバージョンが異なります');
  const state = readJson<State>(plan.state_file);
  if (state.version !== VERSION) throw new Error('状態ファイルのバージョンが異なります');
  if (state.active_plan !== plan.id)
    throw new Error('古いPLANです。同じリポジトリの最新PLANを使ってください');
  return { plan, state };
}
export function approve(planFile: string): unknown {
  const { plan } = loadActive(planFile);
  plan.approved = true;
  plan.confirmation = 'user-approved';
  writeJson(planFile, plan);
  return { approved: true, plan_file: planFile };
}
function ensureReport(filename: string): string {
  let text: string;
  try {
    text = readFileSync(filename, 'utf8');
  } catch {
    throw new Error(`分析ファイルを先に保存してください: ${filename}`);
  }
  if (!text.trim()) throw new Error(`分析ファイルが空です: ${filename}`);
  return text;
}
export function complete(
  planFile: string,
  skill?: string,
  repository = false,
  dependencies: string[] = [],
): unknown {
  const { plan, state } = loadActive(planFile);
  if (!plan.approved)
    throw new Error('分析方針が未承認です。ユーザーのOK後にapproveを実行してください');
  const selected = plan.skills.filter((e) => e.selected);
  let report: string;
  if (repository) {
    if (selected.some((e) => state.skills[e.skill]?.status !== 'done'))
      throw new Error('個別分析が未完了です');
    report = inside(plan.destination, 'repository-analysis.md');
    const text = ensureReport(report);
    state.repository = {
      commit: plan.commit,
      analyzed_at: timestamp(),
      scope: plan.scope,
      skills: selected.map((e) => e.skill),
      report_hash: digest(text),
    };
  } else {
    if (!skill) throw new Error('--skillか--repositoryを指定してください');
    if (!selected.some((e) => e.skill === skill))
      throw new Error('このPLANの分析対象ではないスキルです');
    const uniqueDependencies = sorted(new Set(dependencies));
    if (uniqueDependencies.some((p) => !Object.hasOwn(plan.files, p)))
      throw new Error('コミットに存在しない依存ファイルです');
    const current = state.skills[skill];
    if (!current) throw new Error('状態ファイルに対象スキルがありません');
    report = inside(plan.destination, current.report);
    const text = ensureReport(report);
    Object.assign(current, {
      source_signature: sourceSignature(
        plan.cache,
        plan.commit,
        plan.files,
        skill,
        state.inventory,
        uniqueDependencies,
      ),
      status: 'done',
      analyzed_commit: plan.commit,
      analyzed_at: timestamp(),
      index_hash: plan.index_hash,
      dependencies: uniqueDependencies,
      report_hash: digest(text),
    });
  }
  writeJson(plan.state_file, state);
  return {
    saved: report,
    done: selected.filter((e) => state.skills[e.skill]?.status === 'done').length,
    total: selected.length,
  };
}
