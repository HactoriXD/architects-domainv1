// MCP Permissions
// ============================================
function requiresMcpApproval(tool) {
    const safety = tool?.safety || inferMcpToolSafety(tool?.name, tool?.description);
    return safety !== 'read';
}

function requestMcpToolApproval(tool, args) {
    const prettyArgs = JSON.stringify(args || {}, null, 2).slice(0, 1200);
    return confirm(`Allow MCP tool call?\n\n${tool.serverName || 'MCP'} / ${tool.name}\nSafety: ${tool.safety || 'unknown'}\n\nArguments:\n${prettyArgs}`);
}

function sanitizeMcpToolResult(result) {
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return text.length > 200000 ? `${text.slice(0, 200000)}\n\n[Output truncated]` : text;
}
