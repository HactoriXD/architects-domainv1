const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'mcp-config.json');
const MEMORY_PATH = path.join(ROOT, 'mcp-memory.json');
const AUDIT_PATH = path.join(ROOT, 'mcp-audit.log');
const REQUEST_LOG_LIMIT = 100;
const SEARCH_RESULT_LIMIT = 50;
const MAX_READ_BYTES = 1024 * 1024;
const PENDING_TTL_MS = 5 * 60 * 1000;
const BROWSER_IDLE_MS = 10 * 60 * 1000;

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.py', '.csv', '.xml',
  '.yml', '.yaml', '.toml', '.ini', '.env', '.gitignore', '.c', '.cpp', '.h',
  '.hpp', '.java', '.rb', '.go', '.rs', '.php', '.sql', '.log'
]);

const MIME_TYPES = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
};

const pendingOperations = new Map();
const requestLog = [];
let browserState = {
  browser: null,
  page: null,
  currentUrl: '',
  launchedAt: 0,
  lastUsedAt: 0,
  idleTimer: null
};

const BUILT_IN_TOOLS = {
  filesystem: [
    tool('read_file', 'Read a text file inside an approved root.', 'read', { path: schemaString('Absolute or approved-root-relative file path.') }, ['path']),
    tool('write_file', 'Prepare a confirmed write inside an approved root.', 'destructive', {
      path: schemaString('Absolute or approved-root-relative file path.'),
      content: schemaString('Text content to write.'),
      mode: { type: 'string', enum: ['overwrite', 'append'] }
    }, ['path', 'content']),
    tool('list_directory', 'List files and folders inside an approved root.', 'read', {
      path: schemaString('Directory path.'),
      recursive: { type: 'boolean', default: false }
    }, ['path']),
    tool('search_files', 'Search approved files by filename or text content.', 'read', {
      path: schemaString('Directory path to search.'),
      query: schemaString('Search query.'),
      type: { type: 'string', enum: ['filename', 'content'] }
    }, ['path', 'query', 'type']),
    tool('get_file_info', 'Return file metadata without reading content.', 'read', { path: schemaString('File path.') }, ['path'])
  ],
  memory: [
    tool('memory_store', 'Prepare a confirmed durable memory save.', 'destructive', {
      content: schemaString('Memory content.'),
      tags: { type: 'array', items: { type: 'string' } },
      importance: { type: 'string', enum: ['low', 'medium', 'high'] },
      workspace: schemaString('Optional workspace scope.')
    }, ['content']),
    tool('memory_recall', 'Retrieve relevant memories by keyword and importance.', 'read', {
      query: schemaString('Recall query.'),
      limit: { type: 'number', default: 10 },
      workspace: schemaString('Optional workspace scope.'),
      tags: { type: 'array', items: { type: 'string' } }
    }, ['query']),
    tool('memory_list', 'List stored memories with optional filters.', 'read', {
      workspace: schemaString('Optional workspace scope.'),
      tags: { type: 'array', items: { type: 'string' } },
      importance: { type: 'string', enum: ['low', 'medium', 'high'] },
      limit: { type: 'number', default: 25 },
      offset: { type: 'number', default: 0 }
    }),
    tool('memory_update', 'Update an existing memory.', 'destructive', {
      id: schemaString('Memory ID.'),
      content: schemaString('Updated memory content.'),
      tags: { type: 'array', items: { type: 'string' } },
      importance: { type: 'string', enum: ['low', 'medium', 'high'] }
    }, ['id']),
    tool('memory_delete', 'Delete one memory by ID.', 'destructive', { id: schemaString('Memory ID.') }, ['id']),
    tool('memory_clear_workspace', 'Delete all memories for a workspace.', 'destructive', { workspace: schemaString('Workspace scope.') }, ['workspace'])
  ],
  browser: [
    tool('browser_navigate', 'Open a URL in the persistent headless browser.', 'network', {
      url: schemaString('HTTP or HTTPS URL.'),
      waitFor: { type: 'string', enum: ['load', 'networkidle', 'selector'], default: 'load' },
      selector: schemaString('Selector required when waitFor is selector.')
    }, ['url']),
    tool('browser_extract_text', 'Extract readable page text from a URL or selector.', 'network', {
      url: schemaString('HTTP or HTTPS URL.'),
      selector: schemaString('Optional CSS selector.')
    }, ['url']),
    tool('browser_extract_structured', 'Extract page text for frontend model-based schema extraction.', 'network', {
      url: schemaString('HTTP or HTTPS URL.'),
      schema: { type: 'object', description: 'Desired output JSON schema.' }
    }, ['url', 'schema']),
    tool('browser_screenshot', 'Capture a PNG screenshot of a URL or current page.', 'network', {
      url: schemaString('Optional HTTP or HTTPS URL.'),
      fullPage: { type: 'boolean', default: true }
    }),
    tool('browser_search', 'Search the web and return result titles, URLs, and snippets.', 'network', {
      query: schemaString('Search query.'),
      engine: { type: 'string', enum: ['google', 'bing', 'duckduckgo'] },
      maxResults: { type: 'number', default: 5 }
    }, ['query']),
    tool('browser_click', 'Click an element on the current page.', 'network', {
      selector: schemaString('CSS selector.'),
      text: schemaString('Visible text to click instead of selector.')
    }),
    tool('browser_type', 'Type text into an input on the current page.', 'network', {
      selector: schemaString('CSS selector.'),
      text: schemaString('Text to type.'),
      submit: { type: 'boolean', default: false }
    }, ['selector', 'text'])
  ]
};

async function handleMcpSystemRequest(req, res, url, helpers = {}) {
  if (!url.pathname.startsWith('/mcp/')) return false;
  const sendJson = helpers.sendJson || defaultSendJson;
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  const startedAt = Date.now();
  const parts = url.pathname.split('/').filter(Boolean);
  const server = parts[1] || '';
  const toolName = parts[2] || '';
  let body = {};
  let success = false;
  try {
    if (req.method !== 'GET') body = await readJsonBody(req);
    let payload;
    if (req.method === 'GET' && url.pathname === '/mcp/status') payload = await getMcpStatus();
    else if (req.method === 'GET' && url.pathname === '/mcp/tools/all') payload = await getAllTools({ includeInactive: url.searchParams.get('includeInactive') === 'true' });
    else if (req.method === 'GET' && url.pathname === '/mcp/log') payload = { success: true, calls: requestLog };
    else if (req.method === 'GET' && url.pathname === '/mcp/config') payload = { success: true, config: await readConfig(), memory: await getMemoryStats() };
    else if (req.method === 'PUT' && url.pathname === '/mcp/config') payload = { success: true, config: await writeConfig(body.config || body) };
    else if (req.method === 'POST' && server === 'browser' && toolName === 'session' && parts[3] === 'reset') payload = { success: true, result: await resetBrowserSession() };
    else if (req.method === 'POST' && server === 'filesystem' && toolName === 'confirm') payload = { success: true, result: await confirmPendingOperation(parts[3], 'filesystem') };
    else if (req.method === 'POST' && server === 'memory' && toolName === 'confirm') payload = { success: true, result: await confirmPendingOperation(parts[3], 'memory') };
    else if (req.method === 'POST' && server === 'system' && toolName === 'reset') payload = { success: true, result: await resetMcpSystemData() };
    else if (req.method === 'POST' && BUILT_IN_TOOLS[server]?.some(item => item.name === toolName)) payload = { success: true, result: await callBuiltInTool(server, toolName, body.arguments || body) };
    else throw createHttpError(404, 'NOT_FOUND', 'Unknown MCP endpoint');
    success = true;
    logRequest({ server: server || 'system', tool: toolName || url.pathname, parameters: body, duration: Date.now() - startedAt, success });
    sendJson(res, 200, payload);
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || 'MCP_ERROR';
    logRequest({ server: server || 'system', tool: toolName || url.pathname, parameters: body, duration: Date.now() - startedAt, success: false });
    sendJson(res, status, {
      success: false,
      error: {
        code,
        message: error.message || 'MCP request failed',
        tool: toolName || null,
        server: server || null
      }
    });
  }
  return true;
}

async function callBuiltInTool(server, name, args = {}) {
  await assertBuiltInToolAllowed(server, name);
  if (server === 'filesystem') return callFilesystem(name, args);
  if (server === 'memory') return callMemory(name, args);
  if (server === 'browser') return callBrowser(name, args);
  throw createHttpError(404, 'UNKNOWN_SERVER', `Unknown MCP server: ${server}`);
}

async function assertBuiltInToolAllowed(server, name) {
  const config = await readConfig();
  const serverConfig = config[server] || {};
  const toolEntry = BUILT_IN_TOOLS[server]?.find(item => item.name === name);
  if (!toolEntry) throw createHttpError(404, 'UNKNOWN_TOOL', `Unknown ${server} tool: ${name}`);
  const permission = serverConfig.toolPermissions?.[name] || {};
  if (permission.enabled === false) throw createHttpError(403, 'TOOL_DISABLED', `${name} is disabled in MCP permissions`);
  const risk = permission.riskLevel || toolEntry.safety;
  if (server === 'filesystem') {
    if (risk === 'read' && serverConfig.readEnabled === false) throw createHttpError(403, 'READ_DISABLED', 'Filesystem read tools are disabled');
    if (['write', 'destructive'].includes(risk) && serverConfig.writeEnabled === false) throw createHttpError(403, 'WRITE_DISABLED', 'Filesystem write tools are disabled');
  }
  if (server === 'browser') {
    if (serverConfig.networkAccess === false) throw createHttpError(403, 'NETWORK_DISABLED', 'Browser network access is disabled');
    if (name === 'browser_screenshot' && serverConfig.screenshotsEnabled === false) throw createHttpError(403, 'SCREENSHOTS_DISABLED', 'Browser screenshots are disabled');
  }
  if (server === 'memory' && !['memory_recall', 'memory_list'].includes(name) && serverConfig.persistence === false) {
    throw createHttpError(403, 'PERSISTENCE_DISABLED', 'Memory persistence is disabled');
  }
}

async function getMcpStatus() {
  const config = await readConfig();
  const memory = await getMemoryStats();
  const filesystemConfigured = (config.filesystem.allowedPaths || []).length > 0;
  const servers = [
    {
      id: 'builtin-filesystem',
      name: config.filesystem.name || 'Filesystem',
      type: 'filesystem',
      status: filesystemConfigured ? 'online' : 'unconfigured',
      statusState: filesystemConfigured ? 'connected' : 'needs_configuration',
      toolCount: getEnabledBuiltInTools('filesystem', config).length,
      active: Boolean(config.filesystem.active),
      allowedPaths: config.filesystem.allowedPaths || []
    },
    {
      id: 'builtin-browser',
      name: config.browser.name || 'Puppeteer Browser',
      type: 'browser',
      status: 'online',
      statusState: 'connected',
      toolCount: getEnabledBuiltInTools('browser', config).length,
      active: Boolean(config.browser.active),
      session: getBrowserSessionStatus()
    },
    {
      id: 'builtin-memory',
      name: config.memory.name || 'Memory',
      type: 'memory',
      status: 'online',
      statusState: 'connected',
      toolCount: getEnabledBuiltInTools('memory', config).length,
      active: Boolean(config.memory.active),
      memory
    }
  ];
  return {
    success: true,
    servers,
    totals: {
      configuredServers: servers.filter(server => server.status !== 'unconfigured').length,
      toolsAvailable: servers.reduce((sum, server) => sum + server.toolCount, 0),
      activeTools: servers.filter(server => server.active).reduce((sum, server) => sum + server.toolCount, 0)
    },
    browser: getBrowserSessionStatus()
  };
}

async function getAllTools(options = {}) {
  const config = await readConfig();
  const servers = ['filesystem', 'browser', 'memory'];
  const tools = [];
  for (const server of servers) {
    if (!options.includeInactive && !config[server]?.active) continue;
    for (const entry of getEnabledBuiltInTools(server, config)) {
      const permission = config[server]?.toolPermissions?.[entry.name] || {};
      tools.push({
        ...entry,
        safety: permission.riskLevel || entry.safety,
        requiresApproval: typeof permission.requiresApproval === 'boolean' ? permission.requiresApproval : entry.safety !== 'read',
        server,
        qualifiedName: `${server}.${entry.name}`,
        parameters: entry.inputSchema?.properties || {}
      });
    }
  }
  return { success: true, tools };
}

function getEnabledBuiltInTools(server, config) {
  const serverConfig = config[server] || {};
  return (BUILT_IN_TOOLS[server] || []).filter(entry => {
    const permission = serverConfig.toolPermissions?.[entry.name] || {};
    if (permission.enabled === false) return false;
    const risk = permission.riskLevel || entry.safety;
    if (server === 'filesystem') {
      if (risk === 'read' && serverConfig.readEnabled === false) return false;
      if (['write', 'destructive'].includes(risk) && serverConfig.writeEnabled === false) return false;
    }
    if (server === 'browser') {
      if (serverConfig.networkAccess === false) return false;
      if (entry.name === 'browser_screenshot' && serverConfig.screenshotsEnabled === false) return false;
    }
    if (server === 'memory' && !['memory_recall', 'memory_list'].includes(entry.name) && serverConfig.persistence === false) return false;
    return true;
  });
}

async function callFilesystem(name, args) {
  if (name === 'read_file') return readFile(args.path);
  if (name === 'write_file') return prepareWriteFile(args);
  if (name === 'list_directory') return listDirectory(args.path, Boolean(args.recursive));
  if (name === 'search_files') return searchFiles(args);
  if (name === 'get_file_info') return getFileInfo(args.path);
  throw createHttpError(404, 'UNKNOWN_TOOL', `Unknown filesystem tool: ${name}`);
}

async function readFile(inputPath) {
  const filePath = await resolveAllowedPath(inputPath);
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw createHttpError(400, 'NOT_FILE', 'Path is not a file');
  if (stat.size > MAX_READ_BYTES) throw createHttpError(400, 'FILE_TOO_LARGE', 'File is too large to read through MCP');
  if (!isTextLike(filePath)) throw createHttpError(400, 'UNSUPPORTED_FILE', 'Only text-like files can be read');
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    await auditFilesystem('read_file', filePath, 'success');
    return { path: filePath, size: stat.size, modifiedAt: stat.mtime.toISOString(), content };
  } catch (error) {
    await auditFilesystem('read_file', filePath, 'failed');
    throw error;
  }
}

async function prepareWriteFile(args) {
  const mode = args.mode === 'append' ? 'append' : 'overwrite';
  const filePath = await resolveAllowedPath(args.path);
  const content = String(args.content ?? '');
  const operationId = createId();
  pendingOperations.set(operationId, {
    id: operationId,
    server: 'filesystem',
    type: 'write_file',
    createdAt: Date.now(),
    payload: { path: filePath, content, mode }
  });
  cleanupPendingOperations();
  await auditFilesystem('write_file', filePath, 'pending');
  return {
    requiresConfirmation: true,
    operationId,
    preview: content.slice(0, 200),
    path: filePath,
    mode
  };
}

async function listDirectory(inputPath, recursive = false) {
  const root = await resolveAllowedPath(inputPath);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw createHttpError(400, 'NOT_DIRECTORY', 'Path is not a directory');
  const files = [];
  const folders = [];
  await walkDirectory(root, root, recursive, files, folders);
  await auditFilesystem('list_directory', root, 'success');
  return { path: root, files, folders };
}

async function walkDirectory(root, current, recursive, files, folders) {
  const entries = await fs.promises.readdir(current, { withFileTypes: true });
  for (const entry of entries.slice(0, recursive ? 1000 : 500)) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const absolute = path.join(current, entry.name);
    const stat = await fs.promises.stat(absolute);
    const record = {
      name: entry.name,
      path: absolute,
      relativePath: path.relative(root, absolute).replace(/\\/g, '/'),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
    if (entry.isDirectory()) {
      folders.push(record);
      if (recursive) await walkDirectory(root, absolute, recursive, files, folders);
    } else {
      files.push(record);
    }
  }
}

async function searchFiles(args) {
  const start = await resolveAllowedPath(args.path);
  const query = String(args.query || '').trim();
  const type = args.type === 'content' ? 'content' : 'filename';
  if (!query) throw createHttpError(400, 'MISSING_QUERY', 'Missing search query');
  const stat = await fs.promises.stat(start);
  if (!stat.isDirectory()) throw createHttpError(400, 'NOT_DIRECTORY', 'Search path must be a directory');
  const results = [];
  await walkSearch(start, start, query, type, results);
  await auditFilesystem('search_files', start, 'success');
  return { path: start, query, type, results: results.slice(0, SEARCH_RESULT_LIMIT) };
}

async function walkSearch(root, current, query, type, results) {
  if (results.length >= SEARCH_RESULT_LIMIT) return;
  const entries = await fs.promises.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= SEARCH_RESULT_LIMIT) return;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const absolute = path.join(current, entry.name);
    const stat = await fs.promises.stat(absolute);
    if (entry.isDirectory()) {
      await walkSearch(root, absolute, query, type, results);
      continue;
    }
    const relativePath = path.relative(root, absolute).replace(/\\/g, '/');
    if (type === 'filename') {
      if (entry.name.toLowerCase().includes(query.toLowerCase()) || relativePath.toLowerCase().includes(query.toLowerCase())) {
        results.push({ path: absolute, relativePath, name: entry.name, size: stat.size, modifiedAt: stat.mtime.toISOString() });
      }
      continue;
    }
    if (!isTextLike(absolute) || stat.size > MAX_READ_BYTES) continue;
    const lines = (await fs.promises.readFile(absolute, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (results.length >= SEARCH_RESULT_LIMIT) return;
      if (line.toLowerCase().includes(query.toLowerCase())) {
        results.push({ path: absolute, relativePath, line: index + 1, preview: line.slice(0, 500) });
      }
    });
  }
}

async function getFileInfo(inputPath) {
  const filePath = await resolveAllowedPath(inputPath);
  const stat = await fs.promises.stat(filePath);
  await auditFilesystem('get_file_info', filePath, 'success');
  return {
    path: filePath,
    size: stat.size,
    created: stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString(),
    extension: path.extname(filePath).toLowerCase(),
    mimeType: MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other'
  };
}

async function confirmPendingOperation(operationId, expectedServer) {
  cleanupPendingOperations();
  const operation = pendingOperations.get(operationId);
  if (!operation || operation.server !== expectedServer) throw createHttpError(404, 'PENDING_NOT_FOUND', 'Pending operation was not found or expired');
  pendingOperations.delete(operationId);
  if (operation.server === 'filesystem' && operation.type === 'write_file') {
    const { path: filePath, content, mode } = operation.payload;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    if (mode === 'append') await fs.promises.appendFile(filePath, content, 'utf8');
    else await fs.promises.writeFile(filePath, content, 'utf8');
    const stat = await fs.promises.stat(filePath);
    await auditFilesystem('write_file', filePath, 'success');
    return { path: filePath, size: stat.size, modifiedAt: stat.mtime.toISOString(), mode };
  }
  if (operation.server === 'memory' && operation.type === 'memory_store') {
    const saved = await saveMemory(operation.payload);
    return saved;
  }
  throw createHttpError(400, 'UNKNOWN_PENDING', 'Pending operation cannot be confirmed');
}

async function callMemory(name, args) {
  if (name === 'memory_store') return prepareMemoryStore(args);
  if (name === 'memory_recall') return recallMemories(args);
  if (name === 'memory_list') return listMemories(args);
  if (name === 'memory_update') return updateMemory(args);
  if (name === 'memory_delete') return deleteMemory(args.id);
  if (name === 'memory_clear_workspace') return clearWorkspaceMemories(args.workspace);
  throw createHttpError(404, 'UNKNOWN_TOOL', `Unknown memory tool: ${name}`);
}

async function prepareMemoryStore(args) {
  const content = String(args.content || '').trim();
  if (!content) throw createHttpError(400, 'MISSING_CONTENT', 'Memory content is required');
  const operationId = createId();
  pendingOperations.set(operationId, {
    id: operationId,
    server: 'memory',
    type: 'memory_store',
    createdAt: Date.now(),
    payload: {
      content,
      tags: normalizeTags(args.tags),
      importance: normalizeImportance(args.importance),
      workspace: String(args.workspace || '').trim()
    }
  });
  cleanupPendingOperations();
  return { requiresConfirmation: true, operationId, preview: content.slice(0, 200) };
}

async function saveMemory(payload) {
  const store = await readMemoryStore();
  const now = new Date().toISOString();
  const memory = {
    id: createId(),
    content: payload.content,
    tags: normalizeTags(payload.tags),
    importance: normalizeImportance(payload.importance),
    workspace: payload.workspace || '',
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now
  };
  store.memories.push(memory);
  await writeMemoryStore(store);
  return memory;
}

async function recallMemories(args) {
  const store = await readMemoryStore();
  const query = String(args.query || '').trim();
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const workspace = String(args.workspace || '').trim();
  const tags = normalizeTags(args.tags);
  const terms = tokenize(query);
  const scored = store.memories
    .filter(memory => !workspace || memory.workspace === workspace)
    .filter(memory => !tags.length || tags.every(tag => memory.tags.includes(tag)))
    .map(memory => ({ ...memory, relevance: scoreMemory(memory, terms) }))
    .filter(memory => memory.relevance > 0 || !terms.length)
    .sort((a, b) => b.relevance - a.relevance || importanceWeight(b.importance) - importanceWeight(a.importance))
    .slice(0, limit);
  const now = new Date().toISOString();
  const accessed = new Set(scored.map(memory => memory.id));
  let touched = false;
  for (const memory of store.memories) {
    if (accessed.has(memory.id)) {
      memory.lastAccessedAt = now;
      touched = true;
    }
  }
  if (touched) await writeMemoryStore(store);
  return { memories: scored };
}

async function listMemories(args) {
  const store = await readMemoryStore();
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  const offset = Math.max(Number(args.offset) || 0, 0);
  const workspace = String(args.workspace || '').trim();
  const importance = String(args.importance || '').trim();
  const tags = normalizeTags(args.tags);
  const filtered = store.memories
    .filter(memory => !workspace || memory.workspace === workspace)
    .filter(memory => !importance || memory.importance === importance)
    .filter(memory => !tags.length || tags.every(tag => memory.tags.includes(tag)));
  return { memories: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset };
}

async function updateMemory(args) {
  const store = await readMemoryStore();
  const memory = store.memories.find(item => item.id === args.id);
  if (!memory) throw createHttpError(404, 'MEMORY_NOT_FOUND', 'Memory not found');
  if (typeof args.content === 'string' && args.content.trim()) memory.content = args.content.trim();
  if (Array.isArray(args.tags)) memory.tags = normalizeTags(args.tags);
  if (args.importance) memory.importance = normalizeImportance(args.importance);
  memory.updatedAt = new Date().toISOString();
  await writeMemoryStore(store);
  return memory;
}

async function deleteMemory(id) {
  const store = await readMemoryStore();
  const before = store.memories.length;
  store.memories = store.memories.filter(memory => memory.id !== id);
  if (store.memories.length === before) throw createHttpError(404, 'MEMORY_NOT_FOUND', 'Memory not found');
  await writeMemoryStore(store);
  return { deleted: true, id };
}

async function clearWorkspaceMemories(workspace) {
  const scope = String(workspace || '').trim();
  if (!scope) throw createHttpError(400, 'MISSING_WORKSPACE', 'Workspace is required');
  const store = await readMemoryStore();
  const before = store.memories.length;
  store.memories = store.memories.filter(memory => memory.workspace !== scope);
  await writeMemoryStore(store);
  return { deleted: before - store.memories.length, workspace: scope };
}

async function callBrowser(name, args) {
  if (name === 'browser_navigate') return browserNavigate(args);
  if (name === 'browser_extract_text') return browserExtractText(args);
  if (name === 'browser_extract_structured') return browserExtractStructured(args);
  if (name === 'browser_screenshot') return browserScreenshot(args);
  if (name === 'browser_search') return browserSearch(args);
  if (name === 'browser_click') return browserClick(args);
  if (name === 'browser_type') return browserType(args);
  throw createHttpError(404, 'UNKNOWN_TOOL', `Unknown browser tool: ${name}`);
}

async function browserNavigate(args) {
  const page = await getBrowserPage();
  const url = validateHttpUrl(args.url);
  await page.goto(url, { waitUntil: args.waitFor === 'networkidle' ? 'networkidle2' : 'load', timeout: 30000 });
  if (args.waitFor === 'selector' && args.selector) await page.waitForSelector(args.selector, { timeout: 12000 });
  const screenshotBase64 = await page.screenshot({ encoding: 'base64', fullPage: false });
  const title = await page.title();
  touchBrowser();
  return { success: true, title, url: page.url(), screenshotBase64 };
}

async function browserExtractText(args) {
  const page = await getBrowserPage();
  const url = validateHttpUrl(args.url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  const selector = String(args.selector || '').trim();
  const text = await page.evaluate(sel => {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) return '';
    const blocked = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
    function walk(node, parts) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent.replace(/\s+/g, ' ').trim();
        if (value) parts.push(value);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || blocked.has(node.tagName)) return;
      const before = ['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'SECTION', 'ARTICLE'].includes(node.tagName);
      if (before) parts.push('\n');
      for (const child of node.childNodes) walk(child, parts);
      if (before) parts.push('\n');
    }
    const parts = [];
    walk(root, parts);
    return parts.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  }, selector);
  touchBrowser();
  return { url: page.url(), title: await page.title(), text: text.slice(0, 200000) };
}

async function browserExtractStructured(args) {
  const extracted = await browserExtractText(args);
  return {
    ...extracted,
    schema: args.schema && typeof args.schema === 'object' ? args.schema : {},
    requiresFrontendExtraction: true
  };
}

async function browserScreenshot(args) {
  const page = await getBrowserPage();
  if (args.url) await page.goto(validateHttpUrl(args.url), { waitUntil: 'networkidle2', timeout: 30000 });
  const screenshotBase64 = await page.screenshot({ encoding: 'base64', fullPage: args.fullPage !== false });
  touchBrowser();
  return { success: true, title: await page.title(), url: page.url(), screenshotBase64 };
}

async function browserSearch(args) {
  const query = String(args.query || '').trim();
  if (!query) throw createHttpError(400, 'MISSING_QUERY', 'Search query is required');
  const maxResults = Math.min(Math.max(Number(args.maxResults) || 5, 1), 10);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  let html = '';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
    html = await response.text();
  } catch (err) {
    throw createHttpError(502, 'SEARCH_FAILED', `Web search request failed: ${err.message}`);
  }

  const results = [];
  const resultBlocks = html.split(/<div[^>]*\bclass\s*=\s*["'][^"']*\bresult\b[^"']*["'][^>]*>/i).slice(1);

  for (const block of resultBlocks) {
    if (results.length >= maxResults) break;

    const titleMatch = block.match(/<a[^>]*\bclass\s*=\s*["'][^"']*\bresult__a\b[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*\bclass\s*=\s*["'][^"']*\bresult__a\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const rawUrl = titleMatch[1];
    const title = titleMatch[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    if (!title || !/^https?:\/\//.test(rawUrl)) continue;

    const snippetMatch = block.match(/<[^>]*\bclass\s*=\s*["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/[a-z]+>/i);
    let snippet = '';
    if (snippetMatch) {
      snippet = snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    } else {
      snippet = block.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 300);
    }

    results.push({ title, url: rawUrl, snippet: snippet.slice(0, 300) });
  }

  return { query, engine: 'duckduckgo', results };
}

async function browserClick(args) {
  const page = await getBrowserPage();
  if (args.text) {
    const clicked = await page.evaluate(text => {
      const target = Array.from(document.querySelectorAll('button,a,[role="button"],input[type="submit"]'))
        .find(element => (element.innerText || element.value || '').trim().toLowerCase().includes(String(text).toLowerCase()));
      if (!target) return false;
      target.click();
      return true;
    }, args.text);
    if (!clicked) throw createHttpError(404, 'ELEMENT_NOT_FOUND', 'No element matched the visible text');
  } else {
    if (!args.selector) throw createHttpError(400, 'MISSING_SELECTOR', 'Selector or text is required');
    await page.click(args.selector);
  }
  touchBrowser();
  return { success: true, url: page.url(), title: await page.title() };
}

async function browserType(args) {
  const page = await getBrowserPage();
  if (!args.selector) throw createHttpError(400, 'MISSING_SELECTOR', 'Selector is required');
  await page.click(args.selector);
  await page.keyboard.type(String(args.text || ''));
  if (args.submit) await page.keyboard.press('Enter');
  touchBrowser();
  return { success: true, url: page.url(), title: await page.title() };
}

async function getBrowserPage() {
  if (!browserState.browser) {
    browserState.browser = await puppeteer.launch({ headless: 'new' });
    browserState.launchedAt = Date.now();
    browserState.page = await browserState.browser.newPage();
    await browserState.page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  }
  if (!browserState.page || browserState.page.isClosed()) browserState.page = await browserState.browser.newPage();
  touchBrowser();
  return browserState.page;
}

function touchBrowser() {
  browserState.lastUsedAt = Date.now();
  browserState.currentUrl = browserState.page?.url?.() || browserState.currentUrl || '';
  clearTimeout(browserState.idleTimer);
  browserState.idleTimer = setTimeout(() => closeBrowserSession().catch(() => {}), BROWSER_IDLE_MS);
}

async function resetBrowserSession() {
  await closeBrowserSession();
  await getBrowserPage();
  return getBrowserSessionStatus();
}

async function closeBrowserSession() {
  clearTimeout(browserState.idleTimer);
  if (browserState.browser) await browserState.browser.close().catch(() => {});
  browserState = { browser: null, page: null, currentUrl: '', launchedAt: 0, lastUsedAt: 0, idleTimer: null };
}

async function resetMcpSystemData() {
  await fs.promises.writeFile(MEMORY_PATH, '{\n  "memories": []\n}\n', 'utf8');
  await fs.promises.writeFile(AUDIT_PATH, '', 'utf8');
  return { memoryReset: true, auditReset: true };
}

function getBrowserSessionStatus() {
  return {
    open: Boolean(browserState.browser),
    currentUrl: browserState.page?.url?.() || browserState.currentUrl || '',
    launchedAt: browserState.launchedAt || null,
    lastUsedAt: browserState.lastUsedAt || null
  };
}

async function readConfig() {
  const defaults = {
    filesystem: { name: 'Filesystem', active: false, allowedPaths: [], readEnabled: true, writeEnabled: true, confirmWrites: true, toolPermissions: {} },
    browser: { name: 'Puppeteer Browser', active: false, targetUrl: '', actionPreset: 'navigate', browserMode: 'headless', screenshotsEnabled: true, networkAccess: true, toolPermissions: {} },
    memory: { name: 'Memory', active: false, path: MEMORY_PATH, namespace: '', persistence: true, toolPermissions: {} }
  };
  try {
    const parsed = JSON.parse(await fs.promises.readFile(CONFIG_PATH, 'utf8'));
    return {
      filesystem: { ...defaults.filesystem, ...(parsed.filesystem || {}), allowedPaths: normalizeAllowedPaths(parsed.filesystem?.allowedPaths || []), toolPermissions: normalizeToolPermissions(parsed.filesystem?.toolPermissions) },
      browser: { ...defaults.browser, ...(parsed.browser || {}), toolPermissions: normalizeToolPermissions(parsed.browser?.toolPermissions) },
      memory: { ...defaults.memory, ...(parsed.memory || {}), toolPermissions: normalizeToolPermissions(parsed.memory?.toolPermissions) }
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return defaults;
  }
}

async function writeConfig(config) {
  const current = await readConfig();
  const next = {
    filesystem: {
      ...current.filesystem,
      ...(config.filesystem || {}),
      allowedPaths: normalizeAllowedPaths(config.filesystem?.allowedPaths ?? current.filesystem.allowedPaths),
      toolPermissions: normalizeToolPermissions(config.filesystem?.toolPermissions ?? current.filesystem.toolPermissions)
    },
    browser: { ...current.browser, ...(config.browser || {}), toolPermissions: normalizeToolPermissions(config.browser?.toolPermissions ?? current.browser.toolPermissions) },
    memory: { ...current.memory, ...(config.memory || {}), toolPermissions: normalizeToolPermissions(config.memory?.toolPermissions ?? current.memory.toolPermissions) }
  };
  await fs.promises.writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function normalizeToolPermissions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([name, permission = {}]) => [name, {
    enabled: permission.enabled !== false,
    requiresApproval: typeof permission.requiresApproval === 'boolean' ? permission.requiresApproval : true,
    riskLevel: ['read', 'write', 'external', 'destructive'].includes(permission.riskLevel) ? permission.riskLevel : undefined,
    lastUsedAt: permission.lastUsedAt || 0,
    errorCount: Number(permission.errorCount) || 0
  }]));
}

async function resolveAllowedPath(inputPath) {
  const config = await readConfig();
  const roots = normalizeAllowedPaths(config.filesystem.allowedPaths || []);
  if (!roots.length) throw createHttpError(403, 'NO_ALLOWED_PATHS', 'No filesystem paths are approved yet');
  const raw = String(inputPath || '').trim();
  if (!raw) throw createHttpError(400, 'MISSING_PATH', 'Path is required');
  const candidates = path.isAbsolute(raw) ? [path.resolve(raw)] : roots.map(root => path.resolve(root, raw));
  for (const candidate of candidates) {
    if (isInsideAnyRoot(candidate, roots)) return candidate;
  }
  throw createHttpError(403, 'PATH_NOT_ALLOWED', 'Path is outside approved filesystem roots');
}

function isInsideAnyRoot(target, roots) {
  const normalizedTarget = normalizeCasePath(path.resolve(target));
  return roots.some(root => {
    const normalizedRoot = normalizeCasePath(path.resolve(root));
    const relative = path.relative(normalizedRoot, normalizedTarget);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

function normalizeAllowedPaths(paths) {
  return [...new Set((Array.isArray(paths) ? paths : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => path.resolve(item)))];
}

function normalizeCasePath(value) {
  return process.platform === 'win32' ? String(value).toLowerCase() : String(value);
}

async function readMemoryStore() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(MEMORY_PATH, 'utf8'));
    return { memories: Array.isArray(parsed.memories) ? parsed.memories : [] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { memories: [] };
  }
}

async function writeMemoryStore(store) {
  await fs.promises.writeFile(MEMORY_PATH, `${JSON.stringify({ memories: store.memories || [] }, null, 2)}\n`, 'utf8');
}

async function getMemoryStats() {
  const store = await readMemoryStore();
  const lastAccessedAt = store.memories.reduce((latest, memory) => {
    const value = memory.lastAccessedAt || memory.updatedAt || memory.createdAt || '';
    return value > latest ? value : latest;
  }, '');
  return { count: store.memories.length, lastAccessedAt };
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : [])
    .map(tag => String(tag || '').trim().toLowerCase())
    .filter(Boolean))];
}

function normalizeImportance(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function tokenize(value) {
  return String(value || '').toLowerCase().split(/[^a-z0-9_'-]+/).filter(term => term.length > 1);
}

function scoreMemory(memory, terms) {
  if (!terms.length) return importanceWeight(memory.importance);
  const haystack = `${memory.content} ${(memory.tags || []).join(' ')} ${memory.workspace || ''}`.toLowerCase();
  const matches = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  return matches * 10 + importanceWeight(memory.importance);
}

function importanceWeight(value) {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}

async function auditFilesystem(toolName, targetPath, status) {
  const row = JSON.stringify({ timestamp: new Date().toISOString(), tool: toolName, path: targetPath, status });
  await fs.promises.appendFile(AUDIT_PATH, `${row}\n`, 'utf8').catch(() => {});
}

function cleanupPendingOperations() {
  const now = Date.now();
  for (const [id, operation] of pendingOperations) {
    if (now - operation.createdAt > PENDING_TTL_MS) pendingOperations.delete(id);
  }
}

function logRequest(entry) {
  requestLog.unshift({
    timestamp: new Date().toISOString(),
    server: entry.server,
    tool: entry.tool,
    parameters: sanitizeLogParameters(entry.parameters),
    duration: entry.duration,
    success: Boolean(entry.success)
  });
  requestLog.splice(REQUEST_LOG_LIMIT);
}

function sanitizeLogParameters(value) {
  const clone = JSON.parse(JSON.stringify(value || {}));
  if (clone.content && typeof clone.content === 'string') clone.content = `${clone.content.slice(0, 120)}${clone.content.length > 120 ? '...' : ''}`;
  if (clone.arguments?.content && typeof clone.arguments.content === 'string') clone.arguments.content = `${clone.arguments.content.slice(0, 120)}${clone.arguments.content.length > 120 ? '...' : ''}`;
  return clone;
}

function validateHttpUrl(value) {
  const target = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(target.protocol)) throw createHttpError(400, 'INVALID_URL', 'Only HTTP and HTTPS URLs are allowed');
  return target.href;
}

function isTextLike(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || path.basename(filePath).startsWith('.');
}

function schemaString(description) {
  return { type: 'string', description };
}

function tool(name, description, safety, properties = {}, required = []) {
  return { name, description, safety, inputSchema: { type: 'object', properties, required } };
}

function createId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) {
        reject(createHttpError(413, 'BODY_TOO_LARGE', 'MCP request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(createHttpError(400, 'INVALID_JSON', 'Invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

function defaultSendJson(res, status, payload) {
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

module.exports = {
  handleMcpSystemRequest,
  BUILT_IN_TOOLS,
  getMcpStatus,
  getAllTools,
  callBuiltInTool,
  closeBrowserSession
};
