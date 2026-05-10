const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
let id = 0;

function makeTool(serverId, serverName, name, required = []) {
  return {
    kind: 'tool',
    serverId,
    serverName,
    name,
    description: `${name} test tool`,
    safety: name.startsWith('browser') ? 'external' : 'read',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
        text: { type: 'string' },
        value: { type: 'string' }
      },
      required
    }
  };
}

const servers = [
  {
    id: 'builtin-browser',
    name: 'Puppeteer Browser',
    type: 'browser',
    enabled: true,
    status: 'connected',
    capabilities: [
      makeTool('builtin-browser', 'Puppeteer Browser', 'browser_navigate', ['url']),
      makeTool('builtin-browser', 'Puppeteer Browser', 'browser_screenshot'),
      makeTool('builtin-browser', 'Puppeteer Browser', 'browser_extract_text')
    ],
    resources: [],
    prompts: []
  },
  {
    id: 'builtin-filesystem',
    name: 'Filesystem',
    type: 'filesystem',
    enabled: true,
    status: 'connected',
    capabilities: [
      makeTool('builtin-filesystem', 'Filesystem', 'read_file', ['path'])
    ],
    resources: [],
    prompts: []
  },
  {
    id: 'builtin-memory',
    name: 'Memory',
    type: 'memory',
    enabled: true,
    status: 'connected',
    capabilities: [
      makeTool('builtin-memory', 'Memory', 'memory_store', ['content'])
    ],
    resources: [],
    prompts: []
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
  CONFIG: { SITE_NAME: "Architect's Domain", VERSION: 'mcp-leak-test' },
  state: { mcpControl: { toolCallingMode: 'native' }, mcpLogs: [] },
  generateId: () => `leak-${++id}`,
  getWorkspaceMcpServers: () => servers,
  getActiveMcpTools: () => servers.flatMap(server => server.capabilities.map(tool => ({
    ...tool,
    serverId: server.id,
    serverName: server.name,
    permission: { enabled: true, requiresApproval: false, riskLevel: tool.safety || 'read' }
  }))),
  getMcpToolQualifiedName: tool => `${tool.serverId}:${tool.name}`,
  addMcpLog: async () => {}
};
context.window = context;
vm.createContext(context);

for (const file of ['scripts/mcp/host.js', 'scripts/mcp/parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}

const MCP = context.ArchitectMCP;

const leakedDslPattern = /<\s*\/?\s*(?:\|\s*)+(?:(?:DSM|DSML)\s*(?:\|\s*)+)?(?:tool_calls|invoke|parameter)\b|<\/?tool_calls?\b|<\/?mcp_call_tool\b|"tool_name"\s*:|"mcp_tool"\s*:/i;

const cases = [
  {
    name: 'screenshot leak from screenshot 3',
    text: `Let me also get a screenshot and extract the page text to understand the full interface.

< | | DSML | | tool_calls>
< | | DSML | | invoke name="moygttblcynlzwlcbg__browser_screenshot">
< | | DSML | | parameter name="url" string="true">http://localhost:3000/</ | | DSML | | parameter>
</ | | DSML | | invoke>
< | | DSML | | invoke name="moygttblcynlzwlcbg__browser_extract_text">
< | | DSML | | parameter name="url" string="true">http://localhost:3000/</ | | DSML | | parameter>
</ | | DSML | | invoke>
</ | | DSML | | tool_calls>`,
    expectedTools: ['browser_screenshot', 'browser_extract_text'],
    expectedVisible: 'Let me also get a screenshot and extract the page text to understand the full interface.'
  },
  {
    name: 'DSML no-argument screenshot leak',
    text: `< | | DSML | | tool_calls>
< | | DSML | | invoke name="moygttblcynlzwlcbg__browser_screenshot">
</ | | DSML | | invoke>
</ | | DSML | | tool_calls>`,
    expectedTools: ['browser_screenshot'],
    expectedVisible: ''
  },
  {
    name: 'HTML-escaped DSML no-argument screenshot leak',
    text: `&lt; | | DSML | | tool_calls&gt;
&lt; | | DSML | | invoke name=&quot;moygttblcynlzwlcbg__browser_screenshot&quot;&gt;
&lt;/ | | DSML | | invoke&gt;
&lt;/ | | DSML | | tool_calls&gt;`,
    expectedTools: ['browser_screenshot'],
    expectedVisible: ''
  },
  {
    name: 'HTML-escaped DSML screenshot with parameter leak',
    text: `Let me grab it.
&lt; | | DSML | | tool_calls&gt;
&lt; | | DSML | | invoke name=&quot;moygttblcynlzwlcbg__browser_screenshot&quot;&gt;
&lt; | | DSML | | parameter name=&quot;url&quot; string=&quot;true&quot;&gt;http://localhost:3000/&lt;/ | | DSML | | parameter&gt;
&lt;/ | | DSML | | invoke&gt;
&lt;/ | | DSML | | tool_calls&gt;`,
    expectedTools: ['browser_screenshot'],
    expectedVisible: 'Let me grab it.'
  },
  {
    name: 'compact DSM',
    text: `<|DSM|tool_calls><|DSM|invoke name="server:browser_extract_text"><|DSM|parameter name="url" string="true">localhost:3000</|DSM|parameter></|DSM|invoke></|DSM|tool_calls>`,
    expectedTools: ['browser_extract_text'],
    expectedVisible: ''
  },
  {
    name: 'spaces only pipe DSL',
    text: `< | tool_calls |>
< | invoke name="browser_screenshot" |>
< | parameter name="url" string="true" |>http://localhost:3000/</ | parameter |>
</ | invoke |>
</ | tool_calls |>`,
    expectedTools: ['browser_screenshot'],
    expectedVisible: ''
  },
  {
    name: 'XML direct',
    text: `<tool_calls name="browser_screenshot">
{"url":"http://localhost:3000/"}
</tool_calls>`,
    expectedTools: ['browser_screenshot'],
    expectedVisible: ''
  },
  {
    name: 'nested mcp_call_tool wrapper',
    text: `<tool_calls>
<tool_calls name="mcp_call_tool">
{"tool_name":"abc:browser_navigate","arguments":{"url":"http://localhost:3000/"}}
</tool_calls>
</tool_calls>`,
    expectedTools: ['browser_navigate'],
    expectedVisible: ''
  },
  {
    name: 'fenced JSON call',
    text: '```json\n{"tool_name":"browser_screenshot","arguments":{"url":"http://localhost:3000/"}}\n```',
    expectedTools: ['browser_screenshot'],
    expectedVisible: ''
  },
  {
    name: 'malformed DSM missing invoke name strips closed',
    text: `< | | DSML | | tool_calls>
< | | DSML | | invoke>
</ | | DSML | | invoke>
</ | | DSML | | tool_calls>`,
    expectedTools: [],
    expectedVisible: '',
    expectedError: 'MCP_MISSING_TOOL_NAME'
  },
  {
    name: 'regular markdown survives',
    text: 'README.md\n---\n[ ] task\n* just markdown\n`<not a tool>`',
    expectedTools: [],
    expectedVisible: 'README.md\n---\n[ ] task\n* just markdown\n`<not a tool>`'
  }
];

const dialects = [
  { name: 'generated compact DSM', open: tag => `<|DSM|${tag}>`, close: tag => `</|DSM|${tag}>` },
  { name: 'generated compact DSML', open: tag => `<|DSML|${tag}>`, close: tag => `</|DSML|${tag}>` },
  { name: 'generated spaced DSM', open: tag => `< | DSM | ${tag}>`, close: tag => `</ | DSM | ${tag}>` },
  { name: 'generated spaced DSML double-pipe', open: tag => `< | | DSML | | ${tag}>`, close: tag => `</ | | DSML | | ${tag}>` },
  { name: 'generated pipe-only trailing-pipe', open: tag => `< | ${tag} |>`, close: tag => `</ | ${tag} |>` },
  { name: 'generated dense pipe DSML', open: tag => `<||DSML||${tag}>`, close: tag => `</||DSML||${tag}>` }
];

for (const dialect of dialects) {
  cases.push({
    name: dialect.name,
    text: [
      dialect.open('tool_calls'),
      dialect.open('invoke name="generated__browser_screenshot"'),
      `${dialect.open('parameter name="url" string="true"')}http://localhost:3000/${dialect.close('parameter')}`,
      dialect.close('invoke'),
      dialect.close('tool_calls')
    ].join('\n'),
    expectedTools: ['browser_screenshot'],
    expectedVisible: ''
  });
}

for (const testCase of cases) {
  const parsed = MCP.parseModelToolCalls(testCase.text);
  const actualTools = Array.from(parsed.calls, call => String(call.toolName));
  assert.deepStrictEqual(actualTools, testCase.expectedTools, `${testCase.name}: wrong tools`);
  assert.strictEqual(parsed.visibleText, testCase.expectedVisible, `${testCase.name}: wrong visible text`);
  assert(!leakedDslPattern.test(parsed.visibleText), `${testCase.name}: visible text still contains MCP DSL`);
  if (testCase.expectedError) assert(parsed.errors.some(error => error.code === testCase.expectedError), `${testCase.name}: missing expected parser error`);

  const stripped = MCP.stripToolMarkup(testCase.text);
  assert.strictEqual(stripped, testCase.expectedVisible, `${testCase.name}: stripper mismatch`);
  assert(!leakedDslPattern.test(stripped), `${testCase.name}: stripped text still contains MCP DSL`);
}

console.log(`MCP leak tester passed ${cases.length} cases`);
