// MCP Operations Center
// ============================================
const MCP_BUILT_IN_TYPES = new Set(['filesystem', 'browser', 'memory']);
const MCP_READ_ONLY_TYPES = new Set(['filesystem', 'git', 'markdown-vault', 'notes-vault']);
const MCP_NETWORK_TYPES = new Set(['browser', 'web-fetch', 'web-fetch-plus', 'github', 'custom']);
const MCP_SECRET_KEYS = /\b(token|api[_-]?key|authorization|password|secret|bearer)\b/i;

const MCP_STATUS_LABELS = {
    disconnected: 'Disconnected',
    connecting: 'Connecting',
    connected: 'Connected',
    error: 'Error',
    disabled: 'Disabled',
    needs_configuration: 'Needs config'
};

const MCP_ERROR_GUIDANCE = {
    CONNECTION_REFUSED: ['Bridge refused the connection.', 'The local bridge is not running or the port changed.', 'Start the app with npm start, then retry.'],
    BRIDGE_HTTP: ['The bridge returned an HTTP error.', 'The route may be unsupported for this server type or the bridge is offline.', 'Retry after checking the bridge status.'],
    INVALID_PATH: ['The path is not valid.', 'The folder may not exist or is outside the approved roots.', 'Add a specific existing folder and avoid drive roots.'],
    PATH_NOT_ALLOWED: ['The path is outside the allowlist.', 'Filesystem tools only work inside approved roots.', 'Add the folder to Allowed Paths, then retry.'],
    NO_ALLOWED_PATHS: ['Filesystem has no approved paths.', 'The server is intentionally locked until you approve a folder.', 'Add at least one narrow local path.'],
    INVALID_URL: ['The URL is invalid.', 'Only complete HTTP or HTTPS URLs can be tested.', 'Use a URL like https://example.com.'],
    MISSING_TOKEN: ['Credentials are missing.', 'This server type needs a local token for the selected scope.', 'Paste a token or reduce the scope to public/read-only.'],
    TIMEOUT: ['The request timed out.', 'The server or target site took too long to respond.', 'Retry or lower the scope of the request.'],
    UNSUPPORTED: ['This server type is not executable yet.', 'No compatible bridge adapter is available for this configuration.', 'Keep it saved, but leave it inactive until bridge support exists.']
};

function renderMcpPresetOptions() {
    if (!el.mcpServerType) return;
    el.mcpServerType.innerHTML = state.mcpRegistry.map(preset => (
        `<option value="${preset.type}">${escapeHtml(preset.label)}</option>`
    )).join('');
}

function renderMcpServers() {
    if (el.mcpServerList) el.mcpServerList.innerHTML = '';
    normalizeAllMcpServers();
    renderMcpControlCenter();
    renderMcpComposerIndicator();
}

function renderRecommendedMcpCards() {
    if (el.recommendedMcpSection) el.recommendedMcpSection.hidden = true;
}

function normalizeAllMcpServers() {
    state.mcpServers = (state.mcpServers || []).map(server => normalizeMcpServerForStorage(server));
}

function ensureBuiltInMcpServers() {
    for (const type of MCP_BUILT_IN_TYPES) {
        const existing = getWorkspaceMcpServers().find(server => server.type === type);
        if (existing) {
            existing.transport = 'mcp-system';
            existing.endpoint = location.protocol === 'file:' ? '' : `${location.origin}/mcp`;
            continue;
        }
        const preset = getMcpPreset(type);
        const server = createMcpServer({
            type,
            name: preset.defaultName,
            endpoint: preset.defaultEndpoint,
            config: {}
        });
        server.transport = 'mcp-system';
        server.enabled = false;
        server.statusState = 'disabled';
        state.mcpServers.push(normalizeMcpServerForStorage(server));
        syncWorkspaceForMcpServer(server);
    }
    saveMcpServers();
}

async function refreshMcpControlData() {
    if (!isMcpToolsEnabled()) {
        state.mcpControl.status = null;
        state.mcpControl.config = null;
        state.mcpControl.tools = [];
        state.mcpControl.log = [];
        updateMcpAvailabilityUi();
        return;
    }
    if (location.protocol === 'file:') {
        state.mcpControl.status = null;
        state.mcpControl.config = null;
        state.mcpControl.tools = [];
        state.mcpControl.log = [];
        return;
    }
    const [status, config, tools, log] = await Promise.allSettled([
        getMcpSystemStatus(),
        getMcpSystemConfig(),
        getMcpSystemTools({ includeInactive: true }),
        getMcpSystemLog()
    ]);
    state.mcpControl.status = status.status === 'fulfilled' ? status.value : null;
    state.mcpControl.config = config.status === 'fulfilled' ? config.value.config : null;
    state.mcpControl.tools = tools.status === 'fulfilled' ? (tools.value.tools || []) : [];
    state.mcpControl.log = log.status === 'fulfilled' ? (log.value.calls || []) : [];
    if (state.mcpControl.status && state.mcpControl.config) syncBuiltInStateFromBridge(state.mcpControl.status, state.mcpControl.config);
    ingestBridgeMcpLogs();
}

function syncBuiltInStateFromBridge(status, config) {
    const bridgeServers = new Map((status.servers || []).map(server => [server.type, server]));
    for (const server of getWorkspaceMcpServers().filter(item => MCP_BUILT_IN_TYPES.has(item.type))) {
        const bridgeServer = bridgeServers.get(server.type);
        const preset = getMcpPreset(server.type);
        server.transport = 'mcp-system';
        server.endpoint = location.protocol === 'file:' ? '' : `${location.origin}/mcp`;
        server.name = config?.[server.type]?.name || bridgeServer?.name || server.name || preset.defaultName;
        server.enabled = Boolean(config?.[server.type]?.active ?? server.enabled);
        server.status = bridgeServer?.status === 'unconfigured' ? 'untested' : (bridgeServer?.status === 'online' ? 'connected' : bridgeServer?.status || server.status);
        server.statusState = getServerStatusState(server, bridgeServer);
        server.health = { state: bridgeServer?.status || 'online', checkedAt: Date.now() };
        server.toolCount = Number(bridgeServer?.toolCount) || server.toolCount || 0;
        server.capabilities = getBridgeToolsForServer(server).map(tool => normalizeMcpTool(server, {
            ...tool,
            inputSchema: tool.inputSchema || { type: 'object', properties: tool.parameters || {} },
            safety: normalizeMcpRiskLevel(tool.safety)
        }));
        server.permissions = normalizeServerPermissions(server);
    }
    saveMcpServers();
}

function ingestBridgeMcpLogs() {
    const bridgeLog = state.mcpControl.log || [];
    for (const row of bridgeLog.slice(0, 25)) {
        const id = `bridge-${row.timestamp}-${row.server}-${row.tool}-${row.duration}`;
        if ((state.mcpLogs || []).some(item => item.id === id)) continue;
        const eventType = row.success ? 'execution' : 'error';
        state.mcpLogs.unshift({
            id,
            timestamp: Date.parse(row.timestamp) || Date.now(),
            eventType,
            serverId: row.server || '',
            serverName: row.server || '',
            toolName: row.tool || '',
            durationMs: row.duration || 0,
            success: Boolean(row.success),
            message: `${row.server || 'MCP'} / ${row.tool || 'request'} ${row.success ? 'completed' : 'failed'}`,
            details: row
        });
    }
    state.mcpLogs = state.mcpLogs.slice(0, 300);
}

async function openMcpControlCenter() {
    if (!isMcpToolsEnabled()) {
        showToast('MCP tools are disabled. Enable them in Settings → Experimental.', 'info');
        if (typeof openSettings === 'function') openSettings(false);
        return;
    }
    ensureBuiltInMcpServers();
    state.mcpControl.open = true;
    state.mcpControl.privacyMode = localStorage.getItem('architects_domain_mcp_privacy_mode') === 'true' || Boolean(state.mcpControl.privacyMode);
    state.mcpControl.demoMode = localStorage.getItem('architects_domain_mcp_demo_mode') === 'true' || Boolean(state.mcpControl.demoMode);
    el.mcpControlCenterModal.classList.add('open');
    el.mcpControlCenterModal.classList.toggle('privacy-active', state.mcpControl.privacyMode);
    el.mcpControlCenterModal.classList.toggle('demo-active', state.mcpControl.demoMode);
    await refreshMcpControlData().catch(error => {
        logMcpEvent({ eventType: 'error', success: false, message: 'MCP bridge refresh failed', details: normalizeMcpError(error) });
        showToast(error.message || 'MCP bridge offline', 'error');
    });
    const selected = getSelectedMcpServer() || getWorkspaceMcpServers()[0];
    if (selected) state.mcpControl.selectedId = selected.id;
    renderMcpControlCenter();
}

function closeMcpControlCenter() {
    state.mcpControl.open = false;
    el.mcpControlCenterModal.classList.remove('open');
}

function getSelectedMcpServer() {
    return getWorkspaceMcpServers().find(server => server.id === state.mcpControl.selectedId);
}

function getControlServers() {
    ensureBuiltInMcpServers();
    normalizeAllMcpServers();
    return getWorkspaceMcpServers().sort((a, b) => {
        const aBuilt = MCP_BUILT_IN_TYPES.has(a.type) ? 0 : 1;
        const bBuilt = MCP_BUILT_IN_TYPES.has(b.type) ? 0 : 1;
        if (aBuilt !== bBuilt) return aBuilt - bBuilt;
        return a.name.localeCompare(b.name);
    });
}

function getCurrentMcpChatState() {
    const chatId = state.currentChatId || 'draft';
    if (!state.mcpChatState[chatId]) {
        state.mcpChatState[chatId] = {
            chatId,
            activeServerIds: getWorkspaceMcpServers().filter(server => server.enabled).map(server => server.id),
            toolOverrides: {},
            seededFromWorkspaceDefaults: true,
            updatedAt: Date.now()
        };
    }
    return state.mcpChatState[chatId];
}

function isMcpServerActiveInCurrentChat(server) {
    return getCurrentMcpChatState().activeServerIds.includes(server.id);
}

async function setMcpServerActiveForCurrentChat(server, active) {
    const chatState = getCurrentMcpChatState();
    const ids = new Set(chatState.activeServerIds);
    active ? ids.add(server.id) : ids.delete(server.id);
    chatState.activeServerIds = [...ids];
    chatState.updatedAt = Date.now();
    server.enabled = Boolean(active);
    await saveMcpChatState(chatState.chatId);
    await saveMcpServers();
    await logMcpEvent({
        eventType: 'config',
        serverId: server.id,
        serverName: server.name,
        success: true,
        message: `${server.name} ${active ? 'activated' : 'deactivated'} in this chat`
    });
}

function renderMcpControlCenter() {
    if (!el.mcpControlServerList) return;
    const servers = getControlServers();
    const selected = getSelectedMcpServer() || servers[0];
    if (selected) state.mcpControl.selectedId = selected.id;
    renderMcpControlStats();
    renderMcpControlServerList(servers);
    renderMcpControlConfig(selected);
    renderMcpToolInspector(selected);
    renderMcpActivityFeed();
    renderMcpComposerIndicator();
    updateContextInspector();
}

function renderMcpControlStats() {
    const servers = getWorkspaceMcpServers();
    const activeTools = getActiveMcpTools();
    const allTools = servers.flatMap(server => getToolsForServer(server));
    const connected = servers.filter(server => getServerStatusState(server) === 'connected').length;
    const failed = servers.filter(server => getServerStatusState(server) === 'error').length;
    if (el.mcpTotalServers) el.mcpTotalServers.textContent = servers.length;
    if (el.mcpConnectedServers) el.mcpConnectedServers.textContent = connected;
    if (el.mcpTotalTools) el.mcpTotalTools.textContent = allTools.length;
    if (el.mcpActiveTools) el.mcpActiveTools.textContent = activeTools.length;
    if (el.mcpFailedServers) el.mcpFailedServers.textContent = failed;
}

function renderMcpControlServerList(servers) {
    el.mcpControlServerList.innerHTML = servers.length ? servers.map(server => {
        const selected = server.id === state.mcpControl.selectedId;
        const bridgeStatus = state.mcpControl.status?.servers?.find(item => item.type === server.type);
        const status = getServerStatusState(server, bridgeStatus);
        const toolCount = getToolsForServer(server).length || bridgeStatus?.toolCount || server.toolCount || 0;
        const error = server.lastError || bridgeStatus?.error || '';
        return `
            <button class="mcp-control-server ${selected ? 'active' : ''} ${status}" type="button" data-mcp-control-server="${server.id}" aria-label="${escapeHtml(server.name)} MCP server">
                <span class="mcp-server-icon" aria-hidden="true">${getServerTypeIcon(server.type)}</span>
                <span class="mcp-control-server-body">
                    <span class="mcp-card-title-row"><strong title="${escapeHtml(server.name)}">${maskMcpText(server.name)}</strong></span>
                    <span class="mcp-card-meta-row">
                        <span class="mcp-type-badge">${escapeHtml(getMcpPreset(server.type).label || server.type)}</span>
                        <span class="mcp-count-badge">${toolCount} tools</span>
                        <span class="mcp-status-badge ${status}"><span class="mcp-status-dot ${statusToDot(status)}"></span>${MCP_STATUS_LABELS[status] || status}</span>
                        <span class="mcp-active-chip ${server.enabled ? 'on' : ''}">${server.enabled ? 'workspace on' : 'workspace off'}</span>
                        <span class="mcp-active-chip ${isMcpServerActiveInCurrentChat(server) ? 'on' : ''}">${isMcpServerActiveInCurrentChat(server) ? 'chat on' : 'chat off'}</span>
                    </span>
                    <small>${formatRelativeTime(server.lastTestedAt || server.lastSeenAt || server.health?.checkedAt)}</small>
                    ${error ? `<span class="mcp-card-error">${escapeHtml(humanizeError(error).what)}</span>` : `<span class="mcp-card-result">${server.enabled ? 'Workspace enabled' : 'Inactive by default'}</span>`}
                </span>
            </button>
        `;
    }).join('') : '<div class="mcp-control-empty">No MCP servers in this workspace yet.</div>';
}

function renderMcpControlConfig(server) {
    if (!server) {
        el.mcpControlConfig.innerHTML = '<div class="mcp-control-empty">Select a server to tune its connection, permissions, and safety profile.</div>';
        return;
    }
    const preset = getMcpPreset(server.type);
    const validation = validateMcpServerDraft(server);
    server.configValidation = validation;
    const bridgeConfig = state.mcpControl.config?.[server.type] || {};
    const dynamic = renderMcpDynamicFields(server, bridgeConfig);
    const errorCard = validation.errors.length ? `
        <div class="mcp-validation-card">
            ${validation.errors.map(error => `<div>${escapeHtml(error)}</div>`).join('')}
        </div>
    ` : '';
    el.mcpControlConfig.innerHTML = `
        <div class="mcp-config-toolbar">
            <button class="btn" type="button" data-mcp-config-action="export">Export</button>
            <button class="btn" type="button" data-mcp-config-action="import">Import</button>
            <button class="btn" type="button" data-mcp-config-action="preview">Tool Context Preview</button>
            <button class="btn ${state.mcpControl.privacyMode ? 'btn-primary' : ''}" type="button" data-mcp-config-action="privacy">${state.mcpControl.privacyMode ? 'Privacy On' : 'Privacy Mode'}</button>
            <button class="btn ${state.mcpControl.demoMode ? 'btn-primary' : ''}" type="button" data-mcp-config-action="demo">${state.mcpControl.demoMode ? 'Demo On' : 'Demo Mode'}</button>
        </div>
        <label class="mcp-field"><span>Tool Calling Mode</span><select id="mcpToolCallingMode" data-mcp-tool-mode><option value="native" ${state.mcpControl.toolCallingMode === 'native' ? 'selected' : ''}>Native / function calling</option><option value="xml" ${state.mcpControl.toolCallingMode === 'xml' ? 'selected' : ''}>XML tool-call protocol</option><option value="json" ${state.mcpControl.toolCallingMode === 'json' ? 'selected' : ''}>JSON block protocol</option><option value="disabled" ${state.mcpControl.toolCallingMode === 'disabled' ? 'selected' : ''}>Disabled</option></select></label>
        ${renderMcpToolContextPreview(server)}
        <label class="mcp-field"><span>Server Name</span><input id="mcpEditName" value="${escapeHtml(server.name)}" autocomplete="off"></label>
        <label class="mcp-field"><span>Server Type</span><select id="mcpEditType">${state.mcpRegistry.map(item => `<option value="${item.type}" ${item.type === server.type ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label>
        <div class="mcp-config-note">${escapeHtml(preset.description || '')}</div>
        ${errorCard}
        ${dynamic}
        ${renderMcpSafetyPanel(server)}
        <div class="mcp-config-actions">
            <button class="btn" type="button" data-mcp-config-action="test">Test Connection</button>
            <button class="btn btn-primary" type="button" data-mcp-config-action="save" disabled title="${validation.valid ? 'No unsaved MCP changes' : 'Fix validation errors before saving'}">Save</button>
            <button class="btn danger" type="button" data-mcp-config-action="delete">Delete</button>
        </div>
    `;
}

function renderMcpDynamicFields(server, config) {
    if (server.type === 'filesystem') {
        const paths = config.allowedPaths || [];
        const readEnabled = config.readEnabled !== false;
        const writeEnabled = config.writeEnabled !== false;
        const confirmWrites = config.confirmWrites !== false;
        return `
            <div class="mcp-dynamic-panel">
                <div class="mcp-panel-heading">Filesystem Safety</div>
                <label class="mcp-switch"><input id="mcpFilesystemRead" type="checkbox" ${readEnabled ? 'checked' : ''}> <span>Read tools enabled</span></label>
                <label class="mcp-switch"><input id="mcpFilesystemWrite" type="checkbox" ${writeEnabled ? 'checked' : ''}> <span>Write tools enabled</span></label>
                <label class="mcp-switch"><input id="mcpFilesystemConfirm" type="checkbox" ${confirmWrites ? 'checked' : ''}> <span>Confirm every write</span></label>
                <label class="mcp-field"><span>Allowed Path</span><input id="mcpFilesystemPathInput" placeholder="C:\\Users\\USER\\Desktop\\architects-domain"></label>
                <button class="btn" type="button" data-mcp-config-action="add-path">Add Path</button>
                <div class="mcp-path-list">${paths.length ? paths.map(item => `<div class="mcp-path-item"><span title="${escapeHtml(item)}">${maskMcpText(item)}</span><button type="button" data-mcp-remove-path="${escapeHtml(item)}">Remove</button></div>`).join('') : '<div class="mcp-control-empty">No approved paths yet. Add a narrow project folder before activating filesystem tools.</div>'}</div>
            </div>
        `;
    }
    if (server.type === 'browser') {
        const session = state.mcpControl.status?.browser || {};
        return `
            <div class="mcp-dynamic-panel">
                <div class="mcp-panel-heading">Browser Runtime</div>
                <label class="mcp-field"><span>Target URL</span><input id="mcpBrowserTargetUrl" value="${escapeHtml(config.targetUrl || '')}" placeholder="https://example.com"></label>
                <label class="mcp-field"><span>Browser Mode</span><select id="mcpBrowserMode"><option value="headless" ${config.browserMode !== 'visible' ? 'selected' : ''}>Headless Chromium</option><option value="visible" ${config.browserMode === 'visible' ? 'selected' : ''}>Visible session</option></select></label>
                <label class="mcp-field"><span>Action Preset</span><select id="mcpBrowserPreset"><option value="navigate" ${config.actionPreset === 'navigate' ? 'selected' : ''}>Navigate</option><option value="extract" ${config.actionPreset === 'extract' ? 'selected' : ''}>Extract Text</option><option value="screenshot" ${config.actionPreset === 'screenshot' ? 'selected' : ''}>Screenshot</option></select></label>
                <label class="mcp-switch"><input id="mcpBrowserScreenshots" type="checkbox" ${config.screenshotsEnabled !== false ? 'checked' : ''}> <span>Screenshots enabled</span></label>
                <label class="mcp-switch"><input id="mcpBrowserNetwork" type="checkbox" ${config.networkAccess !== false ? 'checked' : ''}> <span>Network access enabled</span></label>
                <div class="mcp-session-card ${session.open ? 'active' : ''}"><strong>${session.open ? 'Browser Active' : 'Browser Closed'}</strong><span>${maskMcpText(session.currentUrl || 'No active page')}</span></div>
                <button class="btn" type="button" data-mcp-config-action="reset-browser">Reset Browser Session</button>
            </div>
        `;
    }
    if (server.type === 'memory') {
        const memory = state.mcpControl.status?.servers?.find(item => item.type === 'memory')?.memory || {};
        return `
            <div class="mcp-dynamic-panel">
                <div class="mcp-panel-heading">Memory Store</div>
                <label class="mcp-field"><span>Namespace</span><input id="mcpMemoryNamespace" value="${escapeHtml(config.namespace || state.activeWorkspaceId || 'default')}" placeholder="workspace or project namespace"></label>
                <label class="mcp-switch"><input id="mcpMemoryPersistence" type="checkbox" ${config.persistence !== false ? 'checked' : ''}> <span>Persist memories locally</span></label>
                <div class="mcp-memory-stats"><span><strong>${memory.count || 0}</strong> memories</span><span>${escapeHtml(memory.lastAccessedAt || 'Never accessed')}</span></div>
                <div class="provider-actions">
                    <button class="btn" type="button" data-mcp-config-action="view-memories">View Memories</button>
                    <button class="btn danger" type="button" data-mcp-config-action="clear-memory">Clear All</button>
                </div>
            </div>
        `;
    }
    if (server.type === 'github') {
        return renderConfigPanel([
            field('GitHub Token', 'mcpGithubToken', server.config.token ? 'Stored locally' : '', 'password', 'Optional for private repos'),
            field('Repository Scope', 'mcpGithubRepo', server.config.repo || '', 'text', 'owner/repo or organization scope'),
            selectField('Permissions', 'mcpGithubPermissions', server.config.permissions || 'read', [['read', 'Read-only'], ['issues', 'Issues + metadata'], ['write', 'Write-capable']])
        ], 'GitHub access stays local. Tokens are masked in Privacy Mode.');
    }
    if (server.type === 'markdown-vault' || server.type === 'notes-vault') {
        return renderConfigPanel([
            field('Vault Path', 'mcpVaultPath', server.config.root || server.config.vaultPath || '', 'text', 'Local markdown folder'),
            selectField('Read / Write Mode', 'mcpVaultMode', server.config.mode || 'read', [['read', 'Read-only'], ['write', 'Read/write with approval']])
        ], 'Vault writes require approval unless explicitly disabled at tool level.');
    }
    if (server.type === 'git') {
        return renderConfigPanel([
            field('Repository Path', 'mcpGitRoot', server.config.root || '', 'text', 'Local git repository'),
            selectField('Branch Safety', 'mcpGitBranchSafety', server.config.branchSafety || 'current', [['current', 'Current branch only'], ['protected', 'Protect main/master'], ['any', 'Any branch']]),
            selectField('Destructive Protection', 'mcpGitDestructive', server.config.destructiveProtection || 'confirm', [['confirm', 'Require confirmation'], ['disabled', 'Disable destructive tools']])
        ], 'Git destructive commands are approval-gated and can be disabled entirely.');
    }
    if (server.type === 'web-fetch' || server.type === 'web-fetch-plus') {
        return renderConfigPanel([
            field('Allowed Domains', 'mcpWebAllowed', (server.config.allowedDomains || []).join(', '), 'text', 'Comma-separated, blank allows public HTTP/HTTPS'),
            field('Blocked Domains', 'mcpWebBlocked', (server.config.blockedDomains || []).join(', '), 'text', 'Comma-separated denylist'),
            field('Timeout', 'mcpWebTimeout', server.config.timeout || '15000', 'number', 'Milliseconds')
        ], 'Network calls are marked external and approval-gated by default.');
    }
    return renderConfigPanel([
        field('Base URL', 'mcpEditEndpoint', server.endpoint || '', 'url', 'http://localhost:7331/mcp'),
        selectField('Auth Type', 'mcpCustomAuthType', server.config.authType || 'none', [['none', 'None'], ['bearer', 'Bearer token'], ['headers', 'Custom headers']]),
        field('Health Endpoint', 'mcpCustomHealth', server.config.healthEndpoint || '', 'text', '/health'),
        textareaField('Headers JSON', 'mcpEditConfig', JSON.stringify(server.config.headers || server.config || {}, null, 2), 'Local only; invalid JSON blocks save')
    ], 'Custom servers must expose a compatible MCP HTTP surface.');
}

function field(label, id, value, type = 'text', hint = '') {
    return `<label class="mcp-field"><span>${escapeHtml(label)}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(hint)}"></label>`;
}

function selectField(label, id, value, options) {
    return `<label class="mcp-field"><span>${escapeHtml(label)}</span><select id="${id}">${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`).join('')}</select></label>`;
}

function textareaField(label, id, value, hint = '') {
    return `<label class="mcp-field"><span>${escapeHtml(label)}</span><textarea id="${id}" rows="7" placeholder="${escapeHtml(hint)}">${escapeHtml(value)}</textarea></label>`;
}

function renderConfigPanel(fields, note) {
    return `<div class="mcp-dynamic-panel"><div class="mcp-panel-heading">Connection</div>${fields.join('')}<div class="mcp-config-note">${escapeHtml(note)}</div></div>`;
}

function renderMcpSafetyPanel(server) {
    const summary = getPermissionSummary(server);
    return `
        <div class="mcp-safety-panel">
            <div class="mcp-panel-heading">Safety & Privacy</div>
            <div class="mcp-safety-copy">Local-first. Secrets stay in this browser or bridge-owned local files. Filesystem paths, logs, screenshots, and private chat titles may expose sensitive data unless Privacy Mode is active.</div>
            ${state.mcpControl.privacyMode ? '<div class="mcp-privacy-banner">Privacy Mode is active. Sensitive metadata is masked in the Operations Center.</div>' : ''}
            ${state.mcpControl.demoMode ? '<div class="mcp-privacy-banner demo">Demo Mode is active. Labels and paths are replaced with presentation-safe names.</div>' : ''}
            <div class="mcp-permission-summary">
                <span>${summary.read} read</span>
                <span>${summary.write} write</span>
                <span>${summary.external} external</span>
                <span>${summary.destructive} destructive</span>
                <span>${summary.approval} approvals</span>
            </div>
        </div>
    `;
}

function renderMcpToolContextPreview(server = null) {
    if (!state.mcpControl.toolContextPreviewOpen) return '';
    const preview = buildMcpToolContextPreview(server);
    return `
        <div class="mcp-context-preview">
            <div class="mcp-panel-heading">Tool Context Preview</div>
            <div class="mcp-preview-stats">
                <span>${preview.activeServers.length} active servers</span>
                <span>${preview.enabledTools.length} enabled tools</span>
                <span>${preview.excludedTools.length} excluded</span>
                <span>~${preview.estimatedTokens} tokens</span>
            </div>
            <div class="mcp-config-note">${escapeHtml(preview.modeCopy)}</div>
            <details open>
                <summary>Injected tools</summary>
                ${preview.enabledTools.length ? preview.enabledTools.map(tool => `<div class="mcp-preview-tool"><strong>${escapeHtml(tool.name)}</strong><span>${maskMcpText(tool.serverName)} · ${escapeHtml(tool.risk)} · ${tool.requiresApproval ? 'approval required' : 'no approval'}</span><small>${escapeHtml(tool.description || 'No description')}</small><code>${escapeHtml(tool.schemaSummary)}</code></div>`).join('') : '<div class="mcp-control-empty">No tools will be injected into this chat.</div>'}
            </details>
            <details>
                <summary>Excluded tools</summary>
                ${preview.excludedTools.length ? preview.excludedTools.map(tool => `<div class="mcp-preview-tool excluded"><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(tool.reason)}</span></div>`).join('') : '<div class="mcp-control-empty">Nothing excluded. Every active enabled tool is available.</div>'}
            </details>
            <pre>${escapeHtml(preview.protocol)}</pre>
        </div>
    `;
}

function renderMcpToolInspector(server) {
    if (!server) {
        el.mcpToolInspector.innerHTML = '<div class="mcp-control-empty">Select a server to inspect tools, permissions, and risk.</div>';
        return;
    }
    const tools = getToolsForServer(server);
    const active = isMcpServerActiveInCurrentChat(server);
    const summary = getPermissionSummary(server);
    const unavailable = !tools.length && !canDiscoverToolsForServer(server)
        ? '<div class="mcp-control-empty">Tool discovery requires bridge support for this server type. The server can be saved, but it cannot be activated until tools are discoverable.</div>'
        : '';
    const toggle = `
        <label class="mcp-active-toggle">
            <span><strong>Active in Chat</strong><small>${active ? 'Injected into the current conversation' : 'Not available to the assistant'}</small></span>
            <input type="checkbox" data-mcp-active-toggle ${active ? 'checked' : ''}>
        </label>
    `;
    const permission = `
        <div class="mcp-permission-box">
            <div class="mcp-panel-heading">Permission Summary</div>
            <div class="mcp-permission-summary">
                <span>${summary.read} read</span>
                <span>${summary.write} write</span>
                <span>${summary.external} external</span>
                <span>${summary.destructive} destructive</span>
                <span>${summary.approval} approval</span>
            </div>
        </div>
    `;
    el.mcpToolInspector.innerHTML = `${toggle}${permission}${tools.length ? tools.map(tool => renderMcpToolCard(server, tool)).join('') : (unavailable || '<div class="mcp-control-empty">No tools exposed yet. Test the server connection to discover capabilities.</div>')}`;
}

function getToolsForServer(server) {
    const live = getBridgeToolsForServer(server);
    const source = live.length ? live : (server.capabilities || []).filter(item => item.kind === 'tool').map(tool => ({
        name: tool.name,
        description: tool.description,
        safety: tool.safety,
        parameters: tool.inputSchema?.properties || {},
        inputSchema: tool.inputSchema,
        server: server.type
    }));
    return source.map(tool => {
        const riskLevel = normalizeMcpRiskLevel(tool.safety || inferMcpToolSafety(tool.name, tool.description));
        const permission = getToolPermission(server, tool.name, riskLevel);
        return { ...tool, safety: riskLevel, riskLevel, permission };
    });
}

function getBridgeToolsForServer(server) {
    return (state.mcpControl.tools || []).filter(tool => tool.server === server.type);
}

function renderMcpToolCard(server, tool) {
    const params = Object.entries(tool.parameters || tool.inputSchema?.properties || {});
    const permission = tool.permission || getToolPermission(server, tool.name, tool.riskLevel);
    const exampleArgs = JSON.stringify(buildMcpExampleArgs(tool), null, 2);
    return `
        <div class="mcp-tool-card ${permission.enabled ? '' : 'disabled'}" data-mcp-tool="${escapeHtml(tool.name)}">
            <div class="mcp-tool-card-top">
                <strong>${escapeHtml(tool.name)}</strong>
                <span class="mcp-risk-badge ${tool.riskLevel}">${escapeHtml(tool.riskLevel)}</span>
            </div>
            <p>${escapeHtml(tool.description || 'No description provided by this server.')}</p>
            <div class="mcp-param-list">${params.length ? params.map(([name, schema]) => `<span>${escapeHtml(name)} <em>${escapeHtml(schema.type || 'any')}</em></span>`).join('') : '<span>No parameters</span>'}</div>
            <div class="mcp-tool-meta">
                <span>Last used: ${formatRelativeTime(permission.lastUsedAt)}</span>
                <span>${permission.errorCount || 0} errors</span>
            </div>
            <div class="mcp-tool-permissions">
                <label class="mcp-switch"><input type="checkbox" data-mcp-tool-enabled="${escapeHtml(tool.name)}" ${permission.enabled ? 'checked' : ''}> <span>Enabled</span></label>
                <label class="mcp-switch"><input type="checkbox" data-mcp-tool-approval="${escapeHtml(tool.name)}" ${permission.requiresApproval ? 'checked' : ''}> <span>Require approval</span></label>
            </div>
            <button class="btn" type="button" data-mcp-test-tool="${escapeHtml(tool.name)}" ${permission.enabled ? '' : 'disabled title="Enable this tool before testing"'}>Test Tool</button>
            <div class="mcp-tool-test" hidden>
                <div class="mcp-config-note">${tool.riskLevel === 'external' ? 'This test may access the network.' : tool.riskLevel === 'destructive' || tool.riskLevel === 'write' ? 'This test may modify local data and requires approval.' : 'Read-only test. Review arguments before running.'}</div>
                <textarea rows="5" spellcheck="false">${escapeHtml(exampleArgs)}</textarea>
                <div class="provider-actions"><button class="btn btn-primary" type="button" data-mcp-run-tool="${escapeHtml(tool.name)}">Run</button></div>
                <pre></pre>
            </div>
        </div>
    `;
}

function buildMcpExampleArgs(tool = {}) {
    const args = {};
    const props = tool.parameters || tool.inputSchema?.properties || {};
    for (const [name, schema] of Object.entries(props)) {
        if (schema.default !== undefined) args[name] = schema.default;
        else if (schema.enum?.length) args[name] = schema.enum[0];
        else if (name.toLowerCase().includes('url')) args[name] = 'https://example.com';
        else if (name.toLowerCase().includes('path')) args[name] = '.';
        else if (name.toLowerCase().includes('query')) args[name] = 'architect';
        else if (schema.type === 'boolean') args[name] = false;
        else if (schema.type === 'number') args[name] = 1;
        else if (schema.type === 'array') args[name] = [];
        else if (schema.type === 'object') args[name] = {};
        else args[name] = '';
    }
    return args;
}

function renderMcpActivityFeed() {
    const servers = getWorkspaceMcpServers();
    const filterServer = state.mcpControl.logFilterServer || 'all';
    const filterType = state.mcpControl.logFilterType || 'all';
    const query = (state.mcpControl.logSearch || '').toLowerCase();
    const logs = (state.mcpLogs || []).filter(item => {
        const matchesServer = filterServer === 'all' || item.serverId === filterServer || item.serverName === filterServer;
        const matchesType = filterType === 'all' || item.eventType === filterType;
        const haystack = `${item.message} ${item.serverName} ${item.toolName} ${JSON.stringify(item.details || {})}`.toLowerCase();
        return matchesServer && matchesType && (!query || haystack.includes(query));
    });
    el.mcpActivityFeed.innerHTML = `
        <div class="mcp-log-toolbar">
            <select data-mcp-log-filter="server">
                <option value="all">All servers</option>
                ${servers.map(server => `<option value="${server.id}" ${filterServer === server.id ? 'selected' : ''}>${maskMcpText(server.name)}</option>`).join('')}
            </select>
            <select data-mcp-log-filter="type">
                ${['all', 'config', 'status', 'tools', 'execution', 'error'].map(type => `<option value="${type}" ${filterType === type ? 'selected' : ''}>${type}</option>`).join('')}
            </select>
            <input data-mcp-log-search value="${escapeHtml(state.mcpControl.logSearch || '')}" placeholder="Search logs">
            <button class="btn" type="button" data-mcp-log-action="export">Export</button>
            <button class="btn danger" type="button" data-mcp-log-action="clear">Clear</button>
        </div>
        <div class="mcp-log-list">
            ${logs.length ? logs.slice(0, 80).map(renderMcpLogRow).join('') : '<div class="mcp-control-empty">No matching MCP activity yet. Connection tests, permission edits, and tool executions will appear here.</div>'}
        </div>
    `;
}

function renderMcpLogRow(item) {
    const details = item.details ? JSON.stringify(item.details, null, 2) : '';
    return `
        <details class="mcp-activity-item ${item.success ? 'success' : 'failed'}">
            <summary>
                <span>${escapeHtml(new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>
                <strong>${escapeHtml(item.eventType)} · ${maskMcpText(item.message || item.toolName || 'MCP event')}</strong>
                <small>${item.durationMs || 0}ms</small>
            </summary>
            ${details ? `<pre>${maskMcpText(details)}</pre>` : '<p>No technical details recorded.</p>'}
            ${!item.success && item.serverId ? `<button class="btn" type="button" data-mcp-log-action="retry" data-mcp-log-server="${escapeHtml(item.serverId)}">Retry</button>` : ''}
        </details>
    `;
}

async function handleMcpControlServerClick(event) {
    const button = event.target.closest('[data-mcp-control-server]');
    if (!button) return;
    state.mcpControl.selectedId = button.dataset.mcpControlServer;
    renderMcpControlCenter();
}

async function handleMcpConfigInput(event) {
    const server = getSelectedMcpServer();
    if (!server) return;
    if (event?.target?.matches?.('[data-mcp-tool-mode]')) {
        state.mcpControl.toolCallingMode = event.target.value;
        saveSettings();
        renderMcpControlCenter();
        return;
    }
    if (event?.target?.id === 'mcpEditType') {
        const draft = structuredClone(server);
        draft.type = event.target.value || server.type;
        draft.config = getMcpPreset(draft.type).defaultConfig ? getMcpPreset(draft.type).defaultConfig() : {};
        renderMcpControlConfig(draft);
        return;
    }
    const draft = readMcpConfigForm(server);
    const validation = validateMcpServerDraft(draft);
    const saveButton = el.mcpControlConfig.querySelector('[data-mcp-config-action="save"]');
    if (saveButton) {
        saveButton.disabled = !validation.valid || !hasMcpConfigChanged(server, draft);
        saveButton.title = validation.valid ? '' : 'Fix validation errors before saving';
    }
}

async function handleMcpConfigAction(event) {
    const server = getSelectedMcpServer();
    if (!server) return;
    const remove = event.target.closest('[data-mcp-remove-path]');
    if (remove) return removeFilesystemPath(remove.dataset.mcpRemovePath);
    const action = event.target.closest('[data-mcp-config-action]')?.dataset.mcpConfigAction;
    if (!action) return;
    if (action === 'add-path') return addFilesystemPath();
    if (action === 'save') return saveMcpConfigForm();
    if (action === 'test') return testSelectedMcpServer();
    if (action === 'delete') return deleteSelectedMcpServer();
    if (action === 'reset-browser') return resetMcpBrowserSession();
    if (action === 'view-memories') return openMcpMemoryView();
    if (action === 'clear-memory') return clearMcpMemories();
    if (action === 'privacy') return toggleMcpPrivacyMode();
    if (action === 'demo') return toggleMcpDemoMode();
    if (action === 'preview') return toggleMcpToolContextPreview();
    if (action === 'export') return exportMcpConfig();
    if (action === 'import') return el.mcpImportInput?.click();
}

async function getCurrentMcpConfigDraft() {
    return structuredClone(state.mcpControl.config || (await getMcpSystemConfig()).config || {});
}

async function addFilesystemPath() {
    const value = document.getElementById('mcpFilesystemPathInput')?.value.trim();
    if (!value) return showToast('Add a folder path first', 'error');
    if (isUnsafePath(value)) return showToast('Use a specific folder, not a drive root or system root', 'error');
    const config = await getCurrentMcpConfigDraft();
    config.filesystem.allowedPaths = [...new Set([...(config.filesystem?.allowedPaths || []), value])];
    await saveMcpSystemConfig(config);
    await logMcpEvent({ eventType: 'config', serverId: getSelectedMcpServer()?.id, serverName: getSelectedMcpServer()?.name, success: true, message: 'Filesystem path allowed', details: { path: value } });
    await refreshMcpControlData();
    renderMcpControlCenter();
}

async function removeFilesystemPath(value) {
    const config = await getCurrentMcpConfigDraft();
    config.filesystem.allowedPaths = (config.filesystem?.allowedPaths || []).filter(item => item !== value);
    await saveMcpSystemConfig(config);
    await logMcpEvent({ eventType: 'config', serverId: getSelectedMcpServer()?.id, serverName: getSelectedMcpServer()?.name, success: true, message: 'Filesystem path removed', details: { path: value } });
    await refreshMcpControlData();
    renderMcpControlCenter();
}

async function saveMcpConfigForm() {
    const server = getSelectedMcpServer();
    if (!server) return;
    const draft = readMcpConfigForm(server);
    const validation = validateMcpServerDraft(draft);
    if (!validation.valid) {
        server.configValidation = validation;
        renderMcpControlCenter();
        return showToast('Fix MCP validation errors before saving', 'error');
    }
    Object.assign(server, draft, { updatedAt: Date.now(), configValidation: validation });
    if (MCP_BUILT_IN_TYPES.has(server.type)) {
        const config = await getCurrentMcpConfigDraft();
        config[server.type] = {
            ...(config[server.type] || {}),
            ...buildBuiltInConfigFromForm(server),
            name: server.name,
            active: Boolean(server.enabled),
            toolPermissions: server.permissions.toolPermissions
        };
        await saveMcpSystemConfig(config);
    }
    normalizeAllMcpServers();
    await saveMcpServers();
    await logMcpEvent({ eventType: 'config', serverId: server.id, serverName: server.name, success: true, message: `${server.name} updated`, details: sanitizeMcpConfigForExport(server, false) });
    await refreshMcpControlData().catch(() => {});
    renderMcpControlCenter();
    showToast('MCP server saved', 'success');
}

function readMcpConfigForm(server) {
    const name = document.getElementById('mcpEditName')?.value.trim() || server.name;
    const type = document.getElementById('mcpEditType')?.value || server.type;
    const next = structuredClone(server);
    next.name = name;
    if (type !== server.type && !MCP_BUILT_IN_TYPES.has(server.type)) next.type = type;
    if (next.type === 'browser') {
        next.config = {
            ...next.config,
            targetUrl: document.getElementById('mcpBrowserTargetUrl')?.value.trim() || '',
            actionPreset: document.getElementById('mcpBrowserPreset')?.value || 'navigate',
            browserMode: document.getElementById('mcpBrowserMode')?.value || 'headless',
            screenshotsEnabled: document.getElementById('mcpBrowserScreenshots')?.checked !== false,
            networkAccess: document.getElementById('mcpBrowserNetwork')?.checked !== false
        };
    } else if (next.type === 'filesystem') {
        next.config = {
            ...next.config,
            readEnabled: document.getElementById('mcpFilesystemRead')?.checked !== false,
            writeEnabled: document.getElementById('mcpFilesystemWrite')?.checked !== false,
            confirmWrites: document.getElementById('mcpFilesystemConfirm')?.checked !== false
        };
        next.permissions.readOnly = !next.config.writeEnabled;
    } else if (next.type === 'memory') {
        next.config = {
            ...next.config,
            namespace: document.getElementById('mcpMemoryNamespace')?.value.trim() || state.activeWorkspaceId || 'default',
            persistence: document.getElementById('mcpMemoryPersistence')?.checked !== false
        };
    } else if (next.type === 'github') {
        next.config = { ...next.config, token: document.getElementById('mcpGithubToken')?.value || next.config.token || '', repo: document.getElementById('mcpGithubRepo')?.value.trim() || '', permissions: document.getElementById('mcpGithubPermissions')?.value || 'read' };
    } else if (next.type === 'git') {
        next.config = { ...next.config, root: document.getElementById('mcpGitRoot')?.value.trim() || '', branchSafety: document.getElementById('mcpGitBranchSafety')?.value || 'current', destructiveProtection: document.getElementById('mcpGitDestructive')?.value || 'confirm' };
    } else if (next.type === 'markdown-vault' || next.type === 'notes-vault') {
        next.config = { ...next.config, root: document.getElementById('mcpVaultPath')?.value.trim() || '', mode: document.getElementById('mcpVaultMode')?.value || 'read' };
        next.permissions.readOnly = next.config.mode === 'read';
    } else if (next.type === 'web-fetch' || next.type === 'web-fetch-plus') {
        next.config = { ...next.config, allowedDomains: splitCsv(document.getElementById('mcpWebAllowed')?.value), blockedDomains: splitCsv(document.getElementById('mcpWebBlocked')?.value), timeout: Number(document.getElementById('mcpWebTimeout')?.value) || 15000 };
    } else {
        next.endpoint = document.getElementById('mcpEditEndpoint')?.value.trim() || '';
        next.config = {
            ...next.config,
            authType: document.getElementById('mcpCustomAuthType')?.value || 'none',
            healthEndpoint: document.getElementById('mcpCustomHealth')?.value.trim() || ''
        };
        const raw = document.getElementById('mcpEditConfig')?.value.trim();
        if (raw) next.config.headers = JSON.parse(raw);
    }
    return normalizeMcpServerForStorage(next);
}

function buildBuiltInConfigFromForm(server) {
    if (server.type === 'filesystem') return {
        readEnabled: server.config.readEnabled !== false,
        writeEnabled: server.config.writeEnabled !== false,
        confirmWrites: server.config.confirmWrites !== false
    };
    if (server.type === 'browser') return {
        targetUrl: server.config.targetUrl || '',
        actionPreset: server.config.actionPreset || 'navigate',
        browserMode: server.config.browserMode || 'headless',
        screenshotsEnabled: server.config.screenshotsEnabled !== false,
        networkAccess: server.config.networkAccess !== false
    };
    if (server.type === 'memory') return {
        namespace: server.config.namespace || state.activeWorkspaceId || 'default',
        persistence: server.config.persistence !== false
    };
    return {};
}

function validateMcpServerDraft(server) {
    const errors = [];
    if (!String(server.name || '').trim()) errors.push('Server name is required.');
    const duplicate = getWorkspaceMcpServers().find(item => item.id !== server.id && item.name.trim().toLowerCase() === server.name.trim().toLowerCase());
    if (duplicate) errors.push('Server name must be unique in this workspace.');
    if (server.type === 'custom' && !isValidHttpUrl(server.endpoint)) errors.push('Custom HTTP MCP needs a valid HTTP or HTTPS base URL.');
    if (server.type === 'browser' && server.config.targetUrl && !isValidHttpUrl(server.config.targetUrl)) errors.push('Browser target URL must be HTTP or HTTPS.');
    if (server.type === 'filesystem') {
        const paths = state.mcpControl.config?.filesystem?.allowedPaths || [];
        if (paths.some(isUnsafePath)) errors.push('Filesystem allowed paths must be specific folders, not drive or system roots.');
    }
    if ((server.type === 'git' || server.type === 'markdown-vault' || server.type === 'notes-vault') && isUnsafePath(server.config.root || '')) errors.push('Local paths must point to a specific project or vault folder.');
    if (server.type === 'custom') {
        try {
            const raw = document.getElementById('mcpEditConfig')?.value.trim();
            if (raw) JSON.parse(raw);
        } catch (error) {
            errors.push('Custom headers JSON is invalid.');
        }
    }
    if (server.type === 'github' && server.config.permissions !== 'read' && !server.config.token) errors.push('GitHub write or private scopes require a token.');
    return { valid: errors.length === 0, errors };
}

function hasMcpConfigChanged(server, draft) {
    return JSON.stringify(sanitizeMcpConfigForExport(server, true)) !== JSON.stringify(sanitizeMcpConfigForExport(draft, true));
}

async function testSelectedMcpServer() {
    const server = getSelectedMcpServer();
    if (!server) return;
    const startedAt = Date.now();
    server.status = 'testing';
    server.statusState = 'connecting';
    renderMcpControlCenter();
    await logMcpEvent({ eventType: 'status', serverId: server.id, serverName: server.name, success: true, message: `${server.name} test started` });
    try {
        await testMcpServer(server.id);
        const fresh = getWorkspaceMcpServers().find(item => item.id === server.id) || server;
        fresh.lastTestedAt = Date.now();
        fresh.lastTestDurationMs = Date.now() - startedAt;
        fresh.statusState = fresh.status === 'connected' ? 'connected' : getServerStatusState(fresh);
        fresh.permissions = normalizeServerPermissions(fresh);
        await logMcpEvent({ eventType: 'tools', serverId: fresh.id, serverName: fresh.name, durationMs: fresh.lastTestDurationMs, success: fresh.status === 'connected', message: fresh.status === 'connected' ? `${fresh.name} discovered ${getToolsForServer(fresh).length} tools` : `${fresh.name} test failed`, details: { status: fresh.status, error: fresh.lastError } });
        if (MCP_BUILT_IN_TYPES.has(fresh.type)) await refreshMcpControlData().catch(() => {});
        await saveMcpServers();
    } catch (error) {
        server.status = 'error';
        server.statusState = 'error';
        server.lastError = error.message || 'Connection failed';
        server.lastTestedAt = Date.now();
        server.lastTestDurationMs = Date.now() - startedAt;
        await logMcpEvent({ eventType: 'error', serverId: server.id, serverName: server.name, durationMs: server.lastTestDurationMs, success: false, message: `${server.name} test failed`, details: normalizeMcpError(error) });
    }
    renderMcpControlCenter();
}

async function deleteSelectedMcpServer() {
    const server = getSelectedMcpServer();
    if (!server) return;
    if (!confirm(`Delete ${server.name}? This removes the server from this workspace. Built-in servers will be disabled instead of erased.`)) return;
    if (MCP_BUILT_IN_TYPES.has(server.type)) {
        server.enabled = false;
        server.status = 'untested';
        server.statusState = 'disabled';
        await setMcpServerActiveForCurrentChat(server, false);
        await saveMcpConfigForm();
        showToast('Built-in server disabled', 'info');
        return;
    }
    removeMcpServer(server.id);
    await logMcpEvent({ eventType: 'config', serverId: server.id, serverName: server.name, success: true, message: `${server.name} deleted` });
    state.mcpControl.selectedId = getWorkspaceMcpServers()[0]?.id || '';
    renderMcpControlCenter();
}

async function resetMcpBrowserSession() {
    await mcpSystemRequest('/browser/session/reset', { method: 'POST', body: {} });
    await logMcpEvent({ eventType: 'status', serverId: getSelectedMcpServer()?.id, serverName: getSelectedMcpServer()?.name, success: true, message: 'Browser session reset' });
    await refreshMcpControlData();
    renderMcpControlCenter();
    showToast('Browser session reset', 'success');
}

function openMcpMemoryView() {
    closeMcpControlCenter();
    el.memoryModal.classList.add('open');
    renderMemoryManager();
}

async function clearMcpMemories() {
    if (!confirm('Clear all MCP memories for this workspace?')) return;
    await callMcpSystemTool('memory', 'memory_clear_workspace', { workspace: state.activeWorkspaceId || 'default' });
    await logMcpEvent({ eventType: 'execution', serverId: getSelectedMcpServer()?.id, serverName: getSelectedMcpServer()?.name, toolName: 'memory_clear_workspace', success: true, message: 'MCP memories cleared' });
    await refreshMcpControlData();
    renderMcpControlCenter();
}

async function handleMcpToolInspectorClick(event) {
    const activeToggle = event.target.closest('[data-mcp-active-toggle]');
    if (activeToggle) return toggleSelectedMcpActive(activeToggle.checked);
    const enabledToggle = event.target.closest('[data-mcp-tool-enabled]');
    if (enabledToggle) return updateSelectedToolPermission(enabledToggle.dataset.mcpToolEnabled, { enabled: enabledToggle.checked });
    const approvalToggle = event.target.closest('[data-mcp-tool-approval]');
    if (approvalToggle) return updateSelectedToolPermission(approvalToggle.dataset.mcpToolApproval, { requiresApproval: approvalToggle.checked });
    const testButton = event.target.closest('[data-mcp-test-tool]');
    if (testButton) {
        const panel = testButton.closest('.mcp-tool-card').querySelector('.mcp-tool-test');
        panel.hidden = !panel.hidden;
        return;
    }
    const runButton = event.target.closest('[data-mcp-run-tool]');
    if (!runButton) return;
    const card = runButton.closest('.mcp-tool-card');
    const output = card.querySelector('pre');
    let args = {};
    try {
        args = JSON.parse(card.querySelector('textarea').value || '{}');
    } catch (error) {
        output.textContent = 'Invalid JSON input';
        return;
    }
    const server = getSelectedMcpServer();
    const toolName = runButton.dataset.mcpRunTool;
    try {
        const startedAt = Date.now();
        const toolMeta = getToolsForServer(server).find(item => item.name === toolName);
        if (!toolMeta || toolMeta.permission?.enabled === false || !isMcpToolEnabledForChat(server, toolMeta)) {
            output.textContent = 'Tool is disabled or unavailable in this chat.';
            return;
        }
        if (toolMeta?.permission?.requiresApproval && !(await requestMcpToolApproval({ ...toolMeta, serverId: server.id, serverName: server.name }, args))) {
            output.textContent = 'Tool test denied by user.';
            return;
        }
        await logMcpEvent({ eventType: 'execution', serverId: server.id, serverName: server.name, toolName, success: true, message: `${toolName} test started` });
        const result = MCP_BUILT_IN_TYPES.has(server.type)
            ? await callMcpSystemTool(server.type, toolName, args)
            : { result: await mcpRuntimeCallTool(server, toolName, args) };
        output.textContent = JSON.stringify(result.result ?? result, null, 2);
        markToolUsage(server, toolName, true);
        await logMcpEvent({ eventType: 'execution', serverId: server.id, serverName: server.name, toolName, durationMs: Date.now() - startedAt, success: true, message: `${toolName} succeeded`, details: result });
        await refreshMcpControlData().catch(() => {});
        renderMcpControlCenter();
    } catch (error) {
        output.textContent = humanizeError(error).what;
        markToolUsage(server, toolName, false);
        await logMcpEvent({ eventType: 'error', serverId: server.id, serverName: server.name, toolName, success: false, message: `${toolName} failed`, details: normalizeMcpError(error) });
        renderMcpControlCenter();
    }
}

async function toggleSelectedMcpActive(active) {
    const server = getSelectedMcpServer();
    if (!server) return;
    if (active && !validateMcpServerDraft(server).valid) {
        renderMcpControlCenter();
        return showToast('Fix server configuration before activating it in chat', 'error');
    }
    server.transport = MCP_BUILT_IN_TYPES.has(server.type) ? 'mcp-system' : server.transport;
    server.endpoint = MCP_BUILT_IN_TYPES.has(server.type) && location.protocol !== 'file:' ? `${location.origin}/mcp` : server.endpoint;
    server.enabled = Boolean(active);
    if (MCP_BUILT_IN_TYPES.has(server.type)) {
        const config = await getCurrentMcpConfigDraft();
        config[server.type] = { ...(config[server.type] || {}), ...buildBuiltInConfigFromForm(server), active: server.enabled, name: server.name, toolPermissions: server.permissions?.toolPermissions || {} };
        await saveMcpSystemConfig(config);
    }
    await setMcpServerActiveForCurrentChat(server, active);
    if (active) await testMcpServer(server.id).catch(() => {});
    await refreshMcpControlData().catch(() => {});
    renderMcpControlCenter();
}

async function updateSelectedToolPermission(toolName, patch) {
    const server = getSelectedMcpServer();
    if (!server) return;
    server.permissions = normalizeServerPermissions(server);
    const current = getToolPermission(server, toolName);
    server.permissions.toolPermissions[toolName] = { ...current, ...patch };
    if (server.permissions.readOnly && ['write', 'destructive'].includes(server.permissions.toolPermissions[toolName].riskLevel)) {
        server.permissions.toolPermissions[toolName].enabled = false;
    }
    server.updatedAt = Date.now();
    await saveMcpServers();
    await logMcpEvent({ eventType: 'config', serverId: server.id, serverName: server.name, toolName, success: true, message: `${toolName} permission changed`, details: server.permissions.toolPermissions[toolName] });
    renderMcpControlCenter();
}

function addMcpControlServer() {
    const preset = getMcpPreset('custom');
    const server = normalizeMcpServerForStorage(createMcpServer({
        type: 'custom',
        name: uniqueMcpServerName('Custom MCP'),
        endpoint: '',
        config: preset.defaultConfig ? preset.defaultConfig() : {}
    }));
    state.mcpServers.push(server);
    syncWorkspaceForMcpServer(server);
    saveMcpServers();
    logMcpEvent({ eventType: 'config', serverId: server.id, serverName: server.name, success: true, message: `${server.name} created` });
    state.mcpControl.selectedId = server.id;
    renderMcpControlCenter();
}

function getToolPermission(server, toolName, risk = 'read') {
    server.permissions = normalizeServerPermissions(server);
    if (!server.permissions.toolPermissions[toolName]) {
        const riskLevel = normalizeMcpRiskLevel(risk);
        server.permissions.toolPermissions[toolName] = {
            enabled: !(server.permissions.readOnly && ['write', 'destructive'].includes(riskLevel)),
            requiresApproval: riskLevel !== 'read',
            riskLevel,
            scope: 'chat',
            lastUsedAt: 0,
            errorCount: 0
        };
    }
    return server.permissions.toolPermissions[toolName];
}

function normalizeServerPermissions(server) {
    const permissions = server.permissions && typeof server.permissions === 'object' ? server.permissions : {};
    const toolPermissions = permissions.toolPermissions && typeof permissions.toolPermissions === 'object' ? permissions.toolPermissions : {};
    const normalized = {
        read: permissions.read || 'auto',
        network: permissions.network || 'confirm',
        destructive: permissions.destructive || 'confirm',
        readOnly: Boolean(permissions.readOnly),
        toolPermissions
    };
    for (const tool of (server.capabilities || []).filter(item => item.kind === 'tool')) {
        const risk = normalizeMcpRiskLevel(tool.safety || inferMcpToolSafety(tool.name, tool.description));
        normalized.toolPermissions[tool.name] = {
            enabled: normalized.toolPermissions[tool.name]?.enabled !== false && !(normalized.readOnly && ['write', 'destructive'].includes(risk)),
            requiresApproval: typeof normalized.toolPermissions[tool.name]?.requiresApproval === 'boolean' ? normalized.toolPermissions[tool.name].requiresApproval : risk !== 'read',
            riskLevel: normalized.toolPermissions[tool.name]?.riskLevel || risk,
            scope: normalized.toolPermissions[tool.name]?.scope || 'chat',
            lastUsedAt: normalized.toolPermissions[tool.name]?.lastUsedAt || 0,
            errorCount: Number(normalized.toolPermissions[tool.name]?.errorCount) || 0
        };
    }
    return normalized;
}

function getPermissionSummary(server) {
    const tools = getToolsForServer(server);
    return tools.reduce((acc, tool) => {
        const permission = tool.permission || getToolPermission(server, tool.name, tool.riskLevel);
        if (!permission.enabled) return acc;
        if (tool.riskLevel === 'read') acc.read += 1;
        if (tool.riskLevel === 'write') acc.write += 1;
        if (tool.riskLevel === 'external') acc.external += 1;
        if (tool.riskLevel === 'destructive') acc.destructive += 1;
        if (permission.requiresApproval) acc.approval += 1;
        return acc;
    }, { read: 0, write: 0, external: 0, destructive: 0, approval: 0 });
}

function markToolUsage(server, toolName, success) {
    const permission = getToolPermission(server, toolName);
    permission.lastUsedAt = Date.now();
    if (!success) permission.errorCount = (permission.errorCount || 0) + 1;
    saveMcpServers();
}

async function logMcpEvent(entry) {
    if (typeof addMcpLog === 'function') await addMcpLog(entry);
    else state.mcpLogs = [{ id: generateId(), timestamp: Date.now(), ...entry }, ...(state.mcpLogs || [])].slice(0, 300);
}

async function handleMcpActivityAction(event) {
    const filter = event.target.closest('[data-mcp-log-filter]');
    if (filter?.dataset.mcpLogFilter === 'server') state.mcpControl.logFilterServer = filter.value;
    if (filter?.dataset.mcpLogFilter === 'type') state.mcpControl.logFilterType = filter.value;
    const search = event.target.closest('[data-mcp-log-search]');
    if (search) state.mcpControl.logSearch = search.value;
    const action = event.target.closest('[data-mcp-log-action]')?.dataset.mcpLogAction;
    if (action === 'clear') {
        if (!confirm('Clear local MCP activity logs?')) return;
        await clearMcpLogs();
    }
    if (action === 'retry') {
        const serverId = event.target.closest('[data-mcp-log-server]')?.dataset.mcpLogServer;
        const server = getWorkspaceMcpServers().find(item => item.id === serverId || item.type === serverId || item.name === serverId);
        if (server) {
            state.mcpControl.selectedId = server.id;
            await testSelectedMcpServer();
            return;
        }
    }
    if (action === 'export') {
        downloadFile(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), logs: state.mcpLogs }, null, 2), `architects_domain_mcp_logs_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    }
    renderMcpActivityFeed();
}

function renderMcpComposerIndicator() {
    if (!el.mcpComposerIndicator) return;
    if (!isMcpToolsEnabled()) {
        el.mcpComposerIndicator.hidden = true;
        el.mcpComposerIndicator.classList.remove('active');
        if (el.mcpComposerDropdown) el.mcpComposerDropdown.innerHTML = '';
        const controlBadge = document.getElementById('mcpControlBadge');
        if (controlBadge) controlBadge.hidden = true;
        updateMcpAvailabilityUi();
        return;
    }
    el.mcpComposerIndicator.hidden = false;
    const tools = getActiveMcpTools();
    const servers = getWorkspaceMcpServers().filter(server => isMcpServerActiveInCurrentChat(server));
    const excluded = getMcpExcludedTools().slice(0, 12);
    el.mcpComposerIndicator.classList.toggle('active', tools.length > 0);
    el.mcpComposerIndicator.querySelector('span').textContent = `${tools.length} MCP ${tools.length === 1 ? 'tool' : 'tools'}`;
    const controlBadge = document.getElementById('mcpControlBadge');
    if (controlBadge) {
        controlBadge.hidden = tools.length === 0;
        controlBadge.textContent = tools.length ? String(Math.min(tools.length, 99)) : '';
        controlBadge.setAttribute('aria-label', `${tools.length} active MCP ${tools.length === 1 ? 'tool' : 'tools'}`);
    }
    el.mcpComposerDropdown.innerHTML = tools.length ? servers.map(server => {
        const serverTools = tools.filter(tool => tool.serverId === server.id);
        if (!serverTools.length) return '';
        return `<div class="mcp-composer-server"><strong>${maskMcpText(server.name)}</strong>${serverTools.map(tool => `<span>${escapeHtml(tool.name)}</span>`).join('')}</div>`;
    }).join('') + (excluded.length ? `<div class="mcp-composer-excluded"><strong>Excluded</strong>${excluded.map(tool => `<span>${escapeHtml(tool.name)} · ${escapeHtml(tool.reason)}</span>`).join('')}</div>` : '') : '<div class="mcp-composer-empty">No active MCP tools in this chat.</div>';
}

function updateMcpAvailabilityUi() {
    const enabled = isMcpToolsEnabled();
    if (el.mcpControlCenterBtn) el.mcpControlCenterBtn.hidden = !enabled;
    if (el.mcpEnabledToggle) el.mcpEnabledToggle.checked = enabled;
    if (el.mcpStatusPill) {
        const hasError = enabled && (
            Boolean(state.mcpControl?.status?.servers?.some(server => ['error', 'offline'].includes(server.status) || server.statusState === 'error'))
            || Boolean(state.mcpBridgeHealth?.status === 'error')
        );
        const ready = enabled && !hasError;
        el.mcpStatusPill.textContent = enabled ? (hasError ? 'MCP: Error' : 'MCP: Ready') : 'MCP: Off';
        el.mcpStatusPill.className = `mcp-status-pill ${enabled ? (ready ? 'ready' : 'error') : 'off'}`;
        el.mcpStatusPill.title = enabled
            ? hasError ? 'MCP tools are enabled, but at least one MCP server reported an error.' : 'MCP tools are enabled.'
            : 'MCP tools are disabled. Enable them in Settings → Experimental.';
    }
}

function buildMcpToolContextPreview(selectedServer = null) {
    const mode = state.mcpControl.toolCallingMode || 'native';
    const activeServers = getWorkspaceMcpServers().filter(server => isMcpServerActiveInCurrentChat(server) && server.enabled);
    const activeTools = getActiveMcpTools().filter(tool => !selectedServer || tool.serverId === selectedServer.id);
    const excludedTools = getMcpExcludedTools().filter(tool => !selectedServer || tool.serverId === selectedServer.id);
    const enabledTools = activeTools.map(tool => {
        const schema = sanitizeMcpJsonSchema(tool.inputSchema);
        return {
            name: getMcpToolQualifiedName(tool),
            serverName: tool.serverName,
            risk: tool.permission?.riskLevel || tool.safety || 'read',
            requiresApproval: Boolean(tool.permission?.requiresApproval),
            description: tool.description || '',
            schemaSummary: summarizeMcpSchema(schema)
        };
    });
    const protocol = buildMcpProtocolPreview(mode, enabledTools);
    const raw = JSON.stringify({ mode, activeServers: activeServers.map(server => server.name), enabledTools, excludedTools }, null, 2) + protocol;
    return {
        mode,
        activeServers,
        enabledTools,
        excludedTools,
        estimatedTokens: estimateTokens(raw),
        modeCopy: getMcpModeCopy(mode),
        protocol
    };
}

function getMcpExcludedTools() {
    const activeIds = new Set((getCurrentMcpChatState().activeServerIds || []));
    const excluded = [];
    for (const server of getWorkspaceMcpServers()) {
        const active = activeIds.has(server.id) && server.enabled;
        for (const tool of (server.capabilities || []).filter(item => item.kind === 'tool')) {
            const permission = getMcpToolPermissionSnapshot(server, tool);
            let reason = '';
            if (!server.enabled) reason = 'server disabled';
            else if (!activeIds.has(server.id)) reason = 'inactive in this chat';
            else if (permission.enabled === false) reason = 'tool disabled';
            else if (server.permissions?.readOnly && ['write', 'destructive'].includes(permission.riskLevel)) reason = 'read-only mode';
            else if (!active) reason = 'not injected';
            if (reason) excluded.push({ serverId: server.id, serverName: server.name, name: tool.name, reason });
        }
    }
    return excluded;
}

function summarizeMcpSchema(schema = {}) {
    const props = Object.entries(schema.properties || {});
    if (!props.length) return '{}';
    return props.slice(0, 8).map(([name, value]) => `${name}:${value.type || 'any'}`).join(', ');
}

function getMcpModeCopy(mode) {
    if (mode === 'native') return 'Native mode sends provider function definitions when supported. Non-native fallback blocks are still validated before execution.';
    if (mode === 'xml') return 'XML mode teaches non-native models to request MCP tools with a strict <tool_call> JSON payload.';
    if (mode === 'json') return 'JSON mode teaches weaker/local models to emit a strict JSON tool request block.';
    return 'MCP tool calling is disabled. No tool protocol will be injected and provider tool definitions are withheld.';
}

function buildMcpProtocolPreview(mode, tools = []) {
    if (mode === 'disabled') return 'MCP tool protocol disabled.';
    const sample = tools[0] || { name: 'serverId:tool_name' };
    const payload = JSON.stringify({ serverId: sample.name.split(':')[0] || 'server-id', tool: sample.name.split(':')[1] || 'tool_name', arguments: {} }, null, 2);
    if (mode === 'xml') return `<tool_call>\n${payload}\n</tool_call>`;
    if (mode === 'json') return payload;
    return `Provider tools: ${tools.length} function definitions available.`;
}

function toggleMcpPrivacyMode() {
    state.mcpControl.privacyMode = !state.mcpControl.privacyMode;
    localStorage.setItem('architects_domain_mcp_privacy_mode', String(state.mcpControl.privacyMode));
    el.mcpControlCenterModal.classList.toggle('privacy-active', state.mcpControl.privacyMode);
    saveSettings();
    renderMcpControlCenter();
}

function toggleMcpDemoMode() {
    state.mcpControl.demoMode = !state.mcpControl.demoMode;
    if (state.mcpControl.demoMode) state.mcpControl.privacyMode = true;
    localStorage.setItem('architects_domain_mcp_demo_mode', String(state.mcpControl.demoMode));
    localStorage.setItem('architects_domain_mcp_privacy_mode', String(state.mcpControl.privacyMode));
    el.mcpControlCenterModal.classList.toggle('demo-active', state.mcpControl.demoMode);
    el.mcpControlCenterModal.classList.toggle('privacy-active', state.mcpControl.privacyMode);
    saveSettings();
    renderMcpControlCenter();
}

function toggleMcpToolContextPreview() {
    state.mcpControl.toolContextPreviewOpen = !state.mcpControl.toolContextPreviewOpen;
    renderMcpControlCenter();
}

function exportMcpConfig() {
    const includeSecrets = confirm('Include secrets in an encrypted export? Choose Cancel for a plain export without secrets.');
    const payload = {
        format: 'architects-domain-mcp',
        version: 2,
        exportedAt: new Date().toISOString(),
        workspaceId: state.activeWorkspaceId,
        servers: getWorkspaceMcpServers().map(server => sanitizeMcpConfigForExport(server, includeSecrets))
    };
    if (!includeSecrets) {
        downloadFile(JSON.stringify(payload, null, 2), `architects_domain_mcp_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
        return showToast('MCP config exported without secrets', 'success');
    }
    exportEncryptedMcpConfig(payload).catch(() => showToast('Encrypted MCP export failed', 'error'));
}

async function exportEncryptedMcpConfig(payload) {
    const passphrase = prompt('Create a passphrase for this encrypted MCP export:');
    if (!passphrase) return;
    const encrypted = await encryptJson(payload, passphrase);
    encrypted.format = 'architects-domain-mcp-encrypted';
    downloadFile(JSON.stringify(encrypted, null, 2), `architects_domain_mcp_encrypted_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    showToast('Encrypted MCP config exported', 'success');
}

async function importMcpConfigFile(file) {
    if (!file) return;
    try {
        let payload = JSON.parse(await file.text());
        if (payload?.format === 'architects-domain-mcp-encrypted') {
            const passphrase = prompt('Enter the passphrase for this MCP export:');
            if (!passphrase) return;
            payload.format = 'architects-domain-settings';
            payload = await decryptJson(payload, passphrase);
        }
        if (payload?.format !== 'architects-domain-mcp' || !Array.isArray(payload.servers)) throw new Error('Invalid MCP export format');
        const incoming = payload.servers.map(server => normalizeMcpServerForStorage({ ...server, id: generateId(), workspaceId: state.activeWorkspaceId }));
        const preview = incoming.map(server => server.name).join('\n');
        if (!confirm(`Import ${incoming.length} MCP servers?\n\n${preview}\n\nDuplicate names will be renamed.`)) return;
        for (const server of incoming) {
            server.name = uniqueMcpServerName(server.name);
            state.mcpServers.push(server);
            syncWorkspaceForMcpServer(server);
            await logMcpEvent({ eventType: 'config', serverId: server.id, serverName: server.name, success: true, message: `${server.name} imported` });
        }
        await saveMcpServers();
        renderMcpControlCenter();
        showToast('MCP config imported', 'success');
    } catch (error) {
        showToast(error.message || 'Could not import MCP config', 'error');
    } finally {
        if (el.mcpImportInput) el.mcpImportInput.value = '';
    }
}

function sanitizeMcpConfigForExport(server, includeSecrets = false) {
    const copy = structuredClone(server);
    if (!includeSecrets) copy.config = stripSecrets(copy.config || {});
    return copy;
}

function stripSecrets(value) {
    if (Array.isArray(value)) return value.map(stripSecrets);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [
        key,
        MCP_SECRET_KEYS.test(key) ? '' : stripSecrets(val)
    ]));
}

function getServerStatusState(server, bridgeStatus = null) {
    if (!server.enabled && !isMcpServerActiveInCurrentChat(server)) return 'disabled';
    if (server.status === 'testing') return 'connecting';
    if (server.lastError || server.status === 'error' || bridgeStatus?.status === 'offline') return 'error';
    if (bridgeStatus?.status === 'unconfigured' || server.status === 'untested') return 'needs_configuration';
    if (server.status === 'connected' || bridgeStatus?.status === 'online') return 'connected';
    return server.statusState || 'disconnected';
}

function canDiscoverToolsForServer(server) {
    return MCP_BUILT_IN_TYPES.has(server.type) || server.transport === 'bridge' || isBridgeServer(server) || (server.transport === 'http' && server.endpoint);
}

function statusToDot(status) {
    if (['online', 'connected'].includes(status)) return 'online';
    if (['error', 'offline', 'timeout'].includes(status)) return 'offline';
    if (status === 'connecting') return 'connecting';
    return 'unconfigured';
}

function getServerTypeIcon(type) {
    const icons = {
        github: 'GH', filesystem: 'FS', browser: 'BR', memory: 'MM', 'markdown-vault': 'MD', git: 'GT',
        'web-fetch': 'WF', 'web-fetch-plus': 'WF', custom: 'HTTP', 'notes-vault': 'NV', 'app-inspector': 'AD', 'bridge-health': 'BH'
    };
    return icons[type] || 'MCP';
}

function normalizeMcpRiskLevel(value) {
    const risk = String(value || '').toLowerCase();
    if (risk === 'network') return 'external';
    if (risk === 'destructive') return 'destructive';
    if (risk === 'write') return 'write';
    if (risk === 'external') return 'external';
    return 'read';
}

function splitCsv(value = '') {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function isValidHttpUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return ['http:', 'https:'].includes(url.protocol);
    } catch (error) {
        return false;
    }
}

function isUnsafePath(value = '') {
    const pathValue = String(value || '').trim();
    if (!pathValue) return true;
    if (/^[a-z]:\\?$/i.test(pathValue)) return true;
    if (/^[\\/]+$/.test(pathValue)) return true;
    if (/(^|[\\/])\.\.([\\/]|$)/.test(pathValue)) return true;
    return false;
}

function uniqueMcpServerName(base) {
    const names = new Set(getWorkspaceMcpServers().map(server => server.name.toLowerCase()));
    if (!names.has(String(base).toLowerCase())) return base;
    let index = 2;
    while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
    return `${base} ${index}`;
}

function formatRelativeTime(value) {
    const time = Number(value) || Date.parse(value || '');
    if (!time) return 'never tested';
    const delta = Date.now() - time;
    if (delta < 60_000) return 'just now';
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return new Date(time).toLocaleDateString();
}

function maskMcpText(value) {
    let text = escapeHtml(value);
    if (state.mcpControl?.demoMode) {
        return text
            .replace(/[A-Za-z]:\\[^<\n"]+/g, '~/Project')
            .replace(/\/(?:Users|home|var|etc)\/[^<\n"]+/g, '~/Project')
            .replace(/https?:\/\/[^\s<"]+/g, 'https://example.local')
            .replace(/\b(New Chat|Hello[^<\n"]*|Architect's Domain[^<\n"]*)\b/gi, 'Demo Chat')
            .replace(/(sk-|or-|ghp_|github_pat_)[A-Za-z0-9_\-]+/g, '[secret]')
            .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [secret]');
    }
    if (!state.mcpControl?.privacyMode && !state.mcpControl?.demoMode) return text;
    return text
        .replace(/[A-Za-z]:\\[^<\n"]+/g, '[local path]')
        .replace(/\/(?:Users|home|var|etc)\/[^<\n"]+/g, '[local path]')
        .replace(/https?:\/\/[^\s<"]+/g, '[url]')
        .replace(/(sk-|or-|ghp_|github_pat_)[A-Za-z0-9_\-]+/g, '[secret]')
        .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [secret]');
}

function normalizeMcpError(error) {
    const message = String(error?.message || error || 'MCP request failed');
    const code = error?.code || (message.includes('404') ? 'BRIDGE_HTTP' : message.includes('refused') ? 'CONNECTION_REFUSED' : message.includes('timeout') ? 'TIMEOUT' : 'MCP_ERROR');
    const guidance = humanizeError({ code, message });
    return { code, message, ...guidance };
}

function humanizeError(error) {
    const message = String(error?.message || error || '');
    const upper = String(error?.code || '').toUpperCase();
    let key = upper;
    if (!MCP_ERROR_GUIDANCE[key]) {
        if (/path.*outside|not allowed/i.test(message)) key = 'PATH_NOT_ALLOWED';
        else if (/path|folder|directory/i.test(message)) key = 'INVALID_PATH';
        else if (/url/i.test(message)) key = 'INVALID_URL';
        else if (/token|credential|auth/i.test(message)) key = 'MISSING_TOKEN';
        else if (/timeout/i.test(message)) key = 'TIMEOUT';
        else if (/404|unsupported/i.test(message)) key = 'UNSUPPORTED';
        else if (/bridge|http|fetch|failed to fetch/i.test(message)) key = 'BRIDGE_HTTP';
    }
    const [what, cause, action] = MCP_ERROR_GUIDANCE[key] || ['MCP operation failed.', 'The server returned an unexpected error.', 'Open technical details and retry after checking the configuration.'];
    return { what, cause, action, technical: message };
}

function initMcpUi() {
    updateMcpAvailabilityUi();
    if (isMcpToolsEnabled()) ensureBuiltInMcpServers();
    if (el.mcpControlCenterBtn) el.mcpControlCenterBtn.addEventListener('click', openMcpControlCenter);
    if (el.mcpControlCloseBtn) el.mcpControlCloseBtn.addEventListener('click', closeMcpControlCenter);
    if (el.mcpControlCenterModal) {
        el.mcpControlCenterModal.addEventListener('click', event => {
            if (event.target === el.mcpControlCenterModal) closeMcpControlCenter();
        });
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.mcpControl.open) closeMcpControlCenter();
    });
    if (el.mcpControlServerList) el.mcpControlServerList.addEventListener('click', handleMcpControlServerClick);
    if (el.mcpControlConfig) {
        el.mcpControlConfig.addEventListener('click', event => handleMcpConfigAction(event).catch(error => showToast(error.message || 'MCP config failed', 'error')));
        el.mcpControlConfig.addEventListener('input', event => handleMcpConfigInput(event).catch(() => {}));
        el.mcpControlConfig.addEventListener('change', event => handleMcpConfigInput(event).catch(() => {}));
    }
    if (el.mcpToolInspector) el.mcpToolInspector.addEventListener('click', event => handleMcpToolInspectorClick(event).catch(error => showToast(error.message || 'MCP tool failed', 'error')));
    if (el.mcpActivityFeed) {
        el.mcpActivityFeed.addEventListener('click', event => handleMcpActivityAction(event).catch(() => {}));
        el.mcpActivityFeed.addEventListener('input', event => handleMcpActivityAction(event).catch(() => {}));
        el.mcpActivityFeed.addEventListener('change', event => handleMcpActivityAction(event).catch(() => {}));
    }
    if (el.mcpControlAddServerBtn) el.mcpControlAddServerBtn.addEventListener('click', addMcpControlServer);
    if (el.mcpImportInput) el.mcpImportInput.addEventListener('change', event => importMcpConfigFile(event.target.files?.[0]));
    if (el.mcpComposerIndicator) el.mcpComposerIndicator.addEventListener('click', event => {
        if (event.target.closest('.mcp-composer-dropdown')) return;
        state.mcpControl.toolContextPreviewOpen = true;
        openMcpControlCenter();
    });
    if (isMcpToolsEnabled()) {
        refreshMcpBridgeStatus();
        refreshMcpControlData().catch(() => {}).finally(renderMcpControlCenter);
    } else {
        renderMcpComposerIndicator();
    }
    renderMcpExecutionCards();
}
