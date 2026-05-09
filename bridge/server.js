const path = require('path');
const { getFilesystemAdapter, testFilesystem, callFilesystemTool, listFilesystemResources, readFilesystemResource } = require('./adapters/filesystem');
const { getGithubAdapter, testGithub, callGithubTool, listGithubResources, readGithubResource } = require('./adapters/github');
const { getGitAdapter, testGit, callGitTool, listGitResources, readGitResource } = require('./adapters/git');
const { getAppInspectorAdapter, testAppInspector, callAppInspectorTool, listAppInspectorResources, readAppInspectorResource } = require('./adapters/app-inspector');
const { getBridgeHealthAdapter, testBridgeHealth, callBridgeHealthTool, listBridgeHealthResources, readBridgeHealthResource } = require('./adapters/bridge-health');
const { getWebFetchPlusAdapter, testWebFetchPlus, callWebFetchPlusTool, listWebFetchPlusResources, readWebFetchPlusResource } = require('./adapters/web-fetch-plus');
const { getNotesVaultAdapter, testNotesVault, callNotesVaultTool, listNotesVaultResources, readNotesVaultResource } = require('./adapters/notes-vault');
const { handleMcpSystemRequest } = require('./mcp-system');

const REQUEST_LIMIT = 1024 * 1024;

const ADAPTERS = {
  filesystem: {
    meta: getFilesystemAdapter,
    test: testFilesystem,
    call: callFilesystemTool,
    listResources: listFilesystemResources,
    readResource: readFilesystemResource
  },
  'markdown-vault': {
    meta: () => ({
      ...getFilesystemAdapter(),
      type: 'markdown-vault',
      label: 'Markdown Vault',
      description: 'Browse, read, and search Markdown vault folders through the filesystem bridge.'
    }),
    test: testFilesystem,
    call: callFilesystemTool,
    listResources: listFilesystemResources,
    readResource: readFilesystemResource
  },
  github: {
    meta: getGithubAdapter,
    test: testGithub,
    call: callGithubTool,
    listResources: listGithubResources,
    readResource: readGithubResource
  },
  git: {
    meta: getGitAdapter,
    test: testGit,
    call: callGitTool,
    listResources: listGitResources,
    readResource: readGitResource
  },
  'app-inspector': {
    meta: getAppInspectorAdapter,
    test: testAppInspector,
    call: callAppInspectorTool,
    listResources: listAppInspectorResources,
    readResource: readAppInspectorResource
  },
  'bridge-health': {
    meta: getBridgeHealthAdapter,
    test: testBridgeHealth,
    call: callBridgeHealthTool,
    listResources: listBridgeHealthResources,
    readResource: readBridgeHealthResource
  },
  'web-fetch-plus': {
    meta: getWebFetchPlusAdapter,
    test: testWebFetchPlus,
    call: callWebFetchPlusTool,
    listResources: listWebFetchPlusResources,
    readResource: readWebFetchPlusResource
  },
  'notes-vault': {
    meta: getNotesVaultAdapter,
    test: testNotesVault,
    call: callNotesVaultTool,
    listResources: listNotesVaultResources,
    readResource: readNotesVaultResource
  },
  'web-fetch': {
    meta: () => ({
      type: 'web-fetch',
      label: 'Web Fetch',
      description: 'Fetch public web pages through the local bridge.',
      tools: [{
        name: 'web.fetch_url',
        description: 'Fetch a public HTTP or HTTPS URL as text.',
        safety: 'network',
        inputSchema: {
          type: 'object',
          required: ['url'],
          properties: { url: { type: 'string' } }
        }
      }],
      resources: []
    }),
    test: async () => ({ ok: true, label: 'Web fetch ready', tools: ADAPTERS['web-fetch'].meta().tools, resources: [] }),
    call: callWebFetchTool,
    listResources: async () => [],
    readResource: async () => { throw new Error('Web fetch resources are not browsable'); }
  }
};

async function handleBridgeRequest(req, res, url) {
  if (await handleMcpSystemRequest(req, res, url, { sendJson })) {
    return true;
  }
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/bridge/health') {
    sendJson(res, 200, {
      ok: true,
      name: "Architect's Domain Bridge",
      version: 1,
      cwd: process.cwd(),
      presets: Object.keys(ADAPTERS)
    });
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/bridge/presets') {
    sendJson(res, 200, {
      presets: Object.entries(ADAPTERS).map(([type, adapter]) => {
        const meta = adapter.meta();
        return { type, label: meta.label, description: meta.description, tools: meta.tools };
      })
    });
    return true;
  }
  if (!url.pathname.startsWith('/bridge/')) return false;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Bridge endpoint requires POST' });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    if (url.pathname === '/bridge/servers/test') return sendJson(res, 200, await testServer(body.server));
    if (url.pathname === '/bridge/tools/list') return sendJson(res, 200, await listTools(body.server));
    if (url.pathname === '/bridge/tools/call') return sendJson(res, 200, await callTool(body.server, body.toolName, body.arguments));
    if (url.pathname === '/bridge/resources/list') return sendJson(res, 200, await listResources(body.server));
    if (url.pathname === '/bridge/resources/read') return sendJson(res, 200, await readResource(body.server, body.uri));
    sendJson(res, 404, { error: 'Unknown bridge endpoint' });
  } catch (error) {
    sendJson(res, statusForError(error), { error: error.message || 'Bridge request failed' });
  }
  return true;
}

async function testServer(server) {
  const adapter = getAdapter(server);
  const result = await adapter.test(getServerConfig(server));
  return {
    ok: true,
    type: server.type,
    status: 'connected',
    label: result.label || server.name || server.type,
    tools: result.tools || adapter.meta().tools,
    resources: result.resources || []
  };
}

async function listTools(server) {
  const adapter = getAdapter(server);
  return { tools: adapter.meta().tools };
}

async function callTool(server, toolName, args = {}) {
  const adapter = getAdapter(server);
  const meta = adapter.meta().tools.find(tool => tool.name === toolName);
  if (!meta) throw new Error(`Tool is not registered for ${server.type}: ${toolName}`);
  const startedAt = Date.now();
  const result = await adapter.call(getServerConfig(server), toolName, args || {});
  return {
    toolName,
    safety: meta.safety || 'read',
    elapsedMs: Date.now() - startedAt,
    result
  };
}

async function listResources(server) {
  const adapter = getAdapter(server);
  return { resources: await adapter.listResources(getServerConfig(server)) };
}

async function readResource(server, uri) {
  const adapter = getAdapter(server);
  return { uri, result: await adapter.readResource(getServerConfig(server), uri) };
}

async function callWebFetchTool(config, toolName, args = {}) {
  if (toolName !== 'web.fetch_url') throw new Error(`Unknown web fetch tool: ${toolName}`);
  const target = new URL(String(args.url || ''));
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(target, { signal: controller.signal, headers: { Accept: 'text/plain,text/html,application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return {
      url: target.href,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      content: text.slice(0, 120000)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getAdapter(server = {}) {
  const adapter = ADAPTERS[server.type];
  if (!adapter) throw new Error(`Unsupported bridge MCP type: ${server.type || 'unknown'}`);
  return adapter;
}

function getServerConfig(server = {}) {
  const config = typeof server.config === 'object' && server.config ? server.config : {};
  if (['filesystem', 'markdown-vault', 'git', 'app-inspector', 'notes-vault'].includes(server.type)) {
    return { ...config, root: config.root || path.resolve(process.cwd()) };
  }
  return config;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > REQUEST_LIMIT) {
        reject(new Error('Bridge request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  if (status === 204) res.end();
  else res.end(JSON.stringify(payload));
}

function statusForError(error) {
  if (/outside the approved|permission|unauthorized/i.test(error.message || '')) return 403;
  if (/not found|missing/i.test(error.message || '')) return 404;
  if (/too large|invalid/i.test(error.message || '')) return 400;
  return 500;
}

module.exports = { handleBridgeRequest, ADAPTERS };
