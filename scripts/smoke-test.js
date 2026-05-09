const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 3100 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      await fetchText(baseUrl);
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw new Error('Static server did not start in time');
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    await waitForServer();
    const html = await fetchText(baseUrl);
    const requiredText = [
      'Workspace Manager',
      'Data Manager',
      'Context Sources',
      'Memory Manager',
      'scripts/data-manager.js',
      'scripts/workspaces/store.js',
      'scripts/mcp/runtime.js',
      'mcpExecutionList'
    ];
    requiredText.forEach(text => assert(html.includes(text), `Missing "${text}" in index.html`));

    const scriptSources = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    assert(scriptSources.length >= 15, 'Expected script tags to be present');
    for (const src of scriptSources) {
      const response = await fetch(`${baseUrl}/${src}`);
      assert(response.ok, `${src} returned ${response.status}`);
    }

    const apiResponse = await fetch(`${baseUrl}/api/test`);
    assert(apiResponse.status === 410, 'Expected /api/* to return 410');

    const bridgeHealth = await fetch(`${baseUrl}/bridge/health`);
    assert(bridgeHealth.ok, 'Expected /bridge/health to return 200');
    const bridgeJson = await bridgeHealth.json();
    assert(bridgeJson.ok && bridgeJson.presets.includes('filesystem'), 'Bridge health missing filesystem preset');

    const bridgeTest = await fetch(`${baseUrl}/bridge/servers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: { type: 'filesystem', config: { root } } })
    });
    assert(bridgeTest.ok, 'Expected filesystem bridge test to pass');

    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert(!serverSource.includes('Architectâ'), 'Server contains mojibake text');

    console.log('Smoke test passed.');
  } finally {
    server.kill();
    if (stderr.trim()) console.error(stderr.trim());
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
