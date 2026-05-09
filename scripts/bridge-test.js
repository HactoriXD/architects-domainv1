const fs = require('fs');
const path = require('path');
const { testFilesystem, callFilesystemTool } = require('../bridge/adapters/filesystem');
const { testGithub } = require('../bridge/adapters/github');
const { handleBridgeRequest } = require('../bridge/server');

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

  assert(typeof handleBridgeRequest === 'function', 'Bridge handler missing');
  console.log('Bridge tests passed.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
