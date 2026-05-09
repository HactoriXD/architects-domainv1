// MCP Bridge Client
// ============================================
function getBridgeBaseUrl(server = {}) {
    const endpoint = String(server.endpoint || '').trim();
    if (endpoint) return endpoint.replace(/\/+$/, '');
    return location.protocol === 'file:' ? '' : `${location.origin}/bridge`;
}

function isBridgeServer(server = {}) {
    return ['filesystem', 'markdown-vault', 'github', 'web-fetch'].includes(server.type)
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
