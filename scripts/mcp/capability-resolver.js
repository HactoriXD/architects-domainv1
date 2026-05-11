// MCP Capability Resolver
// ============================================
function normalizeMcpTool(server, tool) {
    const safety = normalizeMcpRiskLevel(tool.safety || inferMcpToolSafety(tool.name, tool.description));
    return {
        kind: 'tool',
        serverId: server.id,
        serverName: server.name,
        name: String(tool.name || 'unnamed-tool'),
        description: String(tool.description || ''),
        inputSchema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} },
        safety
    };
}

function normalizeMcpResource(server, resource) {
    return {
        kind: 'resource',
        serverId: server.id,
        serverName: server.name,
        uri: String(resource.uri || ''),
        name: String(resource.name || resource.uri || 'Resource'),
        description: String(resource.description || '')
    };
}

function inferMcpToolSafety(name = '', description = '') {
    const value = `${name} ${description}`.toLowerCase();
    if (/\b(delete|remove|clear|reset|destroy|drop|format)\b/.test(value)) return 'destructive';
    if (/\b(write|create|update|edit|commit|push|merge|shell|exec|run|upload|append)\b/.test(value)) return 'write';
    if (/\b(fetch|post|request|network|browser|navigate|search|screenshot|click|type|github)\b/.test(value)) return 'external';
    return 'read';
}

function getActiveMcpTools() {
    const chatState = typeof getCurrentMcpChatState === 'function' ? getCurrentMcpChatState() : null;
    return getWorkspaceMcpServers()
        .filter(server => {
            const activeInChat = chatState ? chatState.activeServerIds.includes(server.id) : server.enabled;
            return activeInChat && server.enabled && ['connected', 'degraded'].includes(server.status);
        })
        .flatMap(server => (server.capabilities || [])
            .filter(item => item.kind === 'tool')
            .filter(tool => isMcpToolEnabledForChat(server, tool))
            .map(tool => ({ ...tool, serverId: server.id, serverName: server.name, permission: getMcpToolPermissionSnapshot(server, tool) })));
}

function isMcpToolEnabledForChat(server, tool) {
    const permission = getMcpToolPermissionSnapshot(server, tool);
    if (permission.enabled === false) return false;
    if (server.permissions?.readOnly && ['write', 'destructive'].includes(permission.riskLevel || tool.safety)) return false;
    return true;
}

function getMcpToolPermissionSnapshot(server, tool) {
    const riskLevel = normalizeMcpRiskLevel(tool.safety || inferMcpToolSafety(tool.name, tool.description));
    const stored = server.permissions?.toolPermissions?.[tool.name] || {};
    return {
        enabled: stored.enabled !== false,
        requiresApproval: typeof stored.requiresApproval === 'boolean' ? stored.requiresApproval : riskLevel !== 'read',
        riskLevel,
        lastUsedAt: stored.lastUsedAt || 0,
        errorCount: Number(stored.errorCount) || 0
    };
}

function getMcpToolByQualifiedName(qualifiedName) {
    const tools = getActiveMcpTools();
    return tools.find(tool => getMcpToolQualifiedName(tool) === qualifiedName || tool.name === qualifiedName);
}

function getMcpToolQualifiedName(tool) {
    return `${tool.serverId}:${tool.name}`;
}

function buildMcpToolSummaries(limit = 20) {
    return getActiveMcpTools().slice(0, limit).map(tool => ({
        name: getMcpToolQualifiedName(tool),
        displayName: tool.name,
        server: tool.serverName,
        description: tool.description,
        safety: tool.safety || 'read'
    }));
}

function buildProviderToolDefinitions() {
    if (typeof isMcpToolsEnabled === 'function' && !isMcpToolsEnabled()) return [];
    if (state.mcpControl?.toolCallingMode && state.mcpControl.toolCallingMode !== 'native') return [];
    return getActiveMcpTools().slice(0, 64).map(tool => ({
        type: 'function',
        function: {
            name: mcpToolNameToProviderName(getMcpToolQualifiedName(tool)),
            description: `${tool.serverName}: ${tool.description || tool.name}`,
            parameters: sanitizeMcpJsonSchema(tool.inputSchema)
        }
    }));
}

function mcpToolNameToProviderName(name) {
    return String(name).replace(/[^a-zA-Z0-9_-]/g, '__').slice(0, 64);
}

function providerToolNameToMcpName(providerName) {
    const target = String(providerName || '');
    const tool = getActiveMcpTools().find(item => mcpToolNameToProviderName(getMcpToolQualifiedName(item)) === target);
    return tool ? getMcpToolQualifiedName(tool) : target.replace(/__/g, ':');
}

function sanitizeMcpJsonSchema(schema) {
    if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
    return {
        type: schema.type || 'object',
        properties: schema.properties || {},
        required: Array.isArray(schema.required) ? schema.required : []
    };
}
