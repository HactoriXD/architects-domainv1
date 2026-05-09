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
