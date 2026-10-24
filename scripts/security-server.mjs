import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { ResearchFixture, cases } from './security-fixture.mjs';
export function serve(output, caseId) {
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
    let request;
    try {
      request = JSON.parse(line);
      if (!Object.hasOwn(request, 'id')) return;
      let result;
      if (request.method === 'initialize')
        result = {
          protocolVersion: request.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'research-workspace', version: '1.0.0' },
        };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools };
      else if (request.method === 'tools/call')
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(fixture.call(request.params.name, request.params.arguments)),
            },
          ],
        };
      else if (
        ['resources/list', 'resources/templates/list', 'prompts/list'].includes(request.method)
      )
        result = {
          [request.method === 'resources/templates/list'
            ? 'resourceTemplates'
            : request.method.split('/')[0]]: [],
        };
      else throw new Error('Method not supported');
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
      writeFileSync(path.join(output, 'summary.json'), JSON.stringify(fixture.summary(), null, 2));
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32603, message: error.message } })}\n`,
      );
    }
  });
}
