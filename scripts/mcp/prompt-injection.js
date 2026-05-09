// MCP Prompt Injection
// ============================================
function buildMcpRuntimeContextMessage() {
    const tools = buildMcpToolSummaries(24);
    if (!tools.length) return null;
    const lines = tools.map(tool => `- ${tool.name}: ${tool.server} / ${tool.displayName} (${tool.safety}) - ${tool.description || 'No description'}`);
    return {
        role: 'system',
        content: `Available MCP tools. Use tools only when they materially help answer the user. Prefer read-only calls; destructive or mutating calls require user approval. Tool names below are compact routing identifiers.\n\n${lines.join('\n')}`
    };
}
