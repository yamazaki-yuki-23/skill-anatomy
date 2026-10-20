import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Version 2 retains the Rust release's checkpoint and fingerprint format.
export const VERSION = 2;
export const PACKAGE_ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
type Files = Record<string, string>;
export interface Target { owner: string; repo: string; tail: string[] }
export interface PrepareOptions { url: string; toolRoot: string; noConfirm?: boolean; refresh?: boolean }
export interface GithubIndex { status: 'available' | 'unavailable'; items: unknown[]; error?: string }
export interface SkillState {
  status: 'pending' | 'done'; report: string; dependencies: string[];
  source_signature: string; index_hash: string; report_hash: string;
  analyzed_commit: string | null; analyzed_at: string | null;
}
export interface State {
  version: number; active_plan: string; skills: Record<string, SkillState>;
  inventory: string[]; removed: string[]; repository: unknown;
}
export interface Entry { skill: string; report: string; status: 'pending' | 'done'; selected: boolean }
export interface Plan {
  version: number; id: string; created_at: string; url: string; owner: string; repo: string;
  commit: string; scope: string; target: string; cache: string; destination: string;
  state_file: string; plan_file: string; github_index: string; index_status: string;
  index_hash: string; approved: boolean; confirmation: string; files: Files; skills: Entry[];
}

export function timestamp(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
export function compareUtf8(a: string, b: string): number { return Buffer.compare(Buffer.from(a), Buffer.from(b)); }
function sorted(values: Iterable<string>): string[] { return [...values].sort(compareUtf8); }

// Match serde_json's sorted map serialization, including integer-looking keys.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('ハッシュ対象に未定義の値があります');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${sorted(Object.keys(record)).map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
export function digest(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }

export function run(program: string, args: string[]): string {
  const result = spawnSync(program, args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`${program}を起動できません: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${program}の実行に失敗: ${result.stderr?.toString('utf8').trim() || result.signal || result.status}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
}
function git(cache: string, args: string[]): string {
  return run('git', ['-c', 'core.hooksPath=/dev/null', '--git-dir', cache, ...args]);
}
export function readJson<T>(filename: string): T { return JSON.parse(readFileSync(filename, 'utf8')) as T; }
export function writeJson(filename: string, value: unknown): void {
  const parent = path.dirname(filename);
  mkdirSync(parent, { recursive: true });
  const temporary = path.join(parent, `.anatomy-${process.pid}-${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, filename);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
function physicalPath(input: string): string {
  const absolute = path.resolve(input);
  try { return realpathSync(absolute); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(physicalPath(parent), path.basename(absolute));
  }
}
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
export function inside(root: string, relative: string): string {
  root = physicalPath(root);
  let candidate = root;
  if (relative === '') return candidate;
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0')) throw new Error(`不正な保存先です: ${relative}`);
  for (const component of relative.split('/')) {
    if (['', '.', '..'].includes(component)) throw new Error(`不正な保存先です: ${relative}`);
    candidate = path.join(candidate, component);
    try {
      lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    candidate = realpathSync(candidate);
    if (!isWithin(root, candidate)) throw new Error(`保存先の範囲外です: ${relative}`);
  }
  return candidate;
}

export function defaultWorkspace(packageRoot = PACKAGE_ROOT, cwd = process.cwd(), configured = process.env.SKILL_ANATOMY_WORKSPACE): string {
  if (configured) return path.resolve(cwd, configured);
  if (existsSync(path.join(packageRoot, '.git'))) return packageRoot;
  if (isWithin(packageRoot, cwd)) throw new Error('スキルのインストール先の外で実行するか、SKILL_ANATOMY_WORKSPACEで保存先を指定してください');
  return cwd;
}

export function parseUrl(input: string): Target {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('GitHubのURLが不正です'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) {
    throw new Error('https://github.com/OWNER/REPO 形式のURLを指定してください');
  }
  // URL normalizes dot segments, so validate the original decoded path first.
  const rawPath = /^https:\/\/[^/]+(?:\/([^?#]*))?/i.exec(input)?.[1] ?? '';
  let decoded: string;
  try { decoded = decodeURIComponent(rawPath); } catch { throw new Error('URLのエンコードが不正です'); }
  const parts = decoded.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2 || parts.some(p => ['', '.', '..'].includes(p) || /[\u0000-\u001f\u007f-\u009f\\]/.test(p))) {
    throw new Error('URLのパスが不正です');
  }
  const owner = parts.shift()!.toLowerCase();
  const repo = parts.shift()!.replace(/\.git$/, '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(owner) || !/^[a-z0-9_.-]+$/.test(repo) || ['.', '..'].includes(repo)) {
    throw new Error('所有者名またはリポジトリ名が不正です');
  }
  if (parts.length && (parts.length < 2 || !['tree', 'blob'].includes(parts[0]!))) {
    throw new Error('リポジトリ、tree、blobのURLに対応しています');
  }
  return { owner, repo, tail: parts };
}

function acquire(target: Target, root: string): { cache: string; defaultRef: string } {
  const cache = inside(root, `.cache/repos/${target.owner}/${target.repo}.git`);
  const remote = `https://github.com/${target.owner}/${target.repo}.git`;
  if (!existsSync(cache)) {
    mkdirSync(path.dirname(cache), { recursive: true });
    run('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--bare', '--', remote, cache]);
  } else {
    git(cache, ['fetch', '--prune', remote, '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);
  }
  const refs = run('git', ['ls-remote', '--symref', remote, 'HEAD']);
  const defaultRef = /^ref: (refs\/heads\/[^\t]+)\tHEAD$/m.exec(refs)?.[1];
  if (!defaultRef) throw new Error('デフォルトブランチを取得できません。空のリポジトリか確認してください');
  return { cache, defaultRef };
}

export function resolveTarget(cache: string, defaultRef: string, tail: string[]): { commit: string; target: string; kind: string } {
  if (!tail.length) return { commit: git(cache, ['rev-parse', '--verify', `${defaultRef}^{commit}`]).trim(), target: '', kind: 'repository' };
  const [kind, ...segments] = tail;
  for (let size = segments.length; size > 0; size--) {
    const ref = segments.slice(0, size).join('/');
    const candidates = [`refs/heads/${ref}`, `refs/tags/${ref}`];
    if (/^[a-f0-9]{7,40}$/i.test(ref)) candidates.push(ref);
    for (const candidate of candidates) {
      try {
        const commit = git(cache, ['rev-parse', '--verify', `${candidate}^{commit}`]).trim();
        return { commit, target: segments.slice(size).join('/'), kind: kind! };
      } catch { /* Try the next ref. */ }
    }
  }
  throw new Error('URLのブランチ・タグ・コミットを解決できません');
}

function fileInventory(cache: string, commit: string): Files {
  const files: Files = Object.create(null) as Files;
  for (const record of git(cache, ['ls-tree', '-rz', '--full-tree', commit]).split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('Gitのファイル一覧が不正です');
    const [mode, kind, sha] = record.slice(0, tab).split(' ');
    if (['100644', '100755'].includes(mode!) && kind === 'blob' && sha) files[record.slice(tab + 1)] = sha;
  }
  return files;
}
function isSkill(name: string): boolean { return name === 'SKILL.md' || name.endsWith('/SKILL.md'); }
export function discover(files: Files, target: string, kind: string): { allSkills: string[]; selected: string[]; scope: string } {
  const allSkills = sorted(Object.keys(files).filter(isSkill));
  if (kind === 'repository' || (kind === 'tree' && !target)) return { allSkills, selected: [...allSkills], scope: 'repository' };
  if (kind === 'blob' && !allSkills.includes(target)) throw new Error('blobのURLはSKILL.mdを指定してください');
  const candidate = isSkill(target) ? target : `${target}/SKILL.md`;
  if (allSkills.includes(candidate)) return { allSkills, selected: [candidate], scope: 'skill' };
  if (kind === 'tree') {
    const selected = allSkills.filter(s => s.startsWith(`${target}/`));
    if (selected.length) return { allSkills, selected, scope: 'subtree' };
  }
  throw new Error('指定パスに通常ファイルのSKILL.mdがありません');
}

function folder(skill: string): string { return path.posix.dirname(skill); }
function encodeComponent(segment: string): string {
  return [...Buffer.from(segment)].map(byte =>
    /[a-z0-9_.-]/i.test(String.fromCharCode(byte)) ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
  ).join('');
}
export function reportPaths(skills: string[]): Record<string, string> {
  const mapping: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const skill of skills) {
    let parent = folder(skill);
    for (const prefix of ['.agents/skills/', '.claude/skills/', '.codex/skills/', 'skills/']) {
      if (parent.startsWith(prefix)) { parent = parent.slice(prefix.length); break; }
    }
    const name = parent === '.' ? 'root' : parent.split('/').map(encodeComponent).join('/');
    mapping[skill] = `skill-analyses/${name}.md`;
  }
  const counts = new Map<string, number>();
  for (const report of Object.values(mapping)) counts.set(report, (counts.get(report) ?? 0) + 1);
  for (const [skill, report] of Object.entries(mapping)) {
    if (counts.get(report)! > 1) mapping[skill] = `${report.slice(0, -3)}--${digest(skill).slice(0, 12)}.md`;
  }
  return mapping;
}

function fetchIndex(target: Target): GithubIndex {
  try {
    const endpoint = `repos/${target.owner}/${target.repo}/issues?state=all&per_page=100`;
    const pages = JSON.parse(run('gh', ['api', '--hostname', 'github.com', '--paginate', '--slurp', endpoint])) as Record<string, unknown>[][];
    if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) throw new Error('GitHubの索引形式が不正です');
    const keys = ['number', 'title', 'updated_at', 'comments', 'html_url', 'pull_request'];
    const items = pages.flat().map(item => Object.fromEntries(keys.map(key => [key, item[key] ?? null])));
    items.sort((a, b) => Number(a.number) - Number(b.number));
    return { status: 'available', items };
  } catch (error) {
    return { status: 'unavailable', items: [], error: (error as Error).message };
  }
}
function belongs(filename: string, parent: string): boolean { return parent === '.' || filename.startsWith(`${parent}/`); }
export function sourceSignature(cache: string, commit: string, files: Files, skill: string, allSkills: string[], dependencies: string[]): string {
  const parent = folder(skill);
  const roots = allSkills.map(folder).filter(p => p !== '.');
  const shared = new Set(Object.keys(files).filter(p => !roots.some(root => belongs(p, root))));
  const selected = Object.fromEntries(Object.entries(files).filter(([p]) => belongs(p, parent) || shared.has(p) || dependencies.includes(p)));
  const historyPaths = sorted(new Set([...shared, ...dependencies, parent]));
  const history = git(cache, ['log', commit, '--format=%H', '--', ...historyPaths]);
  return digest({ files: selected, history });
}

export function prepare(options: PrepareOptions): unknown {
  const target = parseUrl(options.url);
  mkdirSync(options.toolRoot, { recursive: true });
  const root = realpathSync(options.toolRoot);
  const { cache, defaultRef } = acquire(target, root);
  return prepareSnapshot(options, target, root, cache, defaultRef, fetchIndex(target));
}

export function prepareSnapshot(options: PrepareOptions, target: Target, root: string, cache: string, defaultRef: string, index: GithubIndex): Record<string, unknown> {
  const { commit, target: targetPath, kind } = resolveTarget(cache, defaultRef, target.tail);
  const files = fileInventory(cache, commit);
  const { allSkills, selected, scope } = discover(files, targetPath, kind);
  if (!selected.length) throw new Error('通常ファイルのSKILL.mdが見つかりませんでした');
  const destination = inside(root, `reports/${target.owner}/${target.repo}`);
  const stateFile = inside(destination, '.state.json');
  const state: State = existsSync(stateFile) ? readJson<State>(stateFile)
    : { version: VERSION, active_plan: '', skills: {}, inventory: [], removed: [], repository: null };
  if (state.version !== VERSION) throw new Error('状態ファイルのバージョンが異なります');
  const indexHash = digest({ status: index.status, items: index.items });
  const mappings = reportPaths(allSkills);
  const entries: Entry[] = [];
  for (const skill of allSkills) {
    const old: SkillState = state.skills[skill] ?? {
      status: 'pending', report: '', dependencies: [], source_signature: '', index_hash: '',
      report_hash: '', analyzed_commit: null, analyzed_at: null,
    };
    const report = mappings[skill]!;
    const signature = sourceSignature(cache, commit, files, skill, allSkills, old.dependencies);
    const reportPath = inside(destination, report);
    let reportHash: string | undefined;
    if (existsSync(reportPath)) reportHash = digest(readFileSync(reportPath, 'utf8'));
    const unchanged = !options.refresh && old.status === 'done' && old.source_signature === signature
      && old.index_hash === indexHash && index.status === 'available' && old.report === report && old.report_hash === reportHash;
    old.status = unchanged ? 'done' : 'pending';
    old.report = report;
    state.skills[skill] = old;
    entries.push({ skill, report: reportPath, status: old.status, selected: selected.includes(skill) });
  }
  const planRoot = inside(root, '.cache/plans');
  mkdirSync(planRoot, { recursive: true });
  const planDir = mkdtempSync(path.join(planRoot, 'run-'));
  const id = path.basename(planDir);
  const planFile = path.join(planDir, 'plan.json');
  const indexFile = path.join(planDir, 'github-index.json');
  const plan: Plan = {
    version: VERSION, id, created_at: timestamp(), url: options.url, owner: target.owner, repo: target.repo,
    commit, scope, target: targetPath, cache, destination, state_file: stateFile, plan_file: planFile,
    github_index: indexFile, index_status: index.status, index_hash: indexHash, approved: !!options.noConfirm,
    confirmation: options.noConfirm ? 'skipped-by-user' : 'required', files, skills: entries,
  };
  state.version = VERSION;
  state.active_plan = id;
  state.inventory = allSkills;
  state.removed = sorted(Object.keys(state.skills).filter(s => !allSkills.includes(s)));
  writeJson(indexFile, index);
  writeJson(planFile, plan);
  writeJson(stateFile, state);
  return { plan_file: planFile, commit, scope, total_skills: allSkills.length, selected_skills: selected.length,
    pending: entries.filter(e => e.selected && e.status === 'pending').map(e => e.skill),
    approved: plan.approved, index_status: index.status, warning: index.error ?? null, destination };
}

function loadActive(planFile: string): { plan: Plan; state: State } {
  const plan = readJson<Plan>(planFile);
  if (!plan || plan.version !== VERSION) throw new Error('PLANのバージョンが異なります');
  const state = readJson<State>(plan.state_file);
  if (state.version !== VERSION) throw new Error('状態ファイルのバージョンが異なります');
  if (state.active_plan !== plan.id) throw new Error('古いPLANです。同じリポジトリの最新PLANを使ってください');
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
  try { text = readFileSync(filename, 'utf8'); } catch { throw new Error(`分析ファイルを先に保存してください: ${filename}`); }
  if (!text.trim()) throw new Error(`分析ファイルが空です: ${filename}`);
  return text;
}
export function complete(planFile: string, skill?: string, repository = false, dependencies: string[] = []): unknown {
  const { plan, state } = loadActive(planFile);
  if (!plan.approved) throw new Error('分析方針が未承認です。ユーザーのOK後にapproveを実行してください');
  const selected = plan.skills.filter(e => e.selected);
  let report: string;
  if (repository) {
    if (selected.some(e => state.skills[e.skill]?.status !== 'done')) throw new Error('個別分析が未完了です');
    report = inside(plan.destination, 'repository-analysis.md');
    const text = ensureReport(report);
    state.repository = { commit: plan.commit, analyzed_at: timestamp(), scope: plan.scope,
      skills: selected.map(e => e.skill), report_hash: digest(text) };
  } else {
    if (!skill) throw new Error('--skillか--repositoryを指定してください');
    if (!selected.some(e => e.skill === skill)) throw new Error('このPLANの分析対象ではないスキルです');
    const uniqueDependencies = sorted(new Set(dependencies));
    if (uniqueDependencies.some(p => !Object.hasOwn(plan.files, p))) throw new Error('コミットに存在しない依存ファイルです');
    const current = state.skills[skill];
    if (!current) throw new Error('状態ファイルに対象スキルがありません');
    report = inside(plan.destination, current.report);
    const text = ensureReport(report);
    Object.assign(current, {
      source_signature: sourceSignature(plan.cache, plan.commit, plan.files, skill, state.inventory, uniqueDependencies),
      status: 'done', analyzed_commit: plan.commit, analyzed_at: timestamp(), index_hash: plan.index_hash,
      dependencies: uniqueDependencies, report_hash: digest(text),
    });
  }
  writeJson(plan.state_file, state);
  return { saved: report, done: selected.filter(e => state.skills[e.skill]?.status === 'done').length, total: selected.length };
}
