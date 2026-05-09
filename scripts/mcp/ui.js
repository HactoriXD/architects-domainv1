// MCP UI
    // ============================================
    function renderMcpPresetOptions() {
        el.mcpServerType.innerHTML = state.mcpRegistry.map(preset => (
            `<option value="${preset.type}">${escapeHtml(preset.label)}</option>`
        )).join('');
    }

    function renderMcpServers() {
        if (!el.mcpServerList) return;
        const servers = getWorkspaceMcpServers();
        if (!servers.length) {
            el.mcpServerList.innerHTML = '<div class="mcp-empty">No MCP servers configured.</div>';
            return;
        }
        el.mcpServerList.innerHTML = servers.map(server => {
            const preset = getMcpPreset(server.type);
            const tools = (server.capabilities || []).filter(capability => capability.kind === 'tool');
            const resources = server.resources || [];
            const capabilityHtml = tools.length
                ? tools.map(tool => `<span class="mcp-tool" title="${escapeHtml(tool.description || '')}">${escapeHtml(tool.name)}</span>`).join('')
                : `<span class="mcp-tool muted">${preset.requiresBridge ? 'Needs local bridge' : 'No tools listed'}</span>`;
            const resourceHtml = resources.length
                ? `<div class="mcp-resources">${resources.slice(0, 4).map(resource => `<span class="mcp-resource">${escapeHtml(resource.name || resource.uri)}</span>`).join('')}</div>`
                : '';
            return `
                <div class="mcp-server-card ${server.enabled ? '' : 'disabled'}" data-mcp-id="${server.id}">
                    <div class="mcp-server-header">
                        <div>
                            <strong>${escapeHtml(server.name)}</strong>
                            <div class="mcp-server-endpoint">${escapeHtml(server.endpoint)}</div>
                        </div>
                        <span class="mcp-status ${server.status}">${escapeHtml(server.status)}</span>
                    </div>
                    <div class="mcp-server-description">${escapeHtml(preset.description)}</div>
                    ${server.lastError ? `<div class="mcp-error">${escapeHtml(server.lastError)}</div>` : ''}
                    <div class="mcp-tools">${capabilityHtml}</div>
                    ${resourceHtml}
                    <div class="provider-actions">
                        <button class="btn" type="button" data-mcp-action="toggle">${server.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="btn" type="button" data-mcp-action="test">Test</button>
                        <button class="btn danger" type="button" data-mcp-action="remove">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function handleMcpServerAction(event) {
        const button = event.target.closest('[data-mcp-action]');
        if (!button) return;
        const id = button.closest('[data-mcp-id]')?.dataset.mcpId;
        if (!id) return;
        if (button.dataset.mcpAction === 'toggle') {
            const server = getWorkspaceMcpServers().find(item => item.id === id);
            updateMcpServer(id, { enabled: !server.enabled });
        }
        if (button.dataset.mcpAction === 'test') testMcpServer(id);
        if (button.dataset.mcpAction === 'remove') removeMcpServer(id);
    }

    function initMcpUi() {
        renderMcpPresetOptions();
        renderMcpServers();
        el.mcpServerType.addEventListener('change', () => {
            const preset = getMcpPreset(el.mcpServerType.value);
            if (!el.mcpServerName.value.trim()) el.mcpServerName.value = preset.defaultName;
            el.mcpServerEndpoint.value = preset.defaultEndpoint || '';
            if (el.mcpServerConfig) el.mcpServerConfig.value = JSON.stringify(preset.defaultConfig ? preset.defaultConfig() : {}, null, 2);
        });
        el.mcpAddServerBtn.addEventListener('click', addMcpServer);
        el.mcpServerList.addEventListener('click', handleMcpServerAction);
        const preset = getMcpPreset(el.mcpServerType.value);
        if (preset) {
            el.mcpServerEndpoint.value = preset.defaultEndpoint || '';
            if (el.mcpServerConfig) el.mcpServerConfig.value = JSON.stringify(preset.defaultConfig ? preset.defaultConfig() : {}, null, 2);
        }
        refreshMcpBridgeStatus();
        renderMcpExecutionCards();
    }
