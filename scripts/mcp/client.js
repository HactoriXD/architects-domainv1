// Browser HTTP MCP Client
    // ============================================
    async function mcpRpc(endpoint, method, params = {}) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: generateId(),
                method,
                params
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await parseMcpHttpResponse(response);
        if (payload.error) throw new Error(payload.error.message || 'MCP request failed');
        return payload.result;
    }

    async function parseMcpHttpResponse(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
            const text = await response.text();
            const dataLine = text.split(/\r?\n/).find(line => line.startsWith('data: '));
            if (!dataLine) throw new Error('Empty MCP event stream response');
            return JSON.parse(dataLine.slice(6));
        }
        return response.json();
    }

    async function testMcpEndpoint(endpoint) {
        if (!endpoint) throw new Error('Missing endpoint');
        const initializeResult = await mcpRpc(endpoint, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: CONFIG.SITE_NAME, version: '1.0.0' }
        });
        let tools = [];
        try {
            const listResult = await mcpRpc(endpoint, 'tools/list');
            tools = (listResult?.tools || []).map(tool => ({
                kind: 'tool',
                name: tool.name || 'unnamed-tool',
                description: tool.description || ''
            }));
        } catch (error) {
            tools = [];
        }
        return {
            serverInfo: initializeResult?.serverInfo || null,
            capabilities: tools
        };
    }
