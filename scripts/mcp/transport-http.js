// MCP HTTP Transport
// ============================================
async function mcpHttpRpc(endpoint, method, params = {}, options = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: generateId(),
            method,
            params
        }),
        signal: options.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await parseMcpTransportResponse(response);
    if (payload.error) throw new Error(payload.error.message || 'MCP request failed');
    return payload.result;
}

async function parseMcpTransportResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) return parseMcpSsePayload(await response.text());
    return response.json();
}
