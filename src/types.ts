export type Files = Record<string, string>;
export interface Target {
  owner: string;
  repo: string;
  tail: string[];
}
export type ReportFormat = 'markdown' | 'html';
export interface PrepareOptions {
  url: string;
  workspace: string;
  noConfirm?: boolean;
  refresh?: boolean;
  format?: ReportFormat;
}
export interface GithubIndex {
  status: 'available' | 'unavailable';
  items: unknown[];
  error?: string;
}
export interface SkillState {
  status: 'pending' | 'done';
  report: string;
  dependencies: string[];
  'source_signature': string;
  'index_hash': string;
  'index_status'?: GithubIndex['status'];
  'report_hash': string;
  'analyzed_commit': string | null;
  'analyzed_at': string | null;
}
export interface State {
  version: number;
  'active_plan': string;
  skills: Record<string, SkillState>;
  inventory: string[];
  removed: string[];
  repository: unknown;
}
export interface Entry {
  skill: string;
  report: string;
  html: string;
  status: 'pending' | 'done';
  selected: boolean;
}
export type HtmlStatus = 'missing' | 'valid' | 'invalid';
export interface HtmlProgress {
  report: string;
  status: HtmlStatus;
}
export interface Progress {
  format: ReportFormat;
  skills: { skill: string; report: string; status: 'pending' | 'done'; html: HtmlProgress }[];
  repository: { report: string; status: 'pending' | 'done'; html: HtmlProgress };
  done: number;
  total: number;
}
export interface Plan {
  version: number;
  id: string;
  'created_at': string;
  url: string;
  owner: string;
  repo: string;
  commit: string;
  scope: string;
  target: string;
  cache: string;
  destination: string;
  'state_file': string;
  'plan_file': string;
  'github_index': string;
  'index_status': GithubIndex['status'];
  'index_hash': string;
  approved: boolean;
  confirmation: string;
  format?: ReportFormat;
  files: Files;
  skills: Entry[];
}
