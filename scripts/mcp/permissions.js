// MCP Permissions
// ============================================
function requiresMcpApproval(tool) {
    if (tool?.permission && typeof tool.permission.requiresApproval === 'boolean') return tool.permission.requiresApproval;
    const server = getWorkspaceMcpServers().find(item => item.id === tool?.serverId);
    const stored = server?.permissions?.toolPermissions?.[tool?.name];
    if (stored && typeof stored.requiresApproval === 'boolean') return stored.requiresApproval;
    const safety = tool?.safety || inferMcpToolSafety(tool?.name, tool?.description);
    return safety !== 'read';
}

function requestMcpToolApproval(tool, args, options = {}) {
    const server = getWorkspaceMcpServers().find(item => item.id === tool?.serverId);
    const key = `${tool?.serverId}:${tool?.name}`;
    const sessionApproval = state.mcpControl.sessionApprovals?.[key];
    if (sessionApproval && tool?.safety !== 'destructive' && !options.force) return Promise.resolve(true);
    return new Promise(resolve => {
        const request = {
            id: generateId(),
            tool,
            args: args || {},
            summary: summarizeMcpApprovalRequest(tool, args),
            createdAt: Date.now(),
            resolve
        };
        state.mcpControl.approvalQueue.push(request);
        renderMcpApprovalQueue();
        if (state.mcpControl.open) renderMcpControlCenter();
    });
}

function summarizeMcpApprovalRequest(tool, args = {}) {
    const risk = tool?.permission?.riskLevel || tool?.safety || 'external';
    const keys = Object.keys(args || {});
    return `${tool?.serverName || 'MCP'} wants to run ${tool?.name || 'a tool'} (${risk})${keys.length ? ` with ${keys.join(', ')}` : ''}.`;
}

function resolveMcpApproval(id, approved, scope = 'once') {
    const item = state.mcpControl.approvalQueue.find(entry => entry.id === id);
    if (!item) return;
    state.mcpControl.approvalQueue = state.mcpControl.approvalQueue.filter(entry => entry.id !== id);
    if (approved && scope === 'session' && item.tool?.safety !== 'destructive') {
        state.mcpControl.sessionApprovals[`${item.tool.serverId}:${item.tool.name}`] = true;
    }
    if (approved && scope === 'chat' && item.tool?.safety !== 'destructive') {
        const server = getWorkspaceMcpServers().find(entry => entry.id === item.tool.serverId);
        if (server?.permissions?.toolPermissions?.[item.tool.name]) {
            server.permissions.toolPermissions[item.tool.name].requiresApproval = false;
            saveMcpServers();
        }
    }
    item.resolve(Boolean(approved));
    renderMcpApprovalQueue();
    if (state.mcpControl.open) renderMcpControlCenter();
}

function renderMcpApprovalQueue() {
    let container = document.getElementById('mcpApprovalQueue');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mcpApprovalQueue';
        container.className = 'mcp-approval-queue';
        document.body.appendChild(container);
        container.addEventListener('click', event => {
            const action = event.target.closest('[data-mcp-approval-action]');
            if (!action) return;
            resolveMcpApproval(action.dataset.mcpApprovalId, action.dataset.mcpApprovalAction !== 'deny', action.dataset.mcpApprovalAction);
        });
    }
    const queue = state.mcpControl.approvalQueue || [];
    container.innerHTML = queue.length ? queue.map(item => {
        const destructive = (item.tool?.permission?.riskLevel || item.tool?.safety) === 'destructive';
        return `
            <div class="mcp-approval-card">
                <div class="mcp-panel-heading">MCP Approval Required</div>
                <strong>${escapeHtml(item.tool?.serverName || 'MCP')} / ${escapeHtml(item.tool?.name || 'tool')}</strong>
                <span class="mcp-risk-badge ${escapeHtml(item.tool?.permission?.riskLevel || item.tool?.safety || 'external')}">${escapeHtml(item.tool?.permission?.riskLevel || item.tool?.safety || 'external')}</span>
                <p>${escapeHtml(item.summary)}</p>
                <pre>${escapeHtml(JSON.stringify(item.args || {}, null, 2).slice(0, 2000))}</pre>
                <div class="provider-actions">
                    <button class="btn danger" type="button" data-mcp-approval-action="deny" data-mcp-approval-id="${item.id}">Deny</button>
                    <button class="btn btn-primary" type="button" data-mcp-approval-action="once" data-mcp-approval-id="${item.id}">Approve Once</button>
                    <button class="btn" type="button" data-mcp-approval-action="chat" data-mcp-approval-id="${item.id}" ${destructive ? 'disabled title="Destructive tools always require explicit approval"' : ''}>Approve Chat</button>
                    <button class="btn" type="button" data-mcp-approval-action="session" data-mcp-approval-id="${item.id}" ${destructive ? 'disabled title="Destructive tools always require explicit approval"' : ''}>Approve Session</button>
                </div>
            </div>
        `;
    }).join('') : '';
}

function sanitizeMcpToolResult(result) {
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return text.length > 200000 ? `${text.slice(0, 200000)}\n\n[Output truncated]` : text;
}
