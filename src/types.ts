export type Files = Record<string, string>;
export interface Target {
  owner: string;
  repo: string;
  tail: string[];
}
export interface PrepareOptions {
  url: string;
  workspace: string;
  noConfirm?: boolean;
  refresh?: boolean;
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
  status: 'pending' | 'done';
  selected: boolean;
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
  'index_status': string;
  'index_hash': string;
  approved: boolean;
  confirmation: string;
  files: Files;
  skills: Entry[];
}
