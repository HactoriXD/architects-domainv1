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
      'mcpControlCenterBtn',
      'mcpControlCenterModal',
      'mcpToolInspector'
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

    const runtimeConfigResponse = await fetch(`${baseUrl}/mcp-config.json`);
    assert(runtimeConfigResponse.status === 403, 'Expected runtime MCP config file to be blocked by static server');

    const bridgeHealth = await fetch(`${baseUrl}/bridge/health`);
    assert(bridgeHealth.ok, 'Expected /bridge/health to return 200');
    const bridgeJson = await bridgeHealth.json();
    assert(bridgeJson.ok && bridgeJson.presets.includes('filesystem') && bridgeJson.presets.includes('git') && bridgeJson.presets.includes('app-inspector'), 'Bridge health missing core cockpit presets');

    const bridgeTest = await fetch(`${baseUrl}/bridge/servers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: { type: 'filesystem', config: { root } } })
    });
    assert(bridgeTest.ok, 'Expected filesystem bridge test to pass');

    const mcpStatus = await fetch(`${baseUrl}/mcp/status`);
    assert(mcpStatus.ok, 'Expected /mcp/status to return 200');
    const mcpStatusJson = await mcpStatus.json();
    assert(mcpStatusJson.success && mcpStatusJson.servers.some(server => server.type === 'memory'), 'MCP status missing built-in servers');

    const mcpTools = await fetch(`${baseUrl}/mcp/tools/all`);
    assert(mcpTools.ok, 'Expected /mcp/tools/all to return 200');

    const mcpError = await fetch(`${baseUrl}/mcp/filesystem/read_file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path.resolve(root, '..', 'package.json') })
    });
    assert(mcpError.status >= 400, 'Expected disallowed MCP filesystem read to fail');
    const mcpErrorJson = await mcpError.json();
    assert(mcpErrorJson.success === false && mcpErrorJson.error?.code, 'Expected structured MCP error response');

    const browserReset = await fetch(`${baseUrl}/mcp/browser/session/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(browserReset.ok, 'Expected MCP browser session reset to pass');
    const browserScreenshot = await fetch(`${baseUrl}/mcp/browser/browser_screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, fullPage: false })
    });
    assert(browserScreenshot.ok, 'Expected MCP browser screenshot to pass');
    const screenshotJson = await browserScreenshot.json();
    assert(screenshotJson.result?.screenshotBase64?.length > 100, 'Expected browser screenshot base64 output');

    const browserNavigate = await fetch(`${baseUrl}/mcp/browser/browser_navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl })
    });
    assert(browserNavigate.ok, 'Expected MCP browser navigate to pass');

    const browserScreenshotCurrent = await fetch(`${baseUrl}/mcp/browser/browser_screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullPage: false })
    });
    assert(browserScreenshotCurrent.ok, 'Expected MCP browser current-page screenshot to pass');

    const browserTextCurrent = await fetch(`${baseUrl}/mcp/browser/browser_extract_text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(browserTextCurrent.ok, 'Expected MCP browser current-page text extraction to pass');
    const textJson = await browserTextCurrent.json();
    assert(String(textJson.result?.text || '').includes('Architect'), 'Expected browser text extraction to include app text');

    const browserScreenshotAgain = await fetch(`${baseUrl}/mcp/browser/browser_screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, fullPage: false })
    });
    assert(browserScreenshotAgain.ok, 'Expected MCP browser screenshot repeat to pass');

    const browserTextAgain = await fetch(`${baseUrl}/mcp/browser/browser_extract_text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl })
    });
    assert(browserTextAgain.ok, 'Expected MCP browser text repeat to pass');

    const browserBadUrl = await fetch(`${baseUrl}/mcp/browser/browser_screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });
    assert(browserBadUrl.status >= 400, 'Expected unsafe browser URL to fail');

    const browserAfterFailure = await fetch(`${baseUrl}/mcp/browser/browser_screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, fullPage: false })
    });
    assert(browserAfterFailure.ok, 'Expected MCP browser to recover after failed URL');

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
