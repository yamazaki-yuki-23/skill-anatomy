import { randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { digest } from './hash.js';
import { htmlPath, inspectHtml } from './html.js';
import { renderReport } from './render.js';
import { inside, readJson, writeJson, withStateLock } from './storage.js';
import { readTemplate } from './templates.js';
import type { HtmlProgress, Plan, Progress, State } from './types.js';
export const VERSION = 3;
export const REPORT_BYTES_GUIDE = 20000;
export function timestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
export function readPlan(planFile: string): Plan {
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
// The HTML version is derived from the saved Markdown; a failure to write it is reported
// but never undoes the completion record.
function writeHtml(
  plan: Plan,
  report: string,
  text: string,
  skill: string | null,
  done: number,
  total: number,
  warnings: string[],
): string | null {
  const base = `https://github.com/${plan.owner}/${plan.repo}`;
  const meta =
    skill === null
      ? {
          url: `${base}/tree/${plan.commit}`,
          urlLabel: `${plan.owner}/${plan.repo}`,
          progress: `完了 ${done} / 未完了 ${total - done}`,
        }
      : {
          url: `${base}/blob/${plan.commit}/${skill}`,
          urlLabel: `${plan.owner}/${plan.repo}/${path.posix.dirname(skill)}`,
        };
  try {
    const target = htmlDestination(plan.destination, report);
    const kind = skill === null ? 'repository' : 'skill';
    const rendered = renderReport(text, readTemplate(`${kind}-analysis.html`), kind, {
      ...meta,
      commit: plan.commit,
      date: timestamp().slice(0, 10),
    });
    const problems = inspectHtml(rendered.html);
    if (problems.length)
      throw new Error(`生成したHTML版が安全条件を満たしません: ${problems.join('; ')}`);
    // Rename over the entry instead of truncating it, so an existing inode shared through
    // a hard link (for example the Markdown report) is never overwritten.
    const temporary = `${target}.${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
    let created = false;
    try {
      writeFileSync(temporary, rendered.html, { flag: 'wx' });
      created = true;
      renameSync(temporary, target);
    } catch (error) {
      // Only a file this call created is cleaned up; a pre-existing file is left alone.
      if (created) unlinkSync(temporary);
      throw error;
    }
    for (const warning of rendered.warnings)
      warnings.push(
        `HTML版で扱えない記法があります。Markdownを直して complete を再実行してください。${warning}`,
      );
    return target;
  } catch (error) {
    warnings.push(`HTML版を生成できませんでした: ${(error as Error).message}`);
    return null;
  }
}
// The HTML sibling is written only when it sits inside the destination and is not a
// symlink; a link planted beside the report must not redirect the write elsewhere.
function htmlDestination(destination: string, report: string): string {
  const relative = path.relative(destination, htmlPath(report)).split(path.sep).join('/');
  const unresolved = path.join(destination, ...relative.split('/'));
  try {
    const info = lstatSync(unresolved);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink > 1)
      throw new Error(`HTML版の保存先が通常ファイルではありません: ${unresolved}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return inside(destination, relative);
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
export function complete(planFile: string, skill?: string, repository = false): unknown {
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
      const current = state.skills[skill];
      if (!current) throw new Error('状態ファイルに対象スキルがありません');
      report = inside(plan.destination, current.report);
      const text = ensureReport(report);
      Object.assign(current, {
        status: 'done',
        analyzed_commit: plan.commit,
        analyzed_at: timestamp(),
        report_hash: digest(text),
      });
      state.repository = null;
    }
    writeJson(plan.state_file, state);
    const text = readFileSync(report, 'utf8');
    const reportBytes = Buffer.byteLength(text, 'utf8');
    const warnings: string[] = [];
    if (!repository && reportBytes > REPORT_BYTES_GUIDE)
      warnings.push(
        `個別分析が分量の目安（${REPORT_BYTES_GUIDE}バイト、承認済み見本の約2倍）を超えています: ${reportBytes}バイト。書き方の推敲手順に従って削るか、必要な理由を調査記録に残してください`,
      );
    const done = selected.filter((e) => state.skills[e.skill]?.status === 'done').length;
    const html = writeHtml(
      plan,
      report,
      text,
      repository ? null : skill!,
      done,
      selected.length,
      warnings,
    );
    return {
      saved: report,
      html,
      report_bytes: reportBytes,
      done,
      total: selected.length,
      ...(warnings.length ? { warnings } : {}),
    };
  });
}
