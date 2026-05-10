const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
let id = 0;

const servers = [
  {
    id: 'builtin-browser',
    name: 'Puppeteer Browser',
    type: 'browser',
    transport: 'mcp-system',
    enabled: true,
    status: 'connected',
    capabilities: [
      tool('builtin-browser', 'Puppeteer Browser', 'browser_navigate', ['url']),
      tool('builtin-browser', 'Puppeteer Browser', 'browser_screenshot'),
      tool('builtin-browser', 'Puppeteer Browser', 'browser_extract_text')
    ],
    resources: [],
    prompts: [],
    permissions: {}
  },
  {
    id: 'builtin-filesystem',
    name: 'Filesystem',
    type: 'filesystem',
    transport: 'mcp-system',
    enabled: true,
    status: 'connected',
    capabilities: [
      tool('builtin-filesystem', 'Filesystem', 'read_file', ['path']),
      tool('builtin-filesystem', 'Filesystem', 'write_file', ['path', 'content'])
    ],
    resources: [],
    prompts: [],
    permissions: {}
  },
  {
    id: 'builtin-memory',
    name: 'Memory',
    type: 'memory',
    transport: 'mcp-system',
    enabled: true,
    status: 'connected',
    capabilities: [
      tool('builtin-memory', 'Memory', 'memory_store', ['content']),
      tool('builtin-memory', 'Memory', 'memory_recall', ['query']),
      tool('builtin-memory', 'Memory', 'memory_list')
    ],
    resources: [],
    prompts: [],
    permissions: {}
  }
];

const context = {
  console,
  URL,
  Date,
  Math,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
  window: null,
  location: { protocol: 'http:', origin: 'http://localhost:3000' },
  CONFIG: { SITE_NAME: "Architect's Domain", VERSION: 'test' },
  state: {
    mcpControl: { toolCallingMode: 'native', approvalQueue: [], sessionApprovals: {}, status: { browser: { open: true, currentUrl: 'http://localhost:3000/' } } },
    mcpExecutions: [],
    mcpLogs: []
  },
  generateId: () => `id-${++id}`,
  getWorkspaceMcpServers: () => servers,
  getActiveMcpTools: () => servers.flatMap(server => server.capabilities.map(entry => ({
    ...entry,
    serverId: server.id,
    serverName: server.name,
    permission: { enabled: true, requiresApproval: false, riskLevel: entry.safety || 'read' }
  }))),
  getMcpToolQualifiedName: item => `${item.serverId}:${item.name}`,
  getMcpToolByQualifiedName(name) {
    return context.getActiveMcpTools().find(item => `${item.serverId}:${item.name}` === name || item.name === name);
  },
  isMcpServerActiveInCurrentChat: () => true,
  isMcpToolEnabledForChat: () => true,
  requiresMcpApproval: () => false,
  mcpRuntimeCallTool: async (server, name, args) => ({ ok: true, server: server.type, name, args }),
  renderMcpExecutionCards: () => {},
  renderMcpServers: () => {},
  updateContextInspector: () => {},
  saveMcpServers: async () => {},
  addMcpLog: async () => {},
  refreshMcpControlData: async () => {},
  mcpSystemRequest: async () => ({ result: { reset: true } }),
  confirmMcpSystemOperation: async () => ({ result: { confirmed: true } })
};
context.window = context;
vm.createContext(context);

for (const file of [
  'scripts/mcp/host.js',
  'scripts/mcp/parser.js',
  'scripts/mcp/commands.js',
  'scripts/mcp/executor.js',
  'scripts/mcp/renderer.js',
  'scripts/mcp/health.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}

const MCP = context.ArchitectMCP;

function tool(serverId, serverName, name, required = []) {
  return {
    kind: 'tool',
    serverId,
    serverName,
    name,
    description: `${name} test tool`,
    safety: name.includes('write') || name.includes('store') ? 'destructive' : name.startsWith('browser') ? 'external' : 'read',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
        query: { type: 'string' }
      },
      required
    }
  };
}

function names(calls) {
  return calls.map(call => call.name);
}

async function main() {
  assert.equal(MCP.parseDirectCommand('/mcp tools').type, 'list_tools');
  assert.equal(MCP.parseDirectCommand('/mcp list').type, 'list_tools');
  assert.equal(MCP.parseDirectCommand('/mcp health').type, 'health');
  assert.equal(MCP.parseDirectCommand('/mcp refresh').type, 'refresh');

  let command = MCP.parseDirectCommand('/browser text localhost:3000');
  assert.equal(command.type, 'tool_calls');
  assert.equal(command.toolCalls[0].name, 'builtin-browser:browser_extract_text');
  assert.equal(command.toolCalls[0].arguments.url, 'http://localhost:3000/');

  command = MCP.parseDirectCommand('/browser screenshot');
  assert.equal(command.toolCalls[0].name, 'builtin-browser:browser_screenshot');
  assert.deepEqual(command.toolCalls[0].arguments, {});

  command = MCP.parseDirectCommand('/puppeteer navigate http://localhost:3000/');
  assert.equal(command.toolCalls[0].name, 'builtin-browser:browser_navigate');

  command = MCP.parseDirectCommand('/mcp browser_navigate http://localhost:3000/');
  assert.equal(command.toolCalls[0].arguments.url, 'http://localhost:3000/');

  command = MCP.parseDirectCommand('/mcp memory_store hello world');
  assert.equal(command.toolCalls[0].name, 'builtin-memory:memory_store');
  assert.equal(command.toolCalls[0].arguments.content, 'hello world');
  assert.equal(MCP.parseDirectCommand('/mcp memory_store').error, 'Memory content is required.');

  command = MCP.parseDirectCommand('/fs read README.md');
  assert.equal(command.toolCalls[0].name, 'builtin-filesystem:read_file');
  assert.equal(command.toolCalls[0].arguments.path, 'README.md');

  command = MCP.parseDirectCommand('/mcp call browser_navigate {"url":"http://localhost:3000/"}');
  assert.equal(command.toolCalls[0].name, 'builtin-browser:browser_navigate');
  assert.equal(MCP.parseDirectCommand('/mcp not_a_tool x').error, 'Unknown MCP command or tool not available.');
  assert.equal(MCP.parseDirectCommand('ordinary markdown message').handled, false);

  const executed = await MCP.executeDirectCommand('/mcp browser_screenshot http://localhost:3000/');
  assert.equal(executed.handled, true);
  assert.equal(executed.executions[0].status, 'success');

  assert.equal(MCP.normalizeToolRequest({ tool: 'builtin-browser:browser_screenshot', arguments: {} }).call.toolName, 'browser_screenshot');
  assert.equal(MCP.normalizeToolRequest({ tool: 'server:browser_screenshot', arguments: {} }).call.toolName, 'browser_screenshot');
  assert.equal(MCP.normalizeToolRequest({ tool: 'puppeteer_screenshot', arguments: {} }).call.toolName, 'browser_screenshot');
  assert.equal(MCP.normalizeToolRequest({ tool: 'delete_everything', arguments: {} }).ok, false);
  assert.equal(MCP.normalizeToolRequest({ tool: 'delete_everything', arguments: {} }).error.code, 'MCP_TOOL_NOT_AVAILABLE');

  const duplicateServer = {
    id: 'other-browser',
    name: 'Other Browser',
    type: 'browser',
    enabled: true,
    status: 'connected',
    capabilities: [tool('other-browser', 'Other Browser', 'browser_screenshot')]
  };
  servers.push(duplicateServer);
  assert.equal(MCP.normalizeToolRequest({ tool: 'browser_screenshot', arguments: {} }).error.code, 'MCP_TOOL_AMBIGUOUS');
  servers.pop();

  let parsed = MCP.parseModelToolCalls('<tool_calls name="browser_screenshot">{"url":"http://localhost:3000/"}</tool_calls>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_screenshot']);
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('<tool_calls><tool_calls name="mcp_call_tool">{"tool_name":"abc:browser_navigate","arguments":{"url":"http://localhost:3000/"}}</tool_calls></tool_calls>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_navigate']);

  parsed = MCP.parseModelToolCalls('<mcp_call_tool>{"tool_name":"browser_navigate","arguments":{"url":"http://localhost:3000/"}}</mcp_call_tool>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_navigate']);

  parsed = MCP.parseModelToolCalls('< | DSM | tool_calls>\n< | DSM | invoke name="moygttblcynlzwlcbg:browser_extract_text">\n< | DSM | parameter name="url" string="true">http://localhost:3000/</ | DSM | parameter>\n</ | DSM | invoke>\n</ | DSM | tool_calls>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_extract_text']);
  assert.equal(parsed.calls[0].arguments.url, 'http://localhost:3000/');
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('< | DSML | | tool_calls>\n< | DSML | | invoke name="moygttblcynlzwlcbg__:browser_screenshot">\n< | DSML | | parameter name="url" string="true">http://localhost:3000/</ | DSML | | parameter>\n</ | DSML | | invoke>\n</ | DSML | | tool_calls>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_screenshot']);
  assert.equal(parsed.calls[0].arguments.url, 'http://localhost:3000/');
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('< | | DSML | | tool_calls>\n< | | DSML | | invoke name="moygttblcynlzwlcbg__browser_screenshot">\n</ | | DSML | | invoke>\n</ | | DSML | | tool_calls>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_screenshot']);
  assert.deepEqual(parsed.calls[0].arguments, {});
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('< | | DSML | | tool_calls>\n< | | DSML | | invoke name="moygttblcynlzwlcbg__browser_extract_text">\n</ | | DSML | | invoke>\n</ | | DSML | | tool_calls>');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_extract_text']);
  assert.deepEqual(parsed.calls[0].arguments, {});
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('```json\n{"tool_name":"browser_navigate","arguments":{"url":"http://localhost:3000/"}}\n```');
  assert.deepEqual(names(parsed.calls), ['builtin-browser:browser_navigate']);
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('<tool_calls name="browser_screenshot">{"url":"http://localhost:3000/",}</tool_calls>');
  assert.equal(parsed.calls[0].name, 'builtin-browser:browser_screenshot');
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('<tool_calls name="browser_screenshot">{"url":"http://localhost:3000/"}');
  assert.equal(parsed.calls[0].name, 'builtin-browser:browser_screenshot');
  assert.equal(parsed.visibleText, '');

  parsed = MCP.parseModelToolCalls('< | DSM | tool_calls>\n< | DSM | invoke>\n</ | DSM | invoke>\n</ | DSM | tool_calls>');
  assert.equal(parsed.calls.length, 0);
  assert.equal(parsed.errors[0].code, 'MCP_MISSING_TOOL_NAME');
  assert.equal(parsed.visibleText, '');

  const markdown = 'README.md\n---\n[ ] task\n*';
  assert.equal(MCP.stripToolMarkup(markdown), markdown);

  const rendered = MCP.renderToolResult({
    id: 'secret-test',
    status: 'success',
    serverName: 'MCP',
    toolName: 'secret',
    qualifiedName: 'secret',
    args: { apiKey: 'should-not-leak' },
    result: { token: 'should-not-leak', ok: true }
  });
  assert(!rendered.toolRawOutput.includes('should-not-leak'));
  assert(!JSON.stringify(rendered.toolArgs).includes('should-not-leak'));

  console.log('MCP host tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
