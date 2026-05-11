// MCP Runtime
// ============================================
const MCP_RUNTIME = {
    protocolVersion: '2024-11-05',
    toolTimeoutMs: 25000,
    maxToolRounds: 15
};

function normalizeMcpServerRecord(server) {
    server.transport = server.transport || (isBridgeServer(server) ? 'bridge' : 'http');
    server.config = server.config && typeof server.config === 'object' ? server.config : {};
    server.resources = Array.isArray(server.resources) ? server.resources : [];
    server.executionHistory = Array.isArray(server.executionHistory) ? server.executionHistory : [];
    server.permissions = server.permissions && typeof server.permissions === 'object'
        ? server.permissions
        : { read: 'auto', network: 'confirm', destructive: 'confirm' };
    server.health = server.health || { state: server.status || 'untested', checkedAt: 0 };
    return server;
}

function isMcpSystemServer(server = {}) {
    if (server.transport === 'mcp-system') return true;
    if (['browser', 'memory'].includes(server.type)) return true;
    return server.type === 'filesystem' && String(server.endpoint || '').includes('/mcp');
}

async function mcpRuntimeConnect(server, options = {}) {
    normalizeMcpServerRecord(server);
    if (isMcpSystemServer(server)) return connectMcpSystemServer(server, options);
    if (server.transport === 'bridge' || isBridgeServer(server)) return connectBridgeMcpServer(server, options);
    return connectHttpMcpServer(server, options);
}

async function connectMcpSystemServer(server, options = {}) {
    const [status, toolsResult] = await Promise.all([
        getMcpSystemStatus(),
        getMcpSystemTools({ includeInactive: true })
    ]);
    const tools = (toolsResult.tools || [])
        .filter(tool => tool.server === server.type)
        .map(tool => normalizeMcpTool(server, { ...tool, inputSchema: tool.inputSchema || { type: 'object', properties: tool.parameters || {} } }));
    const serverStatus = (status.servers || []).find(item => item.type === server.type);
    return {
        status: serverStatus?.status === 'unconfigured' ? 'untested' : 'connected',
        health: { state: serverStatus?.status || 'online', checkedAt: Date.now(), label: serverStatus?.name || server.name },
        capabilities: tools,
        resources: [],
        lastSeenAt: Date.now(),
        lastError: ''
    };
}

async function connectBridgeMcpServer(server, options = {}) {
    await bridgeHealth(server);
    const result = await bridgeRequest(server, '/servers/test', { server: serializeMcpServerForBridge(server) }, options);
    const tools = (result.tools || []).map(tool => normalizeMcpTool(server, tool));
    const resources = (result.resources || []).map(resource => normalizeMcpResource(server, resource));
    return {
        status: 'connected',
        health: { state: 'online', checkedAt: Date.now(), label: result.label || '' },
        capabilities: tools,
        resources,
        lastSeenAt: Date.now(),
        lastError: ''
    };
}

async function connectHttpMcpServer(server, options = {}) {
    await mcpHttpRpc(server.endpoint, 'initialize', {
        protocolVersion: MCP_RUNTIME.protocolVersion,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        clientInfo: { name: CONFIG.SITE_NAME, version: '1.0.0' }
    }, options);
    const [toolsResult, resourcesResult] = await Promise.allSettled([
        mcpHttpRpc(server.endpoint, 'tools/list', {}, options),
        mcpHttpRpc(server.endpoint, 'resources/list', {}, options)
    ]);
    const tools = toolsResult.status === 'fulfilled'
        ? (toolsResult.value?.tools || []).map(tool => normalizeMcpTool(server, tool))
        : [];
    const resources = resourcesResult.status === 'fulfilled'
        ? (resourcesResult.value?.resources || []).map(resource => normalizeMcpResource(server, resource))
        : [];
    return {
        status: 'connected',
        health: { state: 'online', checkedAt: Date.now() },
        capabilities: tools,
        resources,
        lastSeenAt: Date.now(),
        lastError: ''
    };
}

async function mcpRuntimeListTools(server, options = {}) {
    normalizeMcpServerRecord(server);
    if (isMcpSystemServer(server)) {
        const result = await getMcpSystemTools({ includeInactive: true });
        return (result.tools || [])
            .filter(tool => tool.server === server.type)
            .map(tool => normalizeMcpTool(server, { ...tool, inputSchema: tool.inputSchema || { type: 'object', properties: tool.parameters || {} } }));
    }
    if (server.transport === 'bridge' || isBridgeServer(server)) {
        const result = await bridgeRequest(server, '/tools/list', { server: serializeMcpServerForBridge(server) }, options);
        return (result.tools || []).map(tool => normalizeMcpTool(server, tool));
    }
    const result = await mcpHttpRpc(server.endpoint, 'tools/list', {}, options);
    return (result?.tools || []).map(tool => normalizeMcpTool(server, tool));
}

async function mcpRuntimeCallTool(server, toolName, args = {}, options = {}) {
    normalizeMcpServerRecord(server);
    if (isMcpSystemServer(server)) {
        const result = await callMcpSystemTool(server.type, toolName, args || {}, options);
        return result.result ?? result;
    }
    if (server.transport === 'bridge' || isBridgeServer(server)) {
        const result = await bridgeRequest(server, '/tools/call', {
            server: serializeMcpServerForBridge(server),
            toolName,
            arguments: args || {}
        }, options);
        return result.result ?? result;
    }
    const result = await mcpHttpRpc(server.endpoint, 'tools/call', {
        name: toolName,
        arguments: args || {}
    }, options);
    return result;
}

async function mcpRuntimeListResources(server, options = {}) {
    normalizeMcpServerRecord(server);
    if (server.transport === 'bridge' || isBridgeServer(server)) {
        const result = await bridgeRequest(server, '/resources/list', { server: serializeMcpServerForBridge(server) }, options);
        return (result.resources || []).map(resource => normalizeMcpResource(server, resource));
    }
    const result = await mcpHttpRpc(server.endpoint, 'resources/list', {}, options);
    return (result?.resources || []).map(resource => normalizeMcpResource(server, resource));
}

async function mcpRuntimeReadResource(server, uri, options = {}) {
    normalizeMcpServerRecord(server);
    if (server.transport === 'bridge' || isBridgeServer(server)) {
        return bridgeRequest(server, '/resources/read', { server: serializeMcpServerForBridge(server), uri }, options);
    }
    return mcpHttpRpc(server.endpoint, 'resources/read', { uri }, options);
}

function serializeMcpServerForBridge(server) {
    return {
        id: server.id,
        name: server.name,
        type: server.type,
        config: server.config || {}
    };
}
