// MCP Tool Router
// ============================================
function extractProviderToolCallsFromChunk(delta) {
    return delta?.tool_calls || [];
}

function parseProviderToolCallsFromMessage(message) {
    return (message?.tool_calls || []).map(call => ({
        id: call.id || generateId(),
        name: providerToolNameToMcpName(call.function?.name || call.name || ''),
        arguments: parseToolArguments(call.function?.arguments || call.arguments || '{}')
    })).filter(call => call.name);
}

function parseToolArguments(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return {};
    }
}

function buildAssistantToolCallMessage(content, toolCalls) {
    return {
        role: 'assistant',
        content: content || '',
        tool_calls: toolCalls.map(call => ({
            id: call.id,
            type: 'function',
            function: {
                name: mcpToolNameToProviderName(call.name),
                arguments: JSON.stringify(call.arguments || {})
            }
        }))
    };
}

function parseFallbackMcpToolCall(content) {
    if (state.mcpControl?.toolCallingMode === 'disabled') return [];
    const text = String(content || '').trim();
    const candidates = [];
    const xmlMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
    if (xmlMatch) candidates.push(xmlMatch[1]);
    const legacyMatch = text.match(/\{[\s\S]*"mcp_tool"[\s\S]*\}/);
    if (legacyMatch) candidates.push(legacyMatch[0]);
    const jsonMatch = text.match(/\{[\s\S]*"(serverId|tool)"[\s\S]*\}/);
    if (jsonMatch && !candidates.includes(jsonMatch[0])) candidates.push(jsonMatch[0]);
    const calls = [];
    state.mcpControl.parserErrors = [];
    for (const raw of candidates) {
        try {
            const parsed = JSON.parse(raw);
            const validation = validateParsedMcpToolCall(parsed);
            if (!validation.valid) {
                state.mcpControl.parserErrors.push(validation.error);
                continue;
            }
            calls.push(validation.call);
        } catch (error) {
            state.mcpControl.parserErrors.push({ code: 'INVALID_TOOL_JSON', message: 'Tool call JSON is malformed.', details: error.message || String(error) });
        }
    }
    return calls;
}

function validateParsedMcpToolCall(parsed) {
    const activeTools = getActiveMcpTools();
    const serverId = String(parsed.serverId || '').trim();
    const toolName = String(parsed.tool || parsed.mcp_tool || '').trim();
    const args = parsed.arguments && typeof parsed.arguments === 'object' && !Array.isArray(parsed.arguments) ? parsed.arguments : {};
    let tool = null;
    if (serverId && toolName) {
        tool = activeTools.find(item => item.serverId === serverId && (item.name === toolName || getMcpToolQualifiedName(item) === `${serverId}:${toolName}`));
    }
    if (!tool && toolName) tool = activeTools.find(item => getMcpToolQualifiedName(item) === toolName || item.name === toolName);
    if (!tool) return { valid: false, error: { code: 'MCP_TOOL_NOT_AVAILABLE', message: 'Requested MCP tool is not active or enabled in this chat.', details: { serverId, tool: toolName } } };
    const server = getWorkspaceMcpServers().find(item => item.id === tool.serverId);
    if (!server || !isMcpServerActiveInCurrentChat(server)) return { valid: false, error: { code: 'MCP_SERVER_INACTIVE', message: 'The requested MCP server is inactive in this chat.', details: { serverId: tool.serverId } } };
    if (!isMcpToolEnabledForChat(server, tool)) return { valid: false, error: { code: 'MCP_TOOL_DISABLED', message: 'The requested MCP tool is disabled by permissions.', details: { tool: tool.name } } };
    const schemaError = validateMcpArgumentsAgainstSchema(args, tool.inputSchema);
    if (schemaError) return { valid: false, error: { code: 'MCP_ARGUMENTS_INVALID', message: schemaError, details: { tool: tool.name, arguments: args } } };
    return { valid: true, call: { id: generateId(), name: getMcpToolQualifiedName(tool), arguments: args, source: parsed.serverId ? 'non-native' : 'legacy' } };
}

function validateMcpArgumentsAgainstSchema(args, schema = {}) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
        if (!(key in args)) return `Missing required argument: ${key}`;
    }
    const props = schema.properties || {};
    for (const [key, value] of Object.entries(args)) {
        const expected = props[key]?.type;
        if (!expected || expected === 'any') continue;
        if (expected === 'array' && !Array.isArray(value)) return `${key} must be an array`;
        if (expected === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return `${key} must be an object`;
        if (['string', 'number', 'boolean'].includes(expected) && typeof value !== expected) return `${key} must be ${expected}`;
    }
    return '';
}

function inferMcpToolCallsFromMessages(messages) {
    const lastUser = [...messages].reverse().find(message => message.role === 'user');
    const text = typeof lastUser?.content === 'string'
        ? lastUser.content.toLowerCase()
        : JSON.stringify(lastUser?.content || '').toLowerCase();
    if (!text || !/\b(mcp|tool|github|repo|repository|issues?|commits?|files?|readme|access|health|bridge|port|git|diff|changed|status|fetch|url|website|notes?|vault)\b/.test(text)) return [];

    const tools = getActiveMcpTools();
    const githubTool = name => tools.find(tool => tool.name === name);
    const filesystemTool = name => tools.find(tool => tool.name === name);
    const byName = name => tools.find(tool => tool.name === name);
    let tool = null;
    let args = {};

    if (/\bapp health|app status|self.inspect|self inspect|diagnostic|diagnostics|check app\b/.test(text)) {
        tool = byName('app.health') || byName('app.project_structure');
    } else if (/\bbridge|port|server running|mcp.*health|health.*mcp\b/.test(text)) {
        tool = byName('bridge.health') || byName('bridge.environment');
    } else if (/\bgit|diff|changed|local changes|status\b/.test(text) && !/\bgithub\b/.test(text)) {
        if (/\bbranch/.test(text)) tool = byName('git.branches');
        else if (/\bcommit|history/.test(text)) tool = byName('git.recent_commits');
        else if (/\bdiff|changed|changes\b/.test(text)) tool = byName('git.diff_summary');
        else tool = byName('git.status');
    } else if (/\bnotes?|vault\b/.test(text)) {
        if (/\bsearch\b/.test(text)) {
            tool = byName('notes.search_notes');
            args.query = text.replace(/.*\bsearch\b/i, '').trim().slice(0, 80) || 'Architect';
        } else if (/\bread\b/.test(text)) tool = byName('notes.read_note');
        else tool = byName('notes.list_notes');
    } else if (/\bfetch|url|website|web page|http[s]?:\/\//.test(text)) {
        tool = byName('web.fetch_readable') || byName('web.fetch_url');
        const urlMatch = text.match(/https?:\/\/\S+/);
        if (urlMatch) args.url = urlMatch[0].replace(/[),.]+$/g, '');
    } else if (/\bgithub|repo|repository|issues?|commits?|readme\b/.test(text)) {
        if (/\bissue/.test(text)) {
            tool = githubTool('github.list_issues');
            args.limit = 10;
        } else if (/\bcommit/.test(text)) {
            tool = githubTool('github.list_commits');
            args.limit = 10;
        }
        else if (/\breadme\b|read\s+file/.test(text)) {
            tool = githubTool('github.read_file');
            args.path = 'README.md';
        } else if (/\bfiles?|list\b/.test(text)) {
            tool = githubTool('github.list_files');
            args.path = '';
        }
        else tool = githubTool('github.get_repo');
    }

    if (!tool && /\bfile|folder|filesystem|local\b/.test(text)) {
        if (/\bsearch\b/.test(text)) {
            tool = filesystemTool('filesystem.search_files');
            args.query = text.replace(/.*\bsearch\b/i, '').trim().slice(0, 80) || 'Architect';
        }
        else if (/\bread\b/.test(text)) tool = filesystemTool('filesystem.read_file');
        else tool = filesystemTool('filesystem.list_files');
    }

    if (!tool && /\bmcp|tool/.test(text)) {
        tool = githubTool('github.get_repo') || filesystemTool('filesystem.list_files') || tools[0];
    }

    return tool ? [{ id: generateId(), name: getMcpToolQualifiedName(tool), arguments: args }] : [];
}
