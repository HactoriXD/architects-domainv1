// MCP SSE Helpers
// ============================================
function parseMcpSsePayload(text) {
    const events = String(text || '').split(/\r?\n\r?\n/).filter(Boolean);
    for (const event of events) {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.replace(/^data:\s?/, '')).join('\n');
        if (!data || data === '[DONE]') continue;
        try {
            return JSON.parse(data);
        } catch (error) {
            continue;
        }
    }
    throw new Error('Empty MCP event stream response');
}
