const os = require('os');
const path = require('path');

function getBridgeHealthAdapter() {
  return {
    type: 'bridge-health',
    label: 'Bridge Health',
    description: 'Check local bridge status, Node version, process info, and configured ports.',
    tools: [
      { name: 'bridge.health', description: 'Show bridge runtime health.', safety: 'read', inputSchema: { type: 'object', properties: {} } },
      { name: 'bridge.environment', description: 'Show local runtime environment details.', safety: 'read', inputSchema: { type: 'object', properties: {} } }
    ],
    resources: []
  };
}

async function testBridgeHealth(config = {}) {
  return { ok: true, label: `Bridge on port ${process.env.PORT || 3000}`, tools: getBridgeHealthAdapter().tools, resources: [] };
}

async function callBridgeHealthTool(config = {}, toolName) {
  if (toolName === 'bridge.health') return bridgeHealth(config);
  if (toolName === 'bridge.environment') return bridgeEnvironment(config);
  throw new Error(`Unknown bridge health tool: ${toolName}`);
}

async function listBridgeHealthResources() {
  return [];
}

async function readBridgeHealthResource() {
  return bridgeHealth({});
}

function bridgeHealth(config = {}) {
  return {
    ok: true,
    name: "Architect's Domain Bridge",
    port: Number(process.env.PORT || 3000),
    cwd: process.cwd(),
    projectRoot: path.resolve(config.root || process.cwd()),
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    node: process.version
  };
}

function bridgeEnvironment(config = {}) {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    home: os.homedir(),
    cwd: process.cwd(),
    cpus: os.cpus().length,
    memory: {
      total: os.totalmem(),
      free: os.freemem()
    }
  };
}

module.exports = { getBridgeHealthAdapter, testBridgeHealth, callBridgeHealthTool, listBridgeHealthResources, readBridgeHealthResource };
