// MCP Manager
    // ============================================
    function createMcpServer({ type, name, endpoint }) {
        const preset = getMcpPreset(type);
        const now = Date.now();
        return {
            id: generateId(),
            name: String(name || preset.defaultName).trim(),
            type: preset.type,
            endpoint: String(endpoint || '').trim(),
            enabled: false,
            status: 'untested',
            capabilities: [],
            createdAt: now,
            updatedAt: now,
            lastError: ''
        };
    }

    function addMcpServer() {
        const type = el.mcpServerType.value || 'custom';
        const server = createMcpServer({
            type,
            name: el.mcpServerName.value,
            endpoint: el.mcpServerEndpoint.value
        });
        if (!server.endpoint) {
            showToast('Add a browser-reachable MCP HTTP endpoint', 'error');
            return;
        }
        state.mcpServers.push(server);
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
        el.mcpServerName.value = '';
        el.mcpServerEndpoint.value = '';
    }

    function updateMcpServer(id, patch) {
        const server = state.mcpServers.find(item => item.id === id);
        if (!server) return null;
        Object.assign(server, patch, { updatedAt: Date.now() });
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
        return server;
    }

    function removeMcpServer(id) {
        state.mcpServers = state.mcpServers.filter(server => server.id !== id);
        saveMcpServers();
        renderMcpServers();
        updateContextInspector();
    }

    async function testMcpServer(id) {
        const server = updateMcpServer(id, { status: 'testing', lastError: '' });
        if (!server) return;
        try {
            const result = await testMcpEndpoint(server.endpoint);
            updateMcpServer(id, {
                status: 'connected',
                capabilities: result.capabilities,
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
