// Architect's Domain MCP Renderer Helpers
// ============================================
(function initArchitectMcpRenderer(global) {
    const host = global.ArchitectMCP;
    if (!host) return;

    function renderToolResult(execution = {}) {
        const status = execution.status || 'error';
        const preview = summarizeExecution(execution);
        const rawResult = status === 'success'
            ? redactToolImages(host.redactSecrets ? host.redactSecrets(execution.result) : execution.result)
            : { error: execution.error || 'No output' };
        return {
            role: 'tool_result',
            content: preview,
            timestamp: Date.now(),
            attachments: [],
            mcpExecutionId: execution.id,
            status,
            toolName: execution.toolName || execution.name || 'tool',
            serverName: execution.serverName || 'MCP',
            serverId: execution.serverId || '',
            qualifiedName: execution.qualifiedName || execution.name || '',
            toolArgs: host.redactSecrets ? host.redactSecrets(execution.args || execution.arguments || {}) : (execution.args || execution.arguments || {}),
            toolPreview: preview,
            toolImages: status === 'success' ? extractToolImages(execution.result).slice(0, 8) : [],
            toolRawOutput: stringifyToolOutput(rawResult),
            execution: {
                id: execution.id,
                status,
                startedAt: execution.startedAt || null,
                finishedAt: execution.finishedAt || null,
                durationMs: execution.durationMs ?? execution.elapsedMs ?? 0
            }
        };
    }

    function buildToolResultApiMessage(execution = {}) {
        const content = execution.status === 'success'
            ? sanitizeToolResult(execution.result)
            : `MCP tool ${execution.toolName || execution.name || 'tool'} ${execution.status || 'error'}: ${execution.error || 'No result'}`;
        return {
            role: 'tool',
            tool_call_id: execution.providerToolCallId || execution.id,
            name: typeof mcpToolNameToProviderName === 'function'
                ? mcpToolNameToProviderName(execution.qualifiedName || execution.name || execution.toolName || 'mcp_tool')
                : (execution.qualifiedName || execution.name || execution.toolName || 'mcp_tool'),
            content
        };
    }

    function buildToolListSummary() {
        const groups = {
            'browser/puppeteer': [],
            filesystem: [],
            memory: [],
            other: []
        };
        for (const tool of host.listTools ? host.listTools() : []) {
            const category = tool.category === 'browser' ? 'browser/puppeteer' : ['filesystem', 'memory'].includes(tool.category) ? tool.category : 'other';
            groups[category].push(`${tool.name} (${tool.serverName || tool.serverId || 'MCP'})`);
        }
        return Object.entries(groups).map(([label, tools]) => {
            const values = tools.length ? tools.sort().map(name => `- ${name}`).join('\n') : '- none active';
            return `${label}\n${values}`;
        }).join('\n\n');
    }

    function buildToolListMessage() {
        const summary = buildToolListSummary();
        return buildMessage('tools', 'MCP', summary, 'success', {}, summary);
    }

    function buildHealthMessage(health = {}) {
        const serverLines = (health.servers || []).map(server => {
            const status = server.status || server.statusState || 'unknown';
            return `- ${server.name || server.id}: ${status} (${server.toolCount ?? server.tools?.length ?? 0} tools)`;
        });
        const browser = health.browser || {};
        const browserLine = `Browser: ${browser.open ? 'open' : 'closed'}${browser.currentUrl ? ` at ${browser.currentUrl}` : ''}`;
        const queueLine = `Queue: ${(health.queue || []).length} active item(s)`;
        const summary = ['MCP health', ...serverLines, browserLine, queueLine].join('\n');
        return buildMessage('health', 'MCP', summary, 'success', health, health);
    }

    function buildCommandErrorMessage(message, details = {}) {
        return buildMessage('mcp_command', 'MCP Command', `MCP command blocked: ${message}`, 'failed', details, { message, details });
    }

    function buildParserErrorMessages(errors = []) {
        return errors.slice(0, 3).map(error => buildMessage(
            error.code || 'mcp_parser',
            'MCP Parser',
            `MCP tool request blocked: ${error.message || 'Invalid tool request.'}`,
            'failed',
            error.details || {},
            error
        ));
    }

    function buildDebugMessage(report) {
        return buildMessage('debug', 'MCP', String(report || ''), 'success', {}, report || '');
    }

    function buildMessage(toolName, serverName, content, status = 'success', args = {}, rawOutput = null) {
        const redactedArgs = host.redactSecrets ? host.redactSecrets(args || {}) : (args || {});
        const redactedRaw = host.redactSecrets ? host.redactSecrets(rawOutput ?? { content, args: redactedArgs }) : (rawOutput ?? { content, args: redactedArgs });
        return {
            role: 'tool_result',
            content: String(content || ''),
            timestamp: Date.now(),
            attachments: [],
            status,
            toolName,
            serverName,
            toolArgs: redactedArgs,
            toolPreview: String(content || ''),
            toolImages: [],
            toolRawOutput: typeof redactedRaw === 'string' ? redactedRaw : JSON.stringify(redactedRaw, null, 2)
        };
    }

    function summarizeExecution(execution = {}) {
        const server = execution.serverName || 'MCP';
        const tool = execution.toolName || execution.name || 'tool';
        if (execution.status !== 'success') return `${server} / ${tool} ${execution.status || 'error'}: ${execution.error || 'No output'}`;
        const result = execution.result || {};
        if (result.screenshotBase64) return `${server} captured a browser screenshot${result.url ? ` from ${result.url}` : ''}.`;
        if (result.title && result.url && result.text) return `${server} extracted text from "${result.title}".`;
        if (result.title && result.url) return `${server} opened "${result.title}".`;
        if (result.path && typeof result.content === 'string') return `${server} read ${result.path}.`;
        if (Array.isArray(result.files)) return `${server} listed ${result.files.length} files${result.path ? ` in ${result.path}` : ''}.`;
        if (Array.isArray(result.folders)) return `${server} listed ${result.files?.length || 0} files and ${result.folders.length} folders.`;
        if (Array.isArray(result.memories)) return `${server} returned ${result.memories.length} memories.`;
        if (result.content && result.id) return `${server} saved memory ${result.id}.`;
        if (Array.isArray(result)) return `${server} returned ${result.length} item(s) from ${tool}.`;
        if (typeof result === 'string') return result.slice(0, 4000);
        return `${server} completed ${tool}.`;
    }

    function sanitizeToolResult(result) {
        const redacted = host.redactSecrets ? host.redactSecrets(redactToolImages(result)) : redactToolImages(result);
        const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted, null, 2);
        return text.length > 200000 ? `${text.slice(0, 200000)}\n\n[Output truncated]` : text;
    }

    function stringifyToolOutput(value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return text.length > 20000 ? `${text.slice(0, 20000)}\n\n[Output truncated]` : text;
    }

    function extractToolImages(value, images = []) {
        if (images.length >= 8 || value == null) return images;
        if (typeof value === 'string') {
            const image = normalizeImageData(value);
            if (image) images.push(image);
            return images;
        }
        if (Array.isArray(value)) {
            for (const item of value) extractToolImages(item, images);
            return images;
        }
        if (typeof value === 'object') {
            for (const [key, item] of Object.entries(value)) {
                if (typeof item === 'string') {
                    const image = normalizeImageData(item, key);
                    if (image) images.push(image);
                } else {
                    extractToolImages(item, images);
                }
                if (images.length >= 8) break;
            }
        }
        return images;
    }

    function normalizeImageData(value, key = '') {
        const text = String(value || '').trim();
        const hint = String(key || '').toLowerCase();
        const dataUrlMatch = text.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
        if (dataUrlMatch) {
            const mime = dataUrlMatch[1].toLowerCase() === 'jpg' ? 'jpeg' : dataUrlMatch[1].toLowerCase();
            return { mimeType: `image/${mime}`, src: `data:image/${mime};base64,${dataUrlMatch[2].replace(/\s+/g, '')}`, alt: 'Tool image' };
        }
        const compact = text.replace(/\s+/g, '');
        const keySuggestsImage = /screenshot|image|png|jpeg|jpg|base64|data/.test(hint);
        if ((keySuggestsImage || compact.length > 1000) && compact.startsWith('iVBOR')) return { mimeType: 'image/png', src: `data:image/png;base64,${compact}`, alt: 'Tool PNG image' };
        if ((keySuggestsImage || compact.length > 1000) && compact.startsWith('/9j/')) return { mimeType: 'image/jpeg', src: `data:image/jpeg;base64,${compact}`, alt: 'Tool JPEG image' };
        return null;
    }

    function redactToolImages(value) {
        if (value == null) return value;
        if (typeof value === 'string') return normalizeImageData(value) ? `[base64 image ${value.length} chars]` : value;
        if (Array.isArray(value)) return value.map(redactToolImages);
        if (typeof value === 'object') {
            const out = {};
            for (const [key, item] of Object.entries(value)) {
                out[key] = typeof item === 'string' && normalizeImageData(item, key)
                    ? `[base64 image ${item.length} chars]`
                    : redactToolImages(item);
            }
            return out;
        }
        return value;
    }

    host._extend({
        renderToolResult,
        buildToolResultApiMessage,
        buildToolListSummary,
        buildToolListMessage,
        buildHealthMessage,
        buildCommandErrorMessage,
        buildParserErrorMessages,
        buildDebugMessage,
        sanitizeToolResult,
        extractToolImages,
        redactToolImages
    });
})(window);
