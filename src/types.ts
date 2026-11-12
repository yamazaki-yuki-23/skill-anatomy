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
  format?: ReportFormat;
}
export interface SourceIndexEntry {
  path: string;
  bytes: number;
  lines: number | null;
  expanded: boolean;
  reason?: string;
}
export interface SourceIndex {
  commit: string;
  directory: string;
  files: SourceIndexEntry[];
}
export interface DiscussionItem {
  number: number;
  kind: 'issue' | 'pull' | 'unknown';
  issue: unknown;
  comments: unknown[] | null;
  pull: unknown;
  reviews: unknown[] | null;
  'review_comments': unknown[] | null;
  files: unknown[] | null;
  errors: { endpoint: string; error: string }[];
}
export interface GithubIndex {
  status: 'available' | 'unavailable';
  items: unknown[];
  error?: string;
}
export interface SkillState {
  status: 'pending' | 'done';
  report: string;
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
  source: string;
  'source_index': string;
  approved: boolean;
  confirmation: string;
  format?: ReportFormat;
  files: Files;
  skills: Entry[];
}
