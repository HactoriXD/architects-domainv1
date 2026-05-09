const GITHUB_API = 'https://api.github.com';

function getGithubAdapter() {
  return {
    type: 'github',
    label: 'GitHub',
    description: 'Read repositories, files, issues, and commits through the GitHub REST API.',
    tools: [
      {
        name: 'github.get_repo',
        description: 'Get repository metadata.',
        safety: 'read',
        inputSchema: repoSchema()
      },
      {
        name: 'github.list_files',
        description: 'List files in a repository folder.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            path: { type: 'string' },
            ref: { type: 'string' }
          }
        }
      },
      {
        name: 'github.read_file',
        description: 'Read a UTF-8 file from a repository.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          required: ['path'],
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            path: { type: 'string' },
            ref: { type: 'string' }
          }
        }
      },
      {
        name: 'github.list_issues',
        description: 'List open or closed repository issues.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            state: { type: 'string', enum: ['open', 'closed', 'all'] },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'github.list_commits',
        description: 'List recent repository commits.',
        safety: 'read',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            ref: { type: 'string' },
            limit: { type: 'number' }
          }
        }
      }
    ],
    resources: []
  };
}

async function testGithub(config = {}) {
  const owner = config.owner;
  const repo = config.repo;
  if (!owner || !repo) {
    return {
      ok: true,
      label: 'GitHub API reachable; add owner/repo for repository checks.',
      tools: getGithubAdapter().tools,
      resources: []
    };
  }
  const metadata = await githubFetch(config, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  return {
    ok: true,
    label: metadata.full_name,
    tools: getGithubAdapter().tools,
    resources: [{ uri: `github://${metadata.full_name}`, name: metadata.full_name, description: metadata.description || 'GitHub repository' }]
  };
}

async function callGithubTool(config, toolName, args = {}) {
  if (toolName === 'github.get_repo') return getRepo(config, args);
  if (toolName === 'github.list_files') return listFiles(config, args);
  if (toolName === 'github.read_file') return readFile(config, args);
  if (toolName === 'github.list_issues') return listIssues(config, args);
  if (toolName === 'github.list_commits') return listCommits(config, args);
  throw new Error(`Unknown GitHub tool: ${toolName}`);
}

async function listGithubResources(config) {
  if (!config.owner || !config.repo) return [];
  return [{ uri: `github://${config.owner}/${config.repo}`, name: `${config.owner}/${config.repo}`, description: 'Configured GitHub repository' }];
}

async function readGithubResource(config, uri) {
  const match = String(uri || '').match(/^github:\/\/([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (!match) throw new Error('Unsupported GitHub resource URI');
  return match[3]
    ? readFile(config, { owner: match[1], repo: match[2], path: match[3] })
    : getRepo(config, { owner: match[1], repo: match[2] });
}

async function getRepo(config, args) {
  const target = resolveRepo(config, args);
  const repo = await githubFetch(config, `/repos/${target.owner}/${target.repo}`);
  return {
    fullName: repo.full_name,
    description: repo.description,
    defaultBranch: repo.default_branch,
    private: repo.private,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    updatedAt: repo.updated_at
  };
}

async function listFiles(config, args) {
  const target = resolveRepo(config, args);
  const query = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
  const path = String(args.path || '').replace(/^\/+/, '');
  const items = await githubFetch(config, `/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}${query}`);
  const list = Array.isArray(items) ? items : [items];
  return {
    repo: `${target.owner}/${target.repo}`,
    path,
    files: list.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type,
      size: item.size,
      downloadUrl: item.download_url || null
    }))
  };
}

async function readFile(config, args) {
  const target = resolveRepo(config, args);
  const filePath = String(args.path || '').replace(/^\/+/, '');
  if (!filePath) throw new Error('Missing file path');
  const query = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : '';
  const item = await githubFetch(config, `/repos/${target.owner}/${target.repo}/contents/${encodePath(filePath)}${query}`);
  if (item.type !== 'file') throw new Error('GitHub path is not a file');
  if (item.encoding !== 'base64' || !item.content) throw new Error('Unsupported GitHub file encoding');
  const content = Buffer.from(item.content, 'base64').toString('utf8');
  return {
    repo: `${target.owner}/${target.repo}`,
    path: item.path,
    size: item.size,
    sha: item.sha,
    content
  };
}

async function listIssues(config, args) {
  const target = resolveRepo(config, args);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const state = args.state || 'open';
  const issues = await githubFetch(config, `/repos/${target.owner}/${target.repo}/issues?state=${encodeURIComponent(state)}&per_page=${limit}`);
  return issues.filter(issue => !issue.pull_request).map(issue => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user?.login || '',
    url: issue.html_url,
    updatedAt: issue.updated_at
  }));
}

async function listCommits(config, args) {
  const target = resolveRepo(config, args);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const sha = args.ref ? `&sha=${encodeURIComponent(args.ref)}` : '';
  const commits = await githubFetch(config, `/repos/${target.owner}/${target.repo}/commits?per_page=${limit}${sha}`);
  return commits.map(item => ({
    sha: item.sha,
    message: item.commit?.message || '',
    author: item.commit?.author?.name || item.author?.login || '',
    url: item.html_url,
    date: item.commit?.author?.date || ''
  }));
}

function resolveRepo(config, args = {}) {
  const owner = encodeURIComponent(args.owner || config.owner || '');
  const repo = encodeURIComponent(args.repo || config.repo || '');
  if (!owner || !repo) throw new Error('Missing GitHub owner/repo');
  return { owner, repo };
}

async function githubFetch(config, endpoint) {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Architects-Domain-MCP-Bridge',
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) throw new Error('GitHub unauthorized or rate limited. Check token permissions.');
    if (response.status === 404) throw new Error('GitHub repository or path not found.');
    throw new Error(`GitHub HTTP ${response.status}: ${text.slice(0, 180)}`);
  }
  return response.json();
}

function encodePath(value) {
  return String(value || '').split('/').map(encodeURIComponent).join('/');
}

function repoSchema() {
  return {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' }
    }
  };
}

module.exports = {
  getGithubAdapter,
  testGithub,
  callGithubTool,
  listGithubResources,
  readGithubResource
};
