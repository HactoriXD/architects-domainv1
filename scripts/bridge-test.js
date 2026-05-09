const fs = require('fs');
const path = require('path');
const { testFilesystem, callFilesystemTool } = require('../bridge/adapters/filesystem');
const { testGithub } = require('../bridge/adapters/github');
const { testGit, callGitTool } = require('../bridge/adapters/git');
const { testAppInspector, callAppInspectorTool } = require('../bridge/adapters/app-inspector');
const { testBridgeHealth, callBridgeHealthTool } = require('../bridge/adapters/bridge-health');
const { testNotesVault, callNotesVaultTool } = require('../bridge/adapters/notes-vault');
const { testWebFetchPlus } = require('../bridge/adapters/web-fetch-plus');
const { handleBridgeRequest } = require('../bridge/server');
const { getMcpStatus, getAllTools, callBuiltInTool } = require('../bridge/mcp-system');

const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const fixtureRoot = path.join(root, 'assets');
  await fs.promises.mkdir(fixtureRoot, { recursive: true });
  const readme = path.join(root, 'README.md');
  const filesystem = await testFilesystem({ root });
  assert(filesystem.tools.some(tool => tool.name === 'filesystem.read_file'), 'Filesystem read tool missing');

  const list = await callFilesystemTool({ root }, 'filesystem.list_files', { path: '.' });
  assert(list.files.some(file => file.name === 'README.md'), 'Filesystem list did not include README');

  const file = await callFilesystemTool({ root }, 'filesystem.read_file', { path: 'README.md' });
  assert(file.content.length > 0 && file.path === 'README.md', 'Filesystem read failed');
  assert(fs.existsSync(readme), 'README fixture missing');

  const search = await callFilesystemTool({ root }, 'filesystem.search_files', { query: 'Architect', limit: 5 });
  assert(search.matches.length > 0, 'Filesystem search failed');

  let blocked = false;
  try {
    await callFilesystemTool({ root }, 'filesystem.read_file', { path: '../package.json' });
  } catch (error) {
    blocked = /outside the approved/.test(error.message);
  }
  assert(blocked, 'Filesystem path traversal was not blocked');

  const github = await testGithub({});
  assert(github.tools.some(tool => tool.name === 'github.read_file'), 'GitHub tools missing');

  const git = await testGit({ root });
  assert(git.tools.some(tool => tool.name === 'git.status'), 'Git tools missing');
  const gitStatus = await callGitTool({ root }, 'git.status');
  assert(Array.isArray(gitStatus.status), 'Git status failed');

  const app = await testAppInspector({ root });
  assert(app.tools.some(tool => tool.name === 'app.health'), 'App inspector tools missing');
  const appHealth = await callAppInspectorTool({ root }, 'app.health');
  assert(appHealth.requiredFiles.some(file => file.name === 'index.html' && file.exists), 'App health missing index.html');

  const bridge = await testBridgeHealth({ root });
  assert(bridge.tools.some(tool => tool.name === 'bridge.health'), 'Bridge health tools missing');
  const bridgeHealth = await callBridgeHealthTool({ root }, 'bridge.health');
  assert(bridgeHealth.ok && bridgeHealth.node, 'Bridge health failed');

  const notesRoot = path.join(root, '.test-notes-vault');
  await fs.promises.mkdir(notesRoot, { recursive: true });
  await fs.promises.writeFile(path.join(notesRoot, 'Architect.md'), '# Architect\n\nLocal note for testing.', 'utf8');
  const notes = await testNotesVault({ root: notesRoot });
  assert(notes.tools.some(tool => tool.name === 'notes.search_notes'), 'Notes vault tools missing');
  const noteSearch = await callNotesVaultTool({ root: notesRoot }, 'notes.search_notes', { query: 'Architect' });
  assert(noteSearch.matches.length > 0, 'Notes search failed');
  await fs.promises.rm(notesRoot, { recursive: true, force: true });

  const webPlus = await testWebFetchPlus({});
  assert(webPlus.tools.some(tool => tool.name === 'web.fetch_readable'), 'Web Fetch Plus tools missing');

  assert(typeof handleBridgeRequest === 'function', 'Bridge handler missing');

  const mcpConfigPath = path.join(root, 'mcp-config.json');
  const mcpMemoryPath = path.join(root, 'mcp-memory.json');
  const mcpAuditPath = path.join(root, 'mcp-audit.log');
  await fs.promises.writeFile(mcpConfigPath, JSON.stringify({
    filesystem: { name: 'Filesystem', active: true, allowedPaths: [root] },
    browser: { name: 'Puppeteer Browser', active: true },
    memory: { name: 'Memory', active: true }
  }, null, 2), 'utf8');

  const mcpStatus = await getMcpStatus();
  assert(mcpStatus.success && mcpStatus.servers.some(server => server.type === 'filesystem'), 'MCP status missing filesystem server');
  const allTools = await getAllTools();
  assert(allTools.tools.some(tool => tool.name === 'read_file' && tool.server === 'filesystem'), 'MCP tools manifest missing filesystem read_file');

  const mcpRead = await callBuiltInTool('filesystem', 'read_file', { path: path.join(root, 'README.md') });
  assert(mcpRead.content.includes('Architect'), 'MCP filesystem read failed');
  let mcpBlocked = false;
  try {
    await callBuiltInTool('filesystem', 'read_file', { path: path.resolve(root, '..', 'package.json') });
  } catch (error) {
    mcpBlocked = /outside approved|not allowed/i.test(error.message);
  }
  assert(mcpBlocked, 'MCP filesystem traversal was not blocked');
  const mcpSearch = await callBuiltInTool('filesystem', 'search_files', { path: root, query: 'Architect', type: 'content' });
  assert(mcpSearch.results.some(result => result.line), 'MCP filesystem content search missing line numbers');
  const pendingWrite = await callBuiltInTool('filesystem', 'write_file', { path: path.join(root, 'assets', 'mcp-write-test.txt'), content: 'MCP write confirmation test', mode: 'overwrite' });
  assert(pendingWrite.requiresConfirmation && pendingWrite.operationId && pendingWrite.preview, 'MCP filesystem write did not return pending confirmation');
  assert(!fs.existsSync(path.join(root, 'assets', 'mcp-write-test.txt')), 'MCP filesystem wrote before confirmation');
  assert(fs.existsSync(mcpAuditPath), 'MCP audit log was not created');

  const pendingMemory = await callBuiltInTool('memory', 'memory_store', { content: 'User prefers precise MCP tests.', tags: ['mcp'], importance: 'high', workspace: 'test-workspace' });
  assert(pendingMemory.requiresConfirmation && pendingMemory.operationId, 'MCP memory store did not return pending confirmation');
  await fs.promises.writeFile(mcpMemoryPath, JSON.stringify({
    memories: [{
      id: 'test-memory-1',
      content: 'User prefers precise MCP tests.',
      tags: ['mcp'],
      importance: 'high',
      workspace: 'test-workspace',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString()
    }]
  }, null, 2), 'utf8');
  const recalled = await callBuiltInTool('memory', 'memory_recall', { query: 'precise tests', workspace: 'test-workspace', limit: 5 });
  assert(recalled.memories.length && recalled.memories[0].relevance > 0, 'MCP memory recall failed');
  const listedMemories = await callBuiltInTool('memory', 'memory_list', { workspace: 'test-workspace', limit: 10, offset: 0 });
  assert(listedMemories.total === 1, 'MCP memory pagination/filter failed');
  const updatedMemory = await callBuiltInTool('memory', 'memory_update', { id: 'test-memory-1', importance: 'medium' });
  assert(updatedMemory.importance === 'medium', 'MCP memory update failed');
  const deletedMemory = await callBuiltInTool('memory', 'memory_delete', { id: 'test-memory-1' });
  assert(deletedMemory.deleted, 'MCP memory delete failed');

  console.log('Bridge tests passed.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
