// Architect's Domain MCP Health
// ============================================
(function initArchitectMcpHealth(global) {
    const host = global.ArchitectMCP;
    if (!host) return;

    function getHealth() {
        const servers = host.listServers ? host.listServers() : [];
        const bridgeStatus = global.state?.mcpControl?.status || {};
        const browser = bridgeStatus.browser || bridgeStatus.servers?.find(server => server.type === 'browser')?.session || {};
        const queue = Array.from(host._state.executionQueues || new Map()).map(([key]) => ({ key, status: 'active' }));
        return {
            enabled: global.state?.mcpControl?.toolCallingMode !== 'disabled',
            initialized: Boolean(host._state.initialized),
            lastRefreshAt: host._state.lastRefreshAt || 0,
            servers: servers.map(server => ({
                id: server.id,
                name: server.name,
                type: server.type,
                transport: server.transport,
                status: server.status,
                statusState: server.meta?.statusState,
                toolCount: server.tools?.length || 0,
                resourceCount: server.resources?.length || 0,
                promptCount: server.prompts?.length || 0,
                lastSeenAt: server.lastSeenAt || 0,
                lastError: server.lastError || ''
            })),
            toolCount: host.listTools ? host.listTools().length : 0,
            resourceCount: host.listResources ? host.listResources().length : 0,
            promptCount: host.listPrompts ? host.listPrompts().length : 0,
            browser,
            queue,
            lastErrors: (host.getAuditLog ? host.getAuditLog() : []).filter(row => row.success === false).slice(0, 10)
        };
    }

    async function resetSession(target = '') {
        const normalized = String(target || '').trim().toLowerCase();
        if (!normalized || normalized === 'all') return resetAllSessions();
        if (['browser', 'puppeteer', 'builtin-browser'].includes(normalized)) {
            const result = typeof mcpSystemRequest === 'function'
                ? await mcpSystemRequest('/browser/session/reset', { method: 'POST', body: {} })
                : { result: { reset: false, reason: 'MCP bridge unavailable' } };
            host.audit?.({ eventType: 'status', serverName: 'Puppeteer Browser', toolName: 'reset', message: 'Browser MCP session reset', details: result });
            await refreshControlDataQuietly();
            return result.result ?? result;
        }
        const server = (typeof getWorkspaceMcpServers === 'function' ? getWorkspaceMcpServers() : []).find(item =>
            item.id === target || item.name === target || item.type === normalized
        );
        if (!server) return { reset: false, error: 'MCP server not found' };
        server.status = server.enabled ? 'untested' : 'disabled';
        server.lastError = '';
        server.health = { state: 'reset', checkedAt: Date.now() };
        if (typeof saveMcpServers === 'function') await saveMcpServers();
        if (typeof renderMcpServers === 'function') renderMcpServers();
        host.audit?.({ eventType: 'status', serverId: server.id, serverName: server.name, message: `${server.name} session reset` });
        return { reset: true, serverId: server.id, serverName: server.name };
    }

    async function resetAllSessions() {
        host._state.executionQueues.clear();
        if (global.state?.mcpControl?.sessionApprovals) global.state.mcpControl.sessionApprovals = {};
        const browserReset = await resetSession('browser').catch(error => ({ reset: false, error: error.message || String(error) }));
        for (const server of typeof getWorkspaceMcpServers === 'function' ? getWorkspaceMcpServers() : []) {
            server.lastError = '';
            if (server.status === 'degraded' || server.status === 'timeout') server.status = 'untested';
        }
        if (typeof saveMcpServers === 'function') await saveMcpServers();
        if (typeof renderMcpServers === 'function') renderMcpServers();
        host.audit?.({ eventType: 'status', message: 'MCP sessions reset', details: { browserReset } });
        return { reset: true, browser: browserReset };
    }

    function buildDebugReport() {
        const health = getHealth();
        const audit = (host.getAuditLog ? host.getAuditLog() : []).slice(0, 10);
        const report = {
            title: "Architect's Domain MCP Debug Report",
            timestamp: new Date().toISOString(),
            app: {
                name: global.CONFIG?.SITE_NAME || "Architect's Domain",
                version: global.CONFIG?.VERSION || ''
            },
            health,
            servers: health.servers,
            tools: (host.listTools ? host.listTools() : []).map(tool => ({
                id: tool.id,
                serverId: tool.serverId,
                serverName: tool.serverName,
                name: tool.name,
                category: tool.category,
                available: tool.available,
                risk: tool.risk,
                requiresApproval: tool.requiresApproval
            })),
            queue: health.queue,
            audit,
            browser: health.browser,
            storage: {
                currentChatId: global.state?.currentChatId || '',
                workspaceId: global.state?.activeWorkspaceId || '',
                mcpToolCallingMode: global.state?.mcpControl?.toolCallingMode || 'native'
            }
        };
        return JSON.stringify(host.redactSecrets ? host.redactSecrets(report) : report, null, 2);
    }

    async function refreshControlDataQuietly() {
        if (typeof refreshMcpControlData === 'function') {
            await refreshMcpControlData().catch(error => {
                host.audit?.({ eventType: 'error', success: false, message: 'MCP health refresh failed', details: { error: error.message || String(error) } });
            });
        }
    }

    host._extend({
        getHealth,
        resetSession,
        resetAllSessions,
        buildDebugReport
    });
})(window);
