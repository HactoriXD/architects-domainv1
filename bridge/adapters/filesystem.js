const fs = require('fs');
const path = require('path');

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.py', '.csv', '.xml',
  '.yml', '.yaml', '.toml', '.ini', '.env', '.gitignore', '.c', '.cpp', '.h',
  '.hpp', '.java', '.rb', '.go', '.rs', '.php', '.sql'
]);

const MAX_READ_BYTES = 512 * 1024;
const MAX_SEARCH_BYTES = 1024 * 1024;

function getFilesystemAdapter() {
  return {
    type: 'filesystem',
    label: 'Filesystem',
    description: 'Browse, read, and search text files inside one approved local folder.',
    tools: [
      {
        name: 'filesystem.list_files',
        description: 'List files and folders inside the configured root.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Folder path relative to the configured root.' }
          }
        }
      },
      {
        name: 'filesystem.read_file',
        description: 'Read a text file from the configured root.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', description: 'File path relative to the configured root.' }
          }
        }
      },
      {
        name: 'filesystem.search_files',
        description: 'Search text files by filename or content inside the configured root.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            path: { type: 'string' },
            limit: { type: 'number' }
          }
        }
      }
    ],
    resources: []
  };
}

async function testFilesystem(config) {
  const root = resolveRoot(config);
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error('Filesystem root is not a folder');
  return {
    ok: true,
    label: root,
    tools: getFilesystemAdapter().tools,
    resources: [{ uri: `file://${root}`, name: path.basename(root) || root, description: 'Approved filesystem root' }]
  };
}

async function callFilesystemTool(config, toolName, args = {}) {
  const root = resolveRoot(config);
  if (toolName === 'filesystem.list_files') return listFiles(root, args.path || '');
  if (toolName === 'filesystem.read_file') return readFile(root, args.path);
  if (toolName === 'filesystem.search_files') return searchFiles(root, args);
  throw new Error(`Unknown filesystem tool: ${toolName}`);
}

async function listFilesystemResources(config) {
  const root = resolveRoot(config);
  return [{ uri: `file://${root}`, name: path.basename(root) || root, description: 'Approved filesystem root' }];
}

async function readFilesystemResource(config, uri) {
  if (!String(uri || '').startsWith('file://')) throw new Error('Unsupported filesystem resource URI');
  const root = resolveRoot(config);
  const absolutePath = path.resolve(String(uri).replace(/^file:\/\//, ''));
  ensureInsideRoot(root, absolutePath);
  return readAbsoluteTextFile(root, absolutePath);
}

function resolveRoot(config = {}) {
  const root = path.resolve(String(config.root || process.cwd()));
  return root;
}

function resolveInsideRoot(root, relativePath = '') {
  const target = path.resolve(root, String(relativePath || '.'));
  ensureInsideRoot(root, target);
  return target;
}

function ensureInsideRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside the approved filesystem root');
  }
}

async function listFiles(root, relativePath) {
  const folder = resolveInsideRoot(root, relativePath);
  const stat = await fs.promises.stat(folder);
  if (!stat.isDirectory()) throw new Error('Path is not a folder');
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  const files = await Promise.all(entries.slice(0, 250).map(async entry => {
    const absolutePath = path.join(folder, entry.name);
    const itemStat = await fs.promises.stat(absolutePath);
    return {
      name: entry.name,
      path: normalizeRelative(root, absolutePath),
      type: entry.isDirectory() ? 'directory' : 'file',
      size: itemStat.size,
      modifiedAt: itemStat.mtime.toISOString()
    };
  }));
  return { root, path: normalizeRelative(root, folder), files };
}

async function readFile(root, relativePath) {
  if (!relativePath) throw new Error('Missing file path');
  const filePath = resolveInsideRoot(root, relativePath);
  return readAbsoluteTextFile(root, filePath);
}

async function readAbsoluteTextFile(root, filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error('Path is not a file');
  if (stat.size > MAX_READ_BYTES) throw new Error('File is too large for direct MCP read');
  if (!isTextLike(filePath)) throw new Error('Only text-like files can be read');
  const content = await fs.promises.readFile(filePath, 'utf8');
  return {
    path: normalizeRelative(root, filePath),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content
  };
}

async function searchFiles(root, args) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('Missing search query');
  const start = resolveInsideRoot(root, args.path || '');
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  const matches = [];
  await walkSearch(root, start, query.toLowerCase(), matches, limit);
  return { query, matches };
}

async function walkSearch(root, current, query, matches, limit) {
  if (matches.length >= limit) return;
  const stat = await fs.promises.stat(current);
  if (stat.isDirectory()) {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walkSearch(root, path.join(current, entry.name), query, matches, limit);
      if (matches.length >= limit) return;
    }
    return;
  }
  if (!stat.isFile() || stat.size > MAX_SEARCH_BYTES || !isTextLike(current)) return;
  const relativePath = normalizeRelative(root, current);
  if (relativePath.toLowerCase().includes(query)) {
    matches.push({ path: relativePath, match: 'filename' });
    return;
  }
  const content = await fs.promises.readFile(current, 'utf8');
  const index = content.toLowerCase().indexOf(query);
  if (index === -1) return;
  const start = Math.max(0, index - 120);
  const end = Math.min(content.length, index + query.length + 180);
  matches.push({ path: relativePath, match: 'content', preview: content.slice(start, end) });
}

function isTextLike(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || path.basename(filePath).startsWith('.');
}

function normalizeRelative(root, target) {
  return path.relative(root, target).replace(/\\/g, '/') || '.';
}

module.exports = {
  getFilesystemAdapter,
  testFilesystem,
  callFilesystemTool,
  listFilesystemResources,
  readFilesystemResource
};
