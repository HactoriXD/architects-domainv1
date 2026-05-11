// MCP Prompt Injection
// ============================================
function buildMcpRuntimeContextMessage() {
    const mode = state.mcpControl?.toolCallingMode || 'native';
    if (typeof isMcpToolsEnabled === 'function' && !isMcpToolsEnabled()) return null;
    if (mode === 'disabled') return null;
    if (state.provider === 'nanogpt') return null;
    const tools = buildMcpToolSummaries(24);
    if (!tools.length) return null;
    const lines = tools.map(tool => `- ${tool.name}: ${tool.server} / ${tool.displayName} (${tool.safety}) - ${tool.description || 'No description'}`);
    const protocol = mode === 'xml'
        ? `For MCP tool use, output exactly one XML block and no prose:\n<tool_call>\n{"serverId":"server-id","tool":"tool_name","arguments":{}}\n</tool_call>`
        : mode === 'json'
            ? `For MCP tool use, output exactly one JSON object and no prose:\n{"serverId":"server-id","tool":"tool_name","arguments":{}}`
            : `If native tool calls are unavailable, request exactly one tool call by outputting only this JSON object and no prose:\n{"mcp_tool":"tool-name-from-list","arguments":{}}`;
    return {
        role: 'system',
        content: `Available MCP tools are connected and executable in this app. Do not claim you cannot access a configured source when a relevant MCP tool is listed. Use tools when the user asks to inspect GitHub, files, repositories, issues, commits, local git changes, app health, bridge health, web pages, or notes. Prefer read-only calls; destructive or mutating calls require user approval.\n\n${protocol}\n\nScreenshots and images captured by Puppeteer tools are automatically rendered inline in the tool result card above your response. Never include base64 image data in your text response. Simply describe what you see in the screenshot in plain language.\n\nTools:\n${lines.join('\n')}`
    };
}
