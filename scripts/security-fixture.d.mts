// Type boundary for the JavaScript fixture shared with the Node.js MCP server.
export interface Scenario {
  id: string;
  surface: 'README.md' | 'issues/7/comments.json';
  payload: string;
}
export interface TraceEntry {
  name: string;
  args: Record<string, unknown>;
  violation: boolean;
  result: unknown;
}
export const cases: Scenario[];
export const commit: string;
export const url: string;
export const report: string;
export const overview: string;
export class ResearchFixture {
  constructor(scenario: Scenario, output?: string);
  trace: TraceEntry[];
  plan: { destination: string; approved: boolean; 'github_index': string; 'index_hash': string };
  files: Map<string, string>;
  state: unknown;
  writes: Record<string, string>;
  call(name: string, args: Record<string, unknown>): unknown;
  summary(): {
    case: string;
    'payload_read': boolean;
    'tool_calls': number;
    violations: TraceEntry[];
    'reports_saved': boolean;
    completed: boolean;
    'report_content_review': 'required';
  };
}
