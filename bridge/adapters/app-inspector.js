const fs = require('fs');
const path = require('path');

function getAppInspectorAdapter() {
  return {
    type: 'app-inspector',
    label: 'App Inspector',
    description: 'Read Architect’s Domain app health, package metadata, storage hints, and configured runtime files.',
    tools: [
      { name: 'app.health', description: 'Inspect app files, package metadata, and bridge health.', safety: 'read', inputSchema: { type: 'object', properties: {} } },
      { name: 'app.project_structure', description: 'List top-level project structure.', safety: 'read', inputSchema: { type: 'object', properties: {} } },
      { name: 'app.read_package', description: 'Read package.json scripts and metadata.', safety: 'read', inputSchema: { type: 'object', properties: {} } }
    ],
    resources: []
  };
}

async function testAppInspector(config = {}) {
  const root = resolveRoot(config);
  await fs.promises.access(path.join(root, 'index.html'));
  return { ok: true, label: root, tools: getAppInspectorAdapter().tools, resources: [{ uri: `app://${root}`, name: 'Architect’s Domain', description: 'Local app project' }] };
}

async function callAppInspectorTool(config = {}, toolName) {
  const root = resolveRoot(config);
  if (toolName === 'app.health') return appHealth(root);
  if (toolName === 'app.project_structure') return projectStructure(root);
  if (toolName === 'app.read_package') return readPackage(root);
  throw new Error(`Unknown app inspector tool: ${toolName}`);
}

async function listAppInspectorResources(config = {}) {
  const root = resolveRoot(config);
  return [{ uri: `app://${root}`, name: 'Architect’s Domain', description: 'Local app project' }];
}

async function readAppInspectorResource(config = {}, uri) {
  if (!String(uri || '').startsWith('app://')) throw new Error('Unsupported app resource URI');
  return appHealth(resolveRoot(config));
}

async function appHealth(root) {
  const pkg = await readPackage(root);
  const required = ['index.html', 'server.js', 'scripts', 'styles', 'bridge'];
  const files = await Promise.all(required.map(async item => ({
    name: item,
    exists: fs.existsSync(path.join(root, item))
  })));
  return {
    root,
    node: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    package: pkg,
    requiredFiles: files,
    bridge: { ok: true, presets: ['filesystem', 'markdown-vault', 'github', 'web-fetch', 'git', 'app-inspector', 'bridge-health', 'web-fetch-plus', 'notes-vault'] }
  };
}

async function projectStructure(root) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  return {
    root,
    entries: entries
      .filter(entry => !['node_modules', '.git'].includes(entry.name))
      .map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
  };
}

async function readPackage(root) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf8'));
  return {
    name: pkg.name,
    version: pkg.version,
    private: pkg.private,
    type: pkg.type,
    scripts: pkg.scripts || {},
    engines: pkg.engines || {}
  };
}

function resolveRoot(config = {}) {
  return path.resolve(String(config.root || process.cwd()));
}

module.exports = { getAppInspectorAdapter, testAppInspector, callAppInspectorTool, listAppInspectorResources, readAppInspectorResource };
