// MCP Manager
    // ============================================
    function createMcpServer({ type, name, endpoint, config }) {
        const preset = getMcpPreset(type);
        const now = Date.now();
        return {
            id: generateId(),
            name: String(name || preset.defaultName).trim(),
            type: preset.type,
            endpoint: String(endpoint || preset.defaultEndpoint || '').trim(),
            transport: preset.transport || 'http',
            config: config || {},
            enabled: false,
            status: 'untested',
            workspaceId: state.activeWorkspaceId,
            capabilities: [],
            resources: [],
            permissions: { read: 'auto', network: 'confirm', destructive: 'confirm' },
            health: { state: 'untested', checkedAt: 0 },
            lastSeenAt: 0,
            executionHistory: [],
            createdAt: now,
            updatedAt: now,
            lastError: ''
        };
    }

    function addMcpServer() {
        const type = el.mcpServerType.value || 'custom';
        let config = {};
        try {
            config = parseMcpConfigInput();
        } catch (error) {
            return;
        }
        const server = createMcpServer({
            type,
            name: el.mcpServerName.value,
            endpoint: el.mcpServerEndpoint.value,
            config
        });
        if (!server.endpoint && server.transport !== 'bridge') {
            showToast('Add a browser-reachable MCP HTTP endpoint', 'error');
            return;
        }
        state.mcpServers.push(server);
        syncWorkspaceForMcpServer(server);
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
        el.mcpServerName.value = '';
        el.mcpServerEndpoint.value = '';
        if (el.mcpServerConfig) el.mcpServerConfig.value = '';
    }

    function addRecommendedMcpServer(type, options = {}) {
        const preset = getMcpPreset(type);
        if (!preset) return null;
        const existing = getWorkspaceMcpServers().find(server => server.type === type);
        if (existing) return existing;
        const server = createMcpServer({
            type,
            name: preset.defaultName,
            endpoint: preset.defaultEndpoint,
            config: preset.defaultConfig ? preset.defaultConfig() : {}
        });
        state.mcpServers.push(server);
        syncWorkspaceForMcpServer(server);
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
        if (options.fillForm) fillMcpFormFromPreset(preset);
        return server;
    }

    async function testRecommendedMcpServer(type) {
        const server = addRecommendedMcpServer(type);
        if (server) await testMcpServer(server.id);
        renderRecommendedMcpCards();
    }

    function fillMcpFormFromPreset(preset) {
        el.mcpServerType.value = preset.type;
        el.mcpServerName.value = preset.defaultName;
        el.mcpServerEndpoint.value = preset.defaultEndpoint || '';
        if (el.mcpServerConfig) el.mcpServerConfig.value = JSON.stringify(preset.defaultConfig ? preset.defaultConfig() : {}, null, 2);
    }

    function parseMcpConfigInput() {
        const raw = el.mcpServerConfig?.value.trim();
        if (!raw) return {};
        try {
            const config = JSON.parse(raw);
            if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Config must be an object');
            return config;
        } catch (error) {
            showToast('Bridge config must be valid JSON', 'error');
            throw error;
        }
    }

    function updateMcpServer(id, patch) {
        const server = getWorkspaceMcpServers().find(item => item.id === id);
        if (!server) return null;
        Object.assign(server, patch, { updatedAt: Date.now() });
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
        return server;
    }

    function removeMcpServer(id) {
        const server = state.mcpServers.find(item => item.id === id);
        removeWorkspaceRelation(server?.workspaceId, 'mcpServerIds', id);
        state.mcpServers = state.mcpServers.filter(server => server.id !== id);
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
    }

    async function testMcpServer(id) {
        const server = updateMcpServer(id, { status: 'testing', lastError: '' });
        if (!server) return;
        if (['filesystem', 'browser', 'memory'].includes(server.type)) {
            server.transport = 'mcp-system';
            server.endpoint = location.protocol === 'file:' ? '' : `${location.origin}/mcp`;
        }
        try {
            const result = await mcpRuntimeConnect(server);
            updateMcpServer(id, {
                enabled: Boolean(server.enabled),
                status: 'connected',
                capabilities: result.capabilities,
                resources: result.resources || [],
                health: result.health,
                lastSeenAt: result.lastSeenAt,
                lastError: ''
            });
            showToast(`${server.name} connected`, 'success');
        } catch (error) {
            updateMcpServer(id, {
                status: 'error',
                capabilities: [],
                lastError: error.message || 'Connection failed'
            });
            showToast(`${server.name} is unreachable`, 'error');
        }
    }

    async function refreshMcpBridgeStatus() {
        if (!el.mcpBridgeStatus) return;
        if (location.protocol === 'file:') {
            el.mcpBridgeStatus.textContent = 'Bridge requires npm start';
            el.mcpBridgeStatus.className = 'provider-status error';
            return;
        }
        try {
            await bridgeHealth({ endpoint: `${location.origin}/bridge` });
            state.mcpBridgeHealth = { status: 'online', checkedAt: Date.now(), error: '' };
            el.mcpBridgeStatus.textContent = 'Bridge online';
            el.mcpBridgeStatus.className = 'provider-status connected';
        } catch (error) {
            state.mcpBridgeHealth = { status: 'offline', checkedAt: Date.now(), error: error.message || 'Bridge offline' };
            el.mcpBridgeStatus.textContent = 'Bridge offline';
            el.mcpBridgeStatus.className = 'provider-status error';
        }
    }
