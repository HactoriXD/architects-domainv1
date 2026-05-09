const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitAdapter() {
  return {
    type: 'git',
    label: 'Git',
    description: 'Read local git status, branches, commits, diffs, and file history.',
    tools: [
      { name: 'git.status', description: 'Show local git status for the configured repository.', safety: 'read', inputSchema: emptySchema() },
      { name: 'git.branches', description: 'List local and remote branches.', safety: 'read', inputSchema: emptySchema() },
      { name: 'git.recent_commits', description: 'List recent commits.', safety: 'read', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
      { name: 'git.diff_summary', description: 'Show a read-only diff summary for local changes.', safety: 'read', inputSchema: emptySchema() },
      { name: 'git.file_history', description: 'Show commit history for a file.', safety: 'read', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, limit: { type: 'number' } } } }
    ],
    resources: []
  };
}

async function testGit(config = {}) {
  const root = resolveGitRoot(config);
  await ensureGitRepo(root);
  return { ok: true, label: root, tools: getGitAdapter().tools, resources: [{ uri: `git://${root}`, name: path.basename(root), description: 'Local git repository' }] };
}

async function callGitTool(config = {}, toolName, args = {}) {
  const root = resolveGitRoot(config);
  await ensureGitRepo(root);
  if (toolName === 'git.status') return gitStatus(root);
  if (toolName === 'git.branches') return gitBranches(root);
  if (toolName === 'git.recent_commits') return gitRecentCommits(root, args);
  if (toolName === 'git.diff_summary') return gitDiffSummary(root);
  if (toolName === 'git.file_history') return gitFileHistory(root, args);
  throw new Error(`Unknown git tool: ${toolName}`);
}

async function listGitResources(config = {}) {
  const root = resolveGitRoot(config);
  await ensureGitRepo(root);
  return [{ uri: `git://${root}`, name: path.basename(root), description: 'Local git repository' }];
}

async function readGitResource(config = {}, uri) {
  const root = resolveGitRoot(config);
  await ensureGitRepo(root);
  if (!String(uri || '').startsWith('git://')) throw new Error('Unsupported git resource URI');
  return gitStatus(root);
}

async function gitStatus(root) {
  const [branch, status] = await Promise.all([
    runGit(root, ['branch', '--show-current']),
    runGit(root, ['status', '--short', '--branch'])
  ]);
  return { root, branch: branch.trim(), status: status.trim().split(/\r?\n/).filter(Boolean) };
}

async function gitBranches(root) {
  const output = await runGit(root, ['branch', '--all', '--no-color']);
  return { root, branches: output.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean) };
}

async function gitRecentCommits(root, args = {}) {
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 30);
  const output = await runGit(root, ['log', `-${limit}`, '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short']);
  return {
    root,
    commits: output.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [sha, author, date, ...message] = line.split('\t');
      return { sha, author, date, message: message.join('\t') };
    })
  };
}

async function gitDiffSummary(root) {
  const [stat, names] = await Promise.all([
    runGit(root, ['diff', '--stat']),
    runGit(root, ['diff', '--name-status'])
  ]);
  return {
    root,
    stat: stat.trim() || 'No unstaged diff.',
    files: names.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [status, file] = line.split(/\s+/, 2);
      return { status, file };
    })
  };
}

async function gitFileHistory(root, args = {}) {
  const relativePath = String(args.path || '').trim();
  if (!relativePath) throw new Error('Missing file path');
  const target = path.resolve(root, relativePath);
  ensureInsideRoot(root, target);
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 30);
  const output = await runGit(root, ['log', `-${limit}`, '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short', '--', relativePath]);
  return {
    root,
    path: relativePath,
    commits: output.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [sha, author, date, ...message] = line.split('\t');
      return { sha, author, date, message: message.join('\t') };
    })
  };
}

function resolveGitRoot(config = {}) {
  return path.resolve(String(config.root || process.cwd()));
}

async function ensureGitRepo(root) {
  const gitDir = path.join(root, '.git');
  if (!fs.existsSync(gitDir)) throw new Error('Configured folder is not a git repository');
}

function runGit(root, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(stderr.trim() || `git ${args.join(' ')} failed`));
      else resolve(stdout);
    });
  });
}

function ensureInsideRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside the approved git root');
}

function emptySchema() {
  return { type: 'object', properties: {} };
}

module.exports = { getGitAdapter, testGit, callGitTool, listGitResources, readGitResource };
