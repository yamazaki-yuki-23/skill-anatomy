import { existsSync, readFileSync } from 'node:fs';
import { digest, sorted, sourceSignature } from './fingerprint.js';
import { htmlPath, inspectHtml } from './html.js';
import { inside, readJson, writeJson, withStateLock } from './storage.js';
import type { HtmlProgress, Plan, Progress, State } from './types.js';
export const VERSION = 2;
export function timestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function readPlan(planFile: string): Plan {
  let plan: Plan;
  try {
    plan = readJson<Plan>(planFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error('PLANが見つかりません。prepareで取得した最新PLANを使ってください');
    throw error;
  }
  if (!plan || plan.version !== VERSION) throw new Error('PLANのバージョンが異なります');
  return plan;
}
function loadActive(planFile: string): { plan: Plan; state: State } {
  const plan = readPlan(planFile);
  const state = readJson<State>(plan.state_file);
  if (state.version !== VERSION) throw new Error('状態ファイルのバージョンが異なります');
  if (state.active_plan !== plan.id)
    throw new Error('古いPLANです。同じリポジトリの最新PLANを使ってください');
  return { plan, state };
}
export function approve(planFile: string): unknown {
  return withActivePlan(planFile, ({ plan }) => {
    plan.approved = true;
    plan.confirmation = 'user-approved';
    writeJson(planFile, plan);
    return { approved: true, plan_file: planFile };
  });
}
function htmlProgress(report: string): HtmlProgress {
  const html = htmlPath(report);
  if (!existsSync(html)) return { report: html, status: 'missing' };
  return {
    report: html,
    status: inspectHtml(readFileSync(html, 'utf8')).length ? 'invalid' : 'valid',
  };
}
export function status(planFile: string): Progress {
  return withActivePlan(planFile, ({ plan, state }) => {
    const selected = plan.skills.filter((entry) => entry.selected);
    const skills = selected.map((entry) => ({
      skill: entry.skill,
      report: entry.report,
      status: state.skills[entry.skill]?.status ?? 'pending',
      html: htmlProgress(entry.report),
    }));
    const done = skills.filter((entry) => entry.status === 'done').length;
    const report = inside(plan.destination, 'repository-analysis.md');
    const recorded = state.repository;
    const repositoryDone =
      done === skills.length &&
      recorded !== null &&
      typeof recorded === 'object' &&
      'commit' in recorded &&
      recorded.commit === plan.commit &&
      'scope' in recorded &&
      recorded.scope === plan.scope &&
      'skills' in recorded &&
      Array.isArray(recorded.skills) &&
      digest(recorded.skills) === digest(selected.map((entry) => entry.skill)) &&
      'report_hash' in recorded &&
      existsSync(report) &&
      recorded.report_hash === digest(readFileSync(report, 'utf8'));
    return {
      format: plan.format ?? 'markdown',
      skills,
      repository: {
        report,
        status: repositoryDone ? 'done' : 'pending',
        html: htmlProgress(report),
      },
      done,
      total: skills.length,
    };
  });
}
export function checkHtml(planFile: string, skill?: string, repository = false): unknown {
  return withActivePlan(planFile, ({ plan }) => {
    let report: string;
    if (repository) report = inside(plan.destination, 'repository-analysis.md');
    else {
      if (!skill) throw new Error('--skillか--repositoryを指定してください');
      const entry = plan.skills.find((e) => e.selected && e.skill === skill);
      if (!entry) throw new Error('このPLANの分析対象ではないスキルです');
      report = entry.report;
    }
    const html = htmlPath(report);
    let text: string;
    try {
      text = readFileSync(html, 'utf8');
    } catch {
      throw new Error(`HTML版を先に保存してください: ${html}`);
    }
    const problems = inspectHtml(text);
    if (problems.length)
      throw new Error(
        `HTML版が条件を満たしません: ${html}\n${problems.map((p) => `- ${p}`).join('\n')}`,
      );
    return { checked: html, valid: true };
  });
}
function withActivePlan<T>(
  planFile: string,
  operation: (active: { plan: Plan; state: State }) => T,
): T {
  const plan = readPlan(planFile);
  return withStateLock(plan.state_file, () => operation(loadActive(planFile)));
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
  return withActivePlan(planFile, ({ plan, state }) => {
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
        index_status: plan.index_status,
        dependencies: uniqueDependencies,
        report_hash: digest(text),
      });
      state.repository = null;
    }
    writeJson(plan.state_file, state);
    return {
      saved: report,
      done: selected.filter((e) => state.skills[e.skill]?.status === 'done').length,
      total: selected.length,
    };
  });
}
