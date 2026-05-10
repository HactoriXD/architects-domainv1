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
    if (window.ArchitectMCP?.executeToolCall && !options.__hostInternal) {
        return window.ArchitectMCP.executeToolCall(qualifiedName, args, options);
    }
    const tool = getMcpToolByQualifiedName(qualifiedName);
    if (!tool) throw new Error(`MCP tool not found: ${qualifiedName}`);
    const server = getWorkspaceMcpServers().find(item => item.id === tool.serverId);
    if (!server) throw new Error('MCP server is no longer available');

    const execution = createMcpExecution(tool, args);
    state.mcpExecutions.unshift(execution);
    state.mcpExecutions = state.mcpExecutions.slice(0, 50);
    renderMcpExecutionCards();
    updateContextInspector();

    if (requiresMcpApproval(tool) && !(await requestMcpToolApproval(tool, args))) {
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
        if (typeof logMcpEvent === 'function') await logMcpEvent({ eventType: 'execution', serverId: server.id, serverName: server.name, toolName: tool.name, success: true, message: `${tool.name} started` });
        let result = await mcpRuntimeCallTool(server, tool.name, args, { signal: controller.signal });
        if (result?.requiresConfirmation) {
            if (!result.operationId) {
                execution.status = 'failed';
                execution.finishedAt = Date.now();
                execution.error = 'Confirmation required but no operation ID received';
                return execution;
            }
            const preview = result.preview ? `\n\nPreview:\n${String(result.preview).slice(0, 400)}` : '';
            const pathInfo = result.path ? `\n\nPath: ${result.path}` : '';
            const allowed = await requestMcpToolApproval({ ...tool, safety: 'destructive', permission: { ...(tool.permission || {}), riskLevel: 'destructive', requiresApproval: true } }, { ...args, operationId: result.operationId, path: result.path, preview: result.preview }, { force: true });
            if (!allowed) {
                execution.status = 'cancelled';
                execution.finishedAt = Date.now();
                execution.error = 'User rejected confirmation';
                return execution;
            }
            result = await confirmMcpSystemOperation(server.type, result.operationId);
            result = result.result ?? result;
        }
        if (result?.requiresFrontendExtraction && tool.name === 'browser_extract_structured') {
            result = await extractStructuredMcpResult(result, args);
        }
        execution.status = 'success';
        execution.result = result;
        execution.finishedAt = Date.now();
        execution.elapsedMs = execution.finishedAt - execution.startedAt;
        server.executionHistory = [execution, ...(server.executionHistory || [])].slice(0, 20);
        server.lastSeenAt = Date.now();
        server.status = 'connected';
        if (typeof markToolUsage === 'function') markToolUsage(server, tool.name, true);
        if (typeof logMcpEvent === 'function') await logMcpEvent({ eventType: 'execution', serverId: server.id, serverName: server.name, toolName: tool.name, durationMs: execution.elapsedMs, success: true, message: `${tool.name} succeeded` });
    } catch (error) {
        execution.status = error.name === 'AbortError' ? 'timeout' : 'failed';
        execution.error = error.name === 'AbortError' ? 'Tool call timed out' : formatMcpExecutionError(tool, args, error);
        execution.finishedAt = Date.now();
        execution.elapsedMs = execution.startedAt ? execution.finishedAt - execution.startedAt : 0;
        server.status = execution.status === 'timeout' ? 'timeout' : 'degraded';
        server.lastError = execution.error;
        if (typeof markToolUsage === 'function') markToolUsage(server, tool.name, false);
        if (typeof logMcpEvent === 'function') await logMcpEvent({ eventType: 'error', serverId: server.id, serverName: server.name, toolName: tool.name, durationMs: execution.elapsedMs, success: false, message: `${tool.name} failed`, details: { error: execution.error } });
    } finally {
        clearTimeout(timeout);
        saveMcpServers();
        renderMcpServers();
        renderMcpExecutionCards();
        updateContextInspector();
    }

    return execution;
}

function formatMcpExecutionError(tool, args = {}, error = {}) {
    const message = error.message || 'Tool call failed';
    const toolName = String(tool?.name || '');
    const url = String(args?.url || '');
    if (
        (toolName.startsWith('browser_') || toolName.startsWith('puppeteer_'))
        && /\blocalhost\b|127\.0\.0\.1|\[::1\]/i.test(url)
        && /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|net::|timeout|Navigation timeout/i.test(message)
    ) {
        return 'Browser tool could not reach localhost. Try 127.0.0.1 or host.docker.internal depending on where the MCP browser runs.';
    }
    return message;
}

async function extractStructuredMcpResult(extracted, args = {}) {
    if (!state.selectedModel || !getApiKey()) {
        return { ...extracted, extractionError: 'Structured extraction requires the active provider and API key.' };
    }
    const schema = args.schema && typeof args.schema === 'object' ? args.schema : {};
    const response = await fetch(`${getProvider().apiBase}/chat/completions`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
            model: state.selectedModel.id,
            temperature: 0,
            stream: false,
            messages: [
                { role: 'system', content: 'Extract JSON from page text. Return only valid JSON matching the requested schema. Do not include markdown.' },
                { role: 'user', content: `Schema:\n${JSON.stringify(schema, null, 2)}\n\nPage title: ${extracted.title || ''}\nURL: ${extracted.url || ''}\n\nText:\n${String(extracted.text || '').slice(0, 50000)}` }
            ]
        })
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || '{}';
    let structured = null;
    try {
        structured = JSON.parse(content);
    } catch (error) {
        structured = { raw: content };
    }
    return { url: extracted.url, title: extracted.title, schema, structured };
}

function buildToolResultApiMessage(execution) {
    if (window.ArchitectMCP?.buildToolResultApiMessage) return window.ArchitectMCP.buildToolResultApiMessage(execution);
    let content;
    if (execution.status === 'success') {
        if (execution.result && typeof execution.result === 'object' && execution.result.requiresConfirmation) {
            content = `MCP tool ${execution.toolName} requires confirmation before completing. The operation has not been executed yet.`;
        } else {
            content = sanitizeMcpToolResult(execution.result);
        }
    } else {
        content = `MCP tool ${execution.toolName} ${execution.status}: ${execution.error || 'No result'}`;
    }
    return {
        role: 'tool',
        tool_call_id: execution.providerToolCallId || execution.id,
        name: mcpToolNameToProviderName(execution.qualifiedName),
        content
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
