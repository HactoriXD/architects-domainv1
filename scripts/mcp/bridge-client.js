// MCP Bridge Client
// ============================================
function getBridgeBaseUrl(server = {}) {
    const endpoint = String(server.endpoint || '').trim();
    if (endpoint) return endpoint.replace(/\/+$/, '');
    const origin = getLocalBridgeOrigin();
    return origin ? `${origin}/bridge` : '';
}

function isBridgeServer(server = {}) {
    return ['filesystem', 'browser', 'memory', 'markdown-vault', 'github', 'web-fetch', 'git', 'app-inspector', 'bridge-health', 'web-fetch-plus', 'notes-vault'].includes(server.type)
        || String(server.transport || '').startsWith('bridge');
}

async function bridgeRequest(server, path, payload = {}, options = {}) {
    const base = getBridgeBaseUrl(server);
    if (!base) throw new Error('Local bridge unavailable. Start the app with npm start to use local MCP tools.');
    const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Bridge HTTP ${response.status}`);
    return data;
}

async function bridgeHealth(server = {}) {
    const base = getBridgeBaseUrl(server);
    if (!base) throw new Error('Local bridge unavailable. Start the app with npm start.');
    const response = await fetch(`${base}/health`, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Bridge HTTP ${response.status}`);
    return data;
}

function getMcpSystemBaseUrl() {
    const origin = getLocalBridgeOrigin();
    return origin ? `${origin}/mcp` : '';
}

function getLocalBridgeOrigin() {
    if (location.protocol === 'file:') return '';
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return location.origin;
    if (location.hostname === 'tauri.localhost' || location.protocol === 'tauri:' || location.protocol === 'asset:') {
        return 'http://127.0.0.1:3000';
    }
    return location.origin;
}

async function mcpSystemRequest(path, options = {}) {
    const base = getMcpSystemBaseUrl();
    if (!base) throw new Error('Local MCP bridge unavailable. Start the app with npm start.');
    const response = await fetch(`${base}${path}`, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false || data.error) {
        throw new Error(data.error?.message || data.error || `MCP HTTP ${response.status}`);
    }
    return data;
}

const getMcpSystemStatus = () => mcpSystemRequest('/status');
const getMcpSystemTools = (options = {}) => mcpSystemRequest(`/tools/all${options.includeInactive ? '?includeInactive=true' : ''}`);
const getMcpSystemLog = () => mcpSystemRequest('/log');
const getMcpSystemConfig = () => mcpSystemRequest('/config');
const saveMcpSystemConfig = (config) => mcpSystemRequest('/config', { method: 'PUT', body: { config } });

async function callMcpSystemTool(server, toolName, args = {}, options = {}) {
    const normalizedServer = server === 'browser' ? 'browser' : server;
    return mcpSystemRequest(`/${normalizedServer}/${toolName}`, {
        method: 'POST',
        body: args || {},
        signal: options.signal
    });
}

async function confirmMcpSystemOperation(server, operationId) {
    return mcpSystemRequest(`/${server}/confirm/${operationId}`, { method: 'POST', body: {} });
}
