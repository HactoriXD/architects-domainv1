// MCP Tool Executor
// ============================================
function createMcpExecution(tool, args = {}) {
    return {
        id: generateId(),
        serverId: tool.serverId,
        serverName: tool.serverName,
        toolName: tool.name,
        qualifiedName: getMcpToolQualifiedName(tool),
        safety: tool.safety || 'read',
        args,
        status: 'queued',
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
        elapsedMs: 0,
        result: null,
        error: ''
    };
}

async function executeMcpToolCall(qualifiedName, args = {}, options = {}) {
    const tool = getMcpToolByQualifiedName(qualifiedName);
    if (!tool) throw new Error(`MCP tool not found: ${qualifiedName}`);
    const server = getWorkspaceMcpServers().find(item => item.id === tool.serverId);
    if (!server) throw new Error('MCP server is no longer available');

    const execution = createMcpExecution(tool, args);
    state.mcpExecutions.unshift(execution);
    state.mcpExecutions = state.mcpExecutions.slice(0, 50);
    renderMcpExecutionCards();
    updateContextInspector();

    if (requiresMcpApproval(tool) && !requestMcpToolApproval(tool, args)) {
        execution.status = 'cancelled';
        execution.finishedAt = Date.now();
        execution.error = 'User rejected tool call';
        renderMcpExecutionCards();
        updateContextInspector();
        return execution;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || MCP_RUNTIME.toolTimeoutMs);
    execution.status = 'running';
    execution.startedAt = Date.now();
    renderMcpExecutionCards();

    try {
        const result = await mcpRuntimeCallTool(server, tool.name, args, { signal: controller.signal });
        execution.status = 'success';
        execution.result = result;
        execution.finishedAt = Date.now();
        execution.elapsedMs = execution.finishedAt - execution.startedAt;
        server.executionHistory = [execution, ...(server.executionHistory || [])].slice(0, 20);
        server.lastSeenAt = Date.now();
        server.status = 'connected';
    } catch (error) {
        execution.status = error.name === 'AbortError' ? 'timeout' : 'failed';
        execution.error = error.name === 'AbortError' ? 'Tool call timed out' : (error.message || 'Tool call failed');
        execution.finishedAt = Date.now();
        execution.elapsedMs = execution.startedAt ? execution.finishedAt - execution.startedAt : 0;
        server.status = execution.status === 'timeout' ? 'timeout' : 'degraded';
        server.lastError = execution.error;
    } finally {
        clearTimeout(timeout);
        saveMcpServers();
        renderMcpServers();
        renderMcpExecutionCards();
        updateContextInspector();
    }

    return execution;
}

function buildToolResultApiMessage(execution) {
    return {
        role: 'tool',
        tool_call_id: execution.providerToolCallId || execution.id,
        name: mcpToolNameToProviderName(execution.qualifiedName),
        content: execution.status === 'success'
            ? sanitizeMcpToolResult(execution.result)
            : `MCP tool ${execution.toolName} ${execution.status}: ${execution.error || 'No result'}`
    };
}

function renderMcpExecutionCards() {
    if (!el.mcpExecutionList) return;
    const executions = state.mcpExecutions || [];
    el.mcpExecutionList.innerHTML = executions.length ? executions.slice(0, 8).map(renderMcpExecutionCard).join('') : '<div class="mcp-execution-empty">No tool executions yet.</div>';
}

function renderMcpExecutionCard(execution) {
    const result = execution.result ? sanitizeMcpToolResult(execution.result) : execution.error;
    return `
        <div class="mcp-execution-card ${execution.status}" data-mcp-execution="${execution.id}">
            <div class="mcp-execution-top">
                <span class="mcp-status ${execution.status}">${escapeHtml(execution.status)}</span>
                <strong>${escapeHtml(execution.toolName)}</strong>
                <small>${escapeHtml(execution.serverName || 'MCP')} ${execution.elapsedMs ? `· ${execution.elapsedMs}ms` : ''}</small>
            </div>
            <details>
                <summary>Arguments and output</summary>
                <pre>${escapeHtml(JSON.stringify(execution.args || {}, null, 2))}</pre>
                ${result ? `<pre>${escapeHtml(String(result).slice(0, 4000))}</pre>` : ''}
            </details>
        </div>
    `;
}
