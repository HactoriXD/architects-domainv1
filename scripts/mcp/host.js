// Architect's Domain MCP Host
// ============================================
(function initArchitectMcpHost(global) {
    const existing = global.ArchitectMCP || {};
    const hostState = existing._state || {
        initialized: false,
        executionQueues: new Map(),
        audit: [],
        lastRefreshAt: 0,
        settings: {
            maxToolTimeoutMs: 25000,
            maxExtractedTextPreviewLength: 12000,
            maxFilePreviewLength: 12000,
            showRawDebug: false
        }
    };

    function extend(methods = {}) {
        Object.assign(api, methods);
        return api;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function redactSecrets(value) {
        const secretKey = /\b(token|api[_-]?key|authorization|password|secret|bearer)\b/i;
        if (value == null) return value;
        if (typeof value === 'string') {
            return value.replace(/(api[_-]?key|authorization|token|password|secret|bearer)["']?\s*[:=]\s*["']?[^"',\s}\]]+/gi, '$1: [redacted]');
        }
        if (Array.isArray(value)) return value.map(redactSecrets);
        if (typeof value === 'object') {
            const out = {};
            for (const [key, item] of Object.entries(value)) out[key] = secretKey.test(key) ? '[redacted]' : redactSecrets(item);
            return out;
        }
        return value;
    }

    function audit(entry = {}) {
        const normalized = {
            id: entry.id || (typeof generateId === 'function' ? generateId() : `${Date.now()}-${Math.random()}`),
            timestamp: entry.timestamp || Date.now(),
            at: entry.at || nowIso(),
            eventType: entry.eventType || 'status',
            serverId: entry.serverId || '',
            serverName: entry.serverName || '',
            toolName: entry.toolName || '',
            success: entry.success !== false,
            message: String(entry.message || ''),
            details: redactSecrets(entry.details || null)
        };
        hostState.audit.unshift(normalized);
        hostState.audit = hostState.audit.slice(0, 300);
        if (typeof addMcpLog === 'function') addMcpLog(normalized).catch(() => {});
        return normalized;
    }

    function listServers() {
        const servers = typeof getWorkspaceMcpServers === 'function' ? getWorkspaceMcpServers() : (global.state?.mcpServers || []);
        return servers.map(server => ({
            id: server.id,
            name: server.name,
            type: server.type,
            transport: server.transport,
            status: server.status,
            capabilities: server.capabilities || [],
            tools: (server.capabilities || []).filter(item => item.kind === 'tool'),
            resources: server.resources || [],
            prompts: server.prompts || [],
            lastSeenAt: server.lastSeenAt || 0,
            lastError: server.lastError || '',
            session: server.session || null,
            meta: { enabled: server.enabled, statusState: server.statusState }
        }));
    }

    function listTools() {
        const tools = typeof getActiveMcpTools === 'function' ? getActiveMcpTools() : [];
        return tools.map(tool => api.normalizeTool(tool));
    }

    function normalizeTool(tool = {}) {
        const category = api.getToolCategory ? api.getToolCategory(tool) : 'other';
        const risk = tool.permission?.riskLevel || tool.safety || 'read';
        return {
            id: `${tool.serverId || 'server'}:${tool.name || 'tool'}`,
            serverId: tool.serverId || '',
            serverName: tool.serverName || '',
            name: String(tool.name || ''),
            canonicalName: String(tool.name || '').replace(/\./g, '_'),
            aliases: api.getToolAliases ? api.getToolAliases(tool.name) : [],
            description: tool.description || '',
            inputSchema: tool.inputSchema || { type: 'object', properties: {} },
            category,
            dangerous: ['write', 'destructive'].includes(risk),
            requiresApproval: Boolean(tool.permission?.requiresApproval),
            available: tool.permission?.enabled !== false,
            risk,
            meta: tool
        };
    }

    async function initialize() {
        hostState.initialized = true;
        if (typeof ensureBuiltInMcpServers === 'function') ensureBuiltInMcpServers();
        if (typeof refreshMcpControlData === 'function') await refreshMcpControlData().catch(() => {});
        return api.getHealth ? api.getHealth() : { initialized: true };
    }

    async function refreshServers() {
        const servers = typeof getWorkspaceMcpServers === 'function' ? getWorkspaceMcpServers() : [];
        const results = [];
        for (const server of servers) {
            if (!server.enabled && !['filesystem', 'browser', 'memory'].includes(server.type)) continue;
            try {
                const result = await mcpRuntimeConnect(server);
                Object.assign(server, {
                    status: result.status || 'connected',
                    capabilities: result.capabilities || server.capabilities || [],
                    resources: result.resources || server.resources || [],
                    health: result.health || server.health,
                    lastSeenAt: result.lastSeenAt || Date.now(),
                    lastError: ''
                });
                results.push({ serverId: server.id, ok: true });
            } catch (error) {
                server.status = 'error';
                server.lastError = error.message || 'Connection failed';
                results.push({ serverId: server.id, ok: false, error: server.lastError });
            }
        }
        hostState.lastRefreshAt = Date.now();
        if (typeof saveMcpServers === 'function') await saveMcpServers();
        if (typeof renderMcpServers === 'function') renderMcpServers();
        audit({ eventType: 'status', message: 'MCP servers refreshed', details: results });
        return results;
    }

    function getAuditLog() {
        const stored = global.state?.mcpLogs || [];
        return [...hostState.audit, ...stored].slice(0, 300);
    }

    const api = {
        ...existing,
        _state: hostState,
        _extend: extend,
        initialize,
        refreshServers,
        listServers,
        listTools,
        listResources: () => listServers().flatMap(server => server.resources.map(resource => ({ ...resource, serverId: server.id, serverName: server.name }))),
        listPrompts: () => listServers().flatMap(server => (server.prompts || []).map(prompt => ({ ...prompt, serverId: server.id, serverName: server.name }))),
        getAuditLog,
        audit,
        redactSecrets,
        normalizeTool,
        stripToolMarkup: existing.stripToolMarkup || (text => String(text || '')),
        parseDirectCommand: existing.parseDirectCommand || (() => ({ handled: false })),
        parseModelToolCalls: existing.parseModelToolCalls || (() => ({ calls: [], errors: [], visibleText: '' })),
        executeToolCall: existing.executeToolCall || (async () => { throw new Error('MCP executor is not ready'); }),
        executeDirectCommand: existing.executeDirectCommand || (async () => ({ handled: false, messages: [] })),
        renderToolResult: existing.renderToolResult || (() => null),
        getHealth: existing.getHealth || (() => ({ initialized: hostState.initialized, servers: listServers() })),
        resetSession: existing.resetSession || (async () => ({ reset: false })),
        resetAllSessions: existing.resetAllSessions || (async () => ({ reset: false })),
        buildDebugReport: existing.buildDebugReport || (() => 'Architect MCP debug report unavailable.')
    };

    global.ArchitectMCP = api;
})(window);
