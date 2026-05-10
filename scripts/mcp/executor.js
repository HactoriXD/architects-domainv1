// Architect's Domain MCP Executor
// ============================================
(function initArchitectMcpExecutor(global) {
    const host = global.ArchitectMCP;
    if (!host) return;

    function createExecution(tool, args = {}, options = {}) {
        return {
            id: options.id || (typeof generateId === 'function' ? generateId() : `${Date.now()}-${Math.random()}`),
            status: 'queued',
            source: options.source || 'model',
            serverId: tool?.serverId || '',
            serverName: tool?.serverName || 'MCP',
            toolName: tool?.name || options.toolName || 'tool',
            qualifiedName: tool ? getQualifiedName(tool) : (options.qualifiedName || options.name || ''),
            safety: tool?.permission?.riskLevel || tool?.safety || 'read',
            args: host.redactSecrets ? host.redactSecrets(args || {}) : (args || {}),
            rawArgs: args || {},
            startedAt: null,
            finishedAt: null,
            durationMs: 0,
            elapsedMs: 0,
            result: null,
            error: '',
            approval: null,
            providerToolCallId: options.providerToolCallId || ''
        };
    }

    async function executeToolCall(callOrName, argsOrOptions = {}, maybeOptions = {}) {
        const { call, options } = normalizeExecuteInput(callOrName, argsOrOptions, maybeOptions);
        const normalized = host.normalizeToolRequest
            ? host.normalizeToolRequest({ tool: call.name, serverId: call.serverId || '', arguments: call.arguments || {} }, { source: options.source || call.source || 'model', raw: call.raw || '' })
            : { ok: false, error: { message: 'MCP parser is not ready.', details: {} } };
        if (!normalized.ok) return finishEarlyErrorExecution(normalized.error, call, options);

        const tool = getToolByQualifiedName(normalized.call.name);
        if (!tool) return finishEarlyErrorExecution({ message: 'Tool not available.', details: { tool: normalized.call.name } }, call, options);
        const execution = createExecution(tool, normalized.call.arguments || {}, { ...options, source: normalized.call.source || options.source, providerToolCallId: call.id || options.providerToolCallId });
        pushExecution(execution);
        const category = host.getToolCategory ? host.getToolCategory(tool) : 'other';
        if (category === 'browser') return enqueue(`browser:${tool.serverId}`, () => runExecution(execution, tool, normalized.call.arguments || {}, options));
        return runExecution(execution, tool, normalized.call.arguments || {}, options);
    }

    function normalizeExecuteInput(callOrName, argsOrOptions, maybeOptions) {
        if (typeof callOrName === 'string') {
            return {
                call: { name: callOrName, arguments: argsOrOptions || {}, source: maybeOptions.source || 'legacy' },
                options: maybeOptions || {}
            };
        }
        const call = callOrName || {};
        return {
            call: {
                ...call,
                name: call.name || call.qualifiedName || call.toolName || '',
                arguments: call.arguments || call.args || {}
            },
            options: argsOrOptions || {}
        };
    }

    async function enqueue(key, task) {
        const queues = host._state.executionQueues;
        const previous = queues.get(key) || Promise.resolve();
        const current = previous.catch(() => {}).then(task);
        queues.set(key, current.finally(() => {
            if (queues.get(key) === current) queues.delete(key);
        }));
        return current;
    }

    async function runExecution(execution, tool, args, options = {}) {
        const server = findServer(tool.serverId);
        if (!server) return failExecution(execution, 'MCP server is no longer available');
        const timeoutMs = Number(options.timeoutMs || host._state.settings.maxToolTimeoutMs || global.MCP_RUNTIME?.toolTimeoutMs || 25000);
        try {
            if (typeof requiresMcpApproval === 'function' && requiresMcpApproval(tool)) {
                execution.status = 'awaiting_approval';
                execution.approval = { required: true, requestedAt: Date.now() };
                updateExecutionUi();
                const approved = typeof requestMcpToolApproval === 'function'
                    ? await requestMcpToolApproval(tool, args)
                    : true;
                execution.approval.resolvedAt = Date.now();
                execution.approval.approved = Boolean(approved);
                if (!approved) return cancelExecution(execution, 'User rejected tool call');
            }

            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            execution.status = 'running';
            execution.startedAt = Date.now();
            updateExecutionUi();
            host.audit?.({ eventType: 'execution', serverId: server.id, serverName: server.name, toolName: tool.name, message: `${tool.name} started`, details: { args } });

            try {
                let result = await mcpRuntimeCallTool(server, tool.name, args, controller ? { signal: controller.signal } : {});
                if (result?.requiresConfirmation) result = await confirmRuntimeOperation(result, tool, args, execution, server);
                if (result?.requiresFrontendExtraction && tool.name === 'browser_extract_structured' && typeof extractStructuredMcpResult === 'function') {
                    result = await extractStructuredMcpResult(result, args);
                }
                execution.status = 'success';
                execution.result = result;
                return execution;
            } catch (error) {
                execution.status = error.name === 'AbortError' ? 'timeout' : 'error';
                execution.error = error.name === 'AbortError' ? 'Tool call timed out' : formatExecutionError(tool, args, error);
                return execution;
            } finally {
                if (timeout) clearTimeout(timeout);
                finishExecution(execution, server, tool);
            }
        } catch (error) {
            failExecution(execution, error.message || 'Tool call failed');
            finishExecution(execution, server, tool);
            return execution;
        }
    }

    async function confirmRuntimeOperation(result, tool, args, execution, server) {
        if (!result.operationId) throw new Error('Confirmation required but no operation ID received');
        const approvalTool = {
            ...tool,
            safety: 'destructive',
            permission: { ...(tool.permission || {}), riskLevel: 'destructive', requiresApproval: true }
        };
        const approved = typeof requestMcpToolApproval === 'function'
            ? await requestMcpToolApproval(approvalTool, { ...args, operationId: result.operationId, path: result.path, preview: result.preview }, { force: true })
            : false;
        if (!approved) {
            execution.status = 'cancelled';
            execution.error = 'User rejected confirmation';
            return result;
        }
        const confirmed = await confirmMcpSystemOperation(server.type, result.operationId);
        return confirmed.result ?? confirmed;
    }

    function finishExecution(execution, server, tool) {
        execution.finishedAt = Date.now();
        execution.durationMs = execution.startedAt ? execution.finishedAt - execution.startedAt : 0;
        execution.elapsedMs = execution.durationMs;
        if (server) {
            server.executionHistory = [execution, ...(server.executionHistory || [])].slice(0, 20);
            server.lastSeenAt = Date.now();
            server.status = execution.status === 'success' ? 'connected' : execution.status === 'timeout' ? 'timeout' : 'degraded';
            server.lastError = execution.status === 'success' ? '' : execution.error;
        }
        if (typeof markToolUsage === 'function' && server && tool) markToolUsage(server, tool.name, execution.status === 'success');
        host.audit?.({
            eventType: execution.status === 'success' ? 'execution' : 'error',
            serverId: server?.id || execution.serverId,
            serverName: server?.name || execution.serverName,
            toolName: tool?.name || execution.toolName,
            durationMs: execution.durationMs,
            success: execution.status === 'success',
            message: `${execution.toolName} ${execution.status}`,
            details: execution.status === 'success' ? { result: host.redactSecrets?.(execution.result) } : { error: execution.error }
        });
        if (typeof saveMcpServers === 'function') saveMcpServers();
        updateExecutionUi();
    }

    function failExecution(execution, message) {
        execution.status = 'error';
        execution.error = message || 'Tool call failed';
        execution.finishedAt = Date.now();
        execution.durationMs = execution.startedAt ? execution.finishedAt - execution.startedAt : 0;
        execution.elapsedMs = execution.durationMs;
        updateExecutionUi();
        return execution;
    }

    function cancelExecution(execution, message) {
        execution.status = 'cancelled';
        execution.error = message || 'Tool call cancelled';
        execution.finishedAt = Date.now();
        execution.durationMs = execution.startedAt ? execution.finishedAt - execution.startedAt : 0;
        execution.elapsedMs = execution.durationMs;
        updateExecutionUi();
        return execution;
    }

    function finishEarlyErrorExecution(error, call = {}, options = {}) {
        const execution = createExecution(null, call.arguments || {}, {
            ...options,
            source: options.source || call.source || 'model',
            toolName: call.toolName || call.name || 'mcp_tool',
            qualifiedName: call.name || ''
        });
        execution.status = 'error';
        execution.error = error?.message || 'Tool not available.';
        execution.result = null;
        execution.finishedAt = Date.now();
        pushExecution(execution);
        host.audit?.({ eventType: 'error', toolName: execution.toolName, success: false, message: execution.error, details: error?.details || {} });
        updateExecutionUi();
        return execution;
    }

    function pushExecution(execution) {
        if (!global.state) return;
        global.state.mcpExecutions = [execution, ...(global.state.mcpExecutions || [])].slice(0, 50);
        updateExecutionUi();
    }

    function updateExecutionUi() {
        if (typeof renderMcpExecutionCards === 'function') renderMcpExecutionCards();
        if (typeof updateContextInspector === 'function') updateContextInspector();
        if (typeof renderMcpServers === 'function') renderMcpServers();
    }

    function getToolByQualifiedName(name) {
        if (typeof getMcpToolByQualifiedName === 'function') {
            const found = getMcpToolByQualifiedName(name);
            if (found) return found;
        }
        const tools = typeof getActiveMcpTools === 'function' ? getActiveMcpTools() : [];
        return tools.find(tool => getQualifiedName(tool) === name || tool.name === name);
    }

    function getQualifiedName(tool) {
        return typeof getMcpToolQualifiedName === 'function' ? getMcpToolQualifiedName(tool) : `${tool.serverId || tool.serverName}:${tool.name}`;
    }

    function findServer(serverId) {
        return (typeof getWorkspaceMcpServers === 'function' ? getWorkspaceMcpServers() : []).find(server => server.id === serverId);
    }

    function formatExecutionError(tool, args = {}, error = {}) {
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

    host._extend({
        createExecution,
        executeToolCall
    });
})(window);
