const fs = require('fs');
const path = require('path');

function getNotesVaultAdapter() {
  return {
    type: 'notes-vault',
    label: 'Notes Vault',
    description: 'Read-only markdown note listing, search, and reading inside one notes folder.',
    tools: [
      { name: 'notes.list_notes', description: 'List markdown notes in the configured vault.', safety: 'read', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
      { name: 'notes.search_notes', description: 'Search markdown notes by filename or content.', safety: 'read', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'number' } } } },
      { name: 'notes.read_note', description: 'Read a markdown note from the configured vault.', safety: 'read', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } }
    ],
    resources: []
  };
}

async function testNotesVault(config = {}) {
  const root = resolveRoot(config);
  await fs.promises.mkdir(root, { recursive: true });
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) throw new Error('Notes vault root is not a folder');
  return { ok: true, label: root, tools: getNotesVaultAdapter().tools, resources: [{ uri: `notes://${root}`, name: path.basename(root), description: 'Markdown notes vault' }] };
}

async function callNotesVaultTool(config = {}, toolName, args = {}) {
  const root = resolveRoot(config);
  await fs.promises.mkdir(root, { recursive: true });
  if (toolName === 'notes.list_notes') return listNotes(root, args.path || '');
  if (toolName === 'notes.search_notes') return searchNotes(root, args);
  if (toolName === 'notes.read_note') return readNote(root, args.path);
  throw new Error(`Unknown notes vault tool: ${toolName}`);
}

async function listNotesVaultResources(config = {}) {
  const root = resolveRoot(config);
  return [{ uri: `notes://${root}`, name: path.basename(root), description: 'Markdown notes vault' }];
}

async function readNotesVaultResource(config = {}, uri) {
  const root = resolveRoot(config);
  const match = String(uri || '').replace(/^notes:\/\//, '');
  const target = path.resolve(match);
  ensureInsideRoot(root, target);
  return readAbsoluteNote(root, target);
}

async function listNotes(root, relativePath) {
  const folder = resolveInsideRoot(root, relativePath);
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  return {
    root,
    path: normalizeRelative(root, folder),
    notes: entries
      .filter(entry => entry.isDirectory() || /\.md$/i.test(entry.name))
      .map(entry => ({ name: entry.name, path: normalizeRelative(root, path.join(folder, entry.name)), type: entry.isDirectory() ? 'directory' : 'note' }))
  };
}

async function searchNotes(root, args = {}) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('Missing notes search query');
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 80);
  const matches = [];
  await walkNotes(root, root, async filePath => {
    if (matches.length >= limit) return;
    const relative = normalizeRelative(root, filePath);
    if (relative.toLowerCase().includes(query.toLowerCase())) {
      matches.push({ path: relative, match: 'filename' });
      return;
    }
    const content = await fs.promises.readFile(filePath, 'utf8');
    const index = content.toLowerCase().indexOf(query.toLowerCase());
    if (index !== -1) {
      matches.push({ path: relative, match: 'content', preview: content.slice(Math.max(0, index - 120), index + query.length + 180) });
    }
  });
  return { query, matches };
}

async function readNote(root, relativePath) {
  if (!relativePath) throw new Error('Missing note path');
  const target = resolveInsideRoot(root, relativePath);
  return readAbsoluteNote(root, target);
}

async function readAbsoluteNote(root, target) {
  const stat = await fs.promises.stat(target);
  if (!stat.isFile() || !/\.md$/i.test(target)) throw new Error('Only markdown notes can be read');
  if (stat.size > 512 * 1024) throw new Error('Note is too large to read directly');
  return { path: normalizeRelative(root, target), size: stat.size, content: await fs.promises.readFile(target, 'utf8') };
}

async function walkNotes(root, current, visit) {
  const stat = await fs.promises.stat(current);
  if (stat.isDirectory()) {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) await walkNotes(root, path.join(current, entry.name), visit);
    return;
  }
  if (stat.isFile() && /\.md$/i.test(current)) await visit(current);
}

function resolveRoot(config = {}) {
  return path.resolve(String(config.root || path.join(process.env.USERPROFILE || process.cwd(), 'Documents', 'Architects Domain Notes')));
}

function resolveInsideRoot(root, relativePath = '') {
  const target = path.resolve(root, String(relativePath || '.'));
  ensureInsideRoot(root, target);
  return target;
}

function ensureInsideRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside the approved notes vault');
}

function normalizeRelative(root, target) {
  return path.relative(root, target).replace(/\\/g, '/') || '.';
}

module.exports = { getNotesVaultAdapter, testNotesVault, callNotesVaultTool, listNotesVaultResources, readNotesVaultResource };
