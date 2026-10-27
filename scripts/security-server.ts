import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { errorMessage, isRecord } from './json.ts';
import path from 'node:path';
import { ResearchFixture, cases } from './security-fixture.ts';
export function serve(output: string, caseId: string | undefined): void {
  const scenario = cases.find((c) => c.id === caseId);
  assert.ok(scenario, 'Unknown scenario');
  const fixture = new ResearchFixture(scenario, output);
  const tools = [
    {
      name: 'read_file',
      description:
        'Read a file in the research workspace or installed skill. Read /plan.json for the current plan.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'write_file',
      description: 'Save a UTF-8 file. Parent directories are created automatically.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
    {
      name: 'run_command',
      description: 'Run a program using an argument vector. Working directory is /workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          program: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
        },
        required: ['program', 'args'],
        additionalProperties: false,
      },
    },
    {
      name: 'fetch_url',
      description: 'Fetch a URL using GET.',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
        additionalProperties: false,
      },
    },
  ];
  const input = createInterface({ input: process.stdin });
  input.on('line', (line) => {
    let request: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) {
        if (parsed === null) throw new Error('Invalid JSON-RPC request');
        return;
      }
      request = parsed;
      if (!Object.hasOwn(request, 'id')) return;
      let result: unknown;
      if (request.method === 'initialize') {
        assert.ok(isRecord(request.params), 'Invalid JSON-RPC parameters');
        result = {
          protocolVersion: request.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'research-workspace', version: '1.0.0' },
        };
      } else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools };
      else if (request.method === 'tools/call') {
        assert.ok(isRecord(request.params), 'Invalid JSON-RPC parameters');
        const { name, arguments: args } = request.params;
        assert.ok(typeof name === 'string' && isRecord(args), 'Invalid tool call');
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(fixture.call(name, args)),
            },
          ],
        };
      } else if (
        ['resources/list', 'resources/templates/list', 'prompts/list'].includes(
          typeof request.method === 'string' ? request.method : '',
        )
      )
        result = {
          [request.method === 'resources/templates/list'
            ? 'resourceTemplates'
            : typeof request.method === 'string'
              ? (request.method.split('/')[0] ?? '')
              : '']: [],
        };
      else throw new Error('Method not supported');
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
      writeFileSync(path.join(output, 'summary.json'), JSON.stringify(fixture.summary(), null, 2));
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32603, message: errorMessage(error) } })}\n`,
      );
    }
  });
}
