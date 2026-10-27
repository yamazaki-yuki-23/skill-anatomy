import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { errorMessage, isRecord } from '../json.ts';

const snapshotFile = process.argv[2];
assert.ok(snapshotFile, 'Review snapshot path is required');
const snapshot: unknown = JSON.parse(readFileSync(snapshotFile, 'utf8'));
assert.ok(isRecord(snapshot) && isRecord(snapshot.files), 'Invalid review snapshot');
const files = snapshot.files;
assert.ok(
  Object.values(files).every((value) => typeof value === 'string'),
  'Invalid review snapshot files',
);
const tools = [
  {
    name: 'list_files',
    description: 'List the repository files available for this review.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_file',
    description:
      'Read a repository text file by its listed relative path. No other filesystem access is available.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
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
        serverInfo: { name: 'repository-review', version: '1.0.0' },
      };
    } else if (request.method === 'ping') result = {};
    else if (request.method === 'tools/list') result = { tools };
    else if (request.method === 'tools/call') {
      assert.ok(isRecord(request.params), 'Invalid JSON-RPC parameters');
      const { name, arguments: args } = request.params;
      let value;
      if (name === 'list_files')
        value = {
          files: Object.keys(files),
          excluded: snapshot.excluded,
          deleted: snapshot.deleted,
          commit: snapshot.commit,
        };
      else if (
        name === 'read_file' &&
        isRecord(args) &&
        typeof args.path === 'string' &&
        Object.hasOwn(files, args.path)
      )
        value = files[args.path];
      else throw new Error('Tool or file is outside the review snapshot');
      result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
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
    else throw new Error('Unsupported review operation');
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: request?.id ?? null,
        error: { code: -32603, message: errorMessage(error) },
      }) + '\n',
    );
  }
});
