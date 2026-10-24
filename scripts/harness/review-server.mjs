import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
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
  let request;
  try {
    request = JSON.parse(line);
    if (!Object.hasOwn(request, 'id')) return;
    let result;
    if (request.method === 'initialize')
      result = {
        protocolVersion: request.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'repository-review', version: '1.0.0' },
      };
    else if (request.method === 'ping') result = {};
    else if (request.method === 'tools/list') result = { tools };
    else if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      let value;
      if (name === 'list_files')
        value = {
          files: Object.keys(snapshot.files),
          excluded: snapshot.excluded,
          deleted: snapshot.deleted,
          commit: snapshot.commit,
        };
      else if (
        name === 'read_file' &&
        typeof args?.path === 'string' &&
        Object.hasOwn(snapshot.files, args.path)
      )
        value = snapshot.files[args.path];
      else throw new Error('Tool or file is outside the review snapshot');
      result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } else if (
      ['resources/list', 'resources/templates/list', 'prompts/list'].includes(request.method)
    )
      result = {
        [request.method === 'resources/templates/list'
          ? 'resourceTemplates'
          : request.method.split('/')[0]]: [],
      };
    else throw new Error('Unsupported review operation');
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: request?.id ?? null,
        error: { code: -32603, message: error.message },
      }) + '\n',
    );
  }
});
