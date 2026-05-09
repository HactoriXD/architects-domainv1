// MCP Capability Resolver
// ============================================
function normalizeMcpTool(server, tool) {
    return {
        kind: 'tool',
        serverId: server.id,
        serverName: server.name,
        name: String(tool.name || 'unnamed-tool'),
        description: String(tool.description || ''),
        inputSchema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} },
        safety: tool.safety || inferMcpToolSafety(tool.name, tool.description)
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
    if (/\b(delete|remove|write|create|update|edit|commit|push|merge|shell|exec|run|upload)\b/.test(value)) return 'destructive';
    if (/\b(fetch|post|request|network)\b/.test(value)) return 'network';
    return 'read';
}

function getActiveMcpTools() {
    return getWorkspaceMcpServers()
        .filter(server => server.enabled && ['connected', 'degraded'].includes(server.status))
        .flatMap(server => (server.capabilities || []).filter(item => item.kind === 'tool').map(tool => ({ ...tool, serverId: server.id, serverName: server.name })));
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
