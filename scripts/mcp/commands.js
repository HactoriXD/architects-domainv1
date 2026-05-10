// Architect's Domain MCP Commands
// ============================================
(function initArchitectMcpCommands(global) {
    const host = global.ArchitectMCP;
    if (!host) return;

    const GENERIC_MISSING_ARG = 'Missing URL/path/content.';

    function parseDirectCommand(input = '') {
        const raw = String(input || '').trim();
        if (!raw) return { handled: false };
        if (global.state?.mcpControl?.toolCallingMode === 'disabled') return { handled: false };

        const slash = parseSlashCommand(raw);
        if (slash.handled) return slash;

        const inferred = parseConservativeNaturalCommand(raw);
        if (inferred.handled) return inferred;

        return { handled: false };
    }

    function parseSlashCommand(raw) {
        if (/^\/mcp(?:\s|$)/i.test(raw)) return parseMcpCommand(raw.replace(/^\/mcp(?:\s+)?/i, ''), raw);
        if (/^\/(?:browser|puppeteer)(?:\s|$)/i.test(raw)) return parseBrowserCommand(raw);
        if (/^\/(?:fs|file)(?:\s|$)/i.test(raw)) return parseFilesystemCommand(raw);
        if (/^\/memory(?:\s|$)/i.test(raw)) return parseMemoryCommand(raw);
        return { handled: false };
    }

    function parseMcpCommand(rest, raw) {
        const tail = String(rest || '').trim();
        if (!tail) return command('list_tools', { raw, family: 'mcp', action: 'tools' });
        const tokens = splitCommandLine(tail);
        const action = String(tokens[0] || '').toLowerCase();
        const remainder = tail.slice(tokens[0]?.length || 0).trim();

        if (['tools', 'list'].includes(action)) return command('list_tools', { raw, family: 'mcp', action });
        if (action === 'servers') return command('list_servers', { raw, family: 'mcp', action });
        if (action === 'health') return command('health', { raw, family: 'mcp', action });
        if (action === 'debug') return command('debug', { raw, family: 'mcp', action });
        if (action === 'refresh') return command('refresh', { raw, family: 'mcp', action });
        if (action === 'reset') return command('reset', { raw, family: 'mcp', action, target: tokens[1] || '' });
        if (action === 'help') return command('help', { raw, family: 'mcp', action });
        if (action === 'resources') return command('resources', { raw, family: 'mcp', action, target: tokens[1] || '' });
        if (action === 'prompts') return command('prompts', { raw, family: 'mcp', action, target: tokens[1] || '' });
        if (action === 'read_resource') return command('read_resource', { raw, family: 'mcp', action, uri: tokens.slice(1).join(' ') });
        if (action === 'prompt') return command('prompt', { raw, family: 'mcp', action, name: tokens.slice(1).join(' ') });
        if (action === 'inspect') return parseInspectCommand(remainder, raw);
        if (action === 'call') return parseMcpCallCommand(remainder, raw);

        if (isBrowserCommandName(action)) {
            const toolName = action === 'browser_open' ? 'browser_navigate' : action;
            return buildToolCommand(toolName, inferArgumentsForTool(toolName, remainder), raw, 'mcp', action);
        }
        if (action === 'memory_store') return buildToolCommand('memory_store', { content: remainder }, raw, 'mcp', action);
        if (['read_file', 'filesystem_read', 'filesystem_read_file'].includes(action)) return buildToolCommand(action, { path: cleanTarget(remainder) }, raw, 'mcp', action);
        if (['write_file', 'filesystem_write', 'filesystem_write_file'].includes(action)) {
            const parsed = parsePathAndContent(remainder);
            return buildToolCommand(action, parsed, raw, 'mcp', action);
        }

        return commandError('Unknown MCP command or tool not available.', { command: action, raw });
    }

    function parseBrowserCommand(raw) {
        const match = raw.match(/^\/(browser|puppeteer)(?:\s+(.+))?$/i);
        const family = (match?.[1] || 'browser').toLowerCase();
        const tail = String(match?.[2] || '').trim();
        if (!tail) return command('help', { raw, family, action: 'help' });
        const tokens = splitCommandLine(tail);
        const action = String(tokens[0] || '').toLowerCase();
        const remainder = tail.slice(tokens[0]?.length || 0).trim();
        if (['status'].includes(action)) return command('browser_status', { raw, family, action });
        if (['reset'].includes(action)) return command('browser_reset', { raw, family, action });
        const toolName = {
            open: 'browser_navigate',
            navigate: 'browser_navigate',
            go: 'browser_navigate',
            screenshot: 'browser_screenshot',
            shot: 'browser_screenshot',
            text: 'browser_extract_text',
            read: 'browser_extract_text',
            extract: 'browser_extract_text',
            extract_text: 'browser_extract_text',
            html: 'browser_extract_html',
            title: 'browser_title',
            click: 'browser_click',
            type: 'browser_type',
            press: 'browser_press',
            wait: 'browser_wait'
        }[action];
        if (!toolName) return commandError('Unknown MCP command or tool not available.', { command: action, raw });
        if (['browser_navigate'].includes(toolName) && !extractUrl(remainder)) return commandError(GENERIC_MISSING_ARG, { tool: toolName });
        if (toolName === 'browser_click') return buildToolCommand(toolName, { selector: tokens[1] || '', text: tokens.slice(1).join(' ') }, raw, family, action);
        if (toolName === 'browser_type') return buildToolCommand(toolName, { selector: tokens[1] || '', text: tokens.slice(2).join(' ') }, raw, family, action);
        if (toolName === 'browser_wait') return buildToolCommand(toolName, { ms: Number(tokens[1]) || 0 }, raw, family, action);
        return buildToolCommand(toolName, inferArgumentsForTool(toolName, remainder), raw, family, action);
    }

    function parseFilesystemCommand(raw) {
        const match = raw.match(/^\/(?:fs|file)\s+(\S+)(?:\s+([\s\S]*))?$/i);
        const action = String(match?.[1] || '').toLowerCase();
        const rest = String(match?.[2] || '').trim();
        if (action !== 'read') return commandError('Unknown MCP command or tool not available.', { command: action, raw });
        if (!rest) return commandError(GENERIC_MISSING_ARG, { command: action });
        return buildToolCommand('read_file', { path: cleanTarget(rest) }, raw, 'filesystem', action);
    }

    function parseMemoryCommand(raw) {
        const match = raw.match(/^\/memory\s+(\S+)(?:\s+([\s\S]*))?$/i);
        const action = String(match?.[1] || '').toLowerCase();
        const rest = String(match?.[2] || '').trim();
        if (action === 'store') {
            if (!rest) return commandError(GENERIC_MISSING_ARG, { command: action });
            return buildToolCommand('memory_store', { content: rest }, raw, 'memory', action);
        }
        if (action === 'search') {
            if (!rest) return commandError(GENERIC_MISSING_ARG, { command: action });
            return buildToolCommand('memory_recall', { query: rest }, raw, 'memory', action);
        }
        if (action === 'list') return buildToolCommand('memory_list', {}, raw, 'memory', action);
        return commandError('Unknown MCP command or tool not available.', { command: action, raw });
    }

    function parseInspectCommand(remainder, raw) {
        const name = splitCommandLine(remainder)[0] || '';
        if (!name) return commandError('Missing tool name.', { command: 'inspect' });
        const resolved = host.resolveToolName ? host.resolveToolName(name) : { ok: false, error: host.parserError?.('MCP_TOOL_NOT_AVAILABLE', 'Tool not available.', { tool: name }) };
        if (!resolved.ok) return commandError(resolved.error?.message || 'Tool not available.', resolved.error?.details || {});
        return command('inspect_tool', { raw, family: 'mcp', action: 'inspect', tool: resolved.tool });
    }

    function parseMcpCallCommand(remainder, raw) {
        const tokens = splitCommandLine(remainder);
        const toolName = tokens[0] || '';
        if (!toolName) return commandError('Missing tool name.', { command: 'call' });
        const argText = remainder.slice(toolName.length).trim();
        return buildToolCommand(toolName, inferArgumentsForTool(toolName, argText), raw, 'mcp', 'call');
    }

    function parseConservativeNaturalCommand(raw) {
        const text = String(raw || '').trim();
        const lower = text.toLowerCase();
        if (/^(?:use\s+)?mcp\s+tools?\.?$/.test(lower) || /^show\s+mcp\s+tools?\.?$/.test(lower)) {
            return command('list_tools', { raw, family: 'natural', action: 'tools', source: 'inferred' });
        }
        const url = extractUrl(text);
        const mentionsBrowser = /\b(browser|puppeteer)\b/i.test(text) || /\bbrowser_(?:navigate|screenshot|extract_text)\b/i.test(text);
        const mentionsMcp = /\bmcp\b/i.test(text);
        if (url && mentionsBrowser && (mentionsMcp || /\b(use|with|using)\b/i.test(text))) {
            let toolName = 'browser_screenshot';
            if (/\b(browser_extract_text|extract_text|extract|text|read page|read the page)\b/i.test(text)) toolName = 'browser_extract_text';
            else if (/\b(browser_navigate|navigate|open|go to)\b/i.test(text)) toolName = 'browser_navigate';
            else if (/\b(browser_screenshot|screenshot|see|look|inspect visually)\b/i.test(text)) toolName = 'browser_screenshot';
            return buildToolCommand(toolName, { url }, raw, 'natural', 'infer-browser', 'inferred');
        }
        return { handled: false };
    }

    function buildToolCommand(toolName, args, raw, family = 'mcp', action = 'call', source = 'direct-command') {
        const normalized = host.normalizeToolRequest
            ? host.normalizeToolRequest({ tool: toolName, arguments: args || {} }, { source, raw })
            : { ok: false, error: { message: 'MCP parser is not ready.', details: {} } };
        if (!normalized.ok) {
            const message = normalized.error?.code === 'MCP_ARGUMENTS_INVALID'
                ? normalized.error.message
                : normalized.error?.code === 'MCP_TOOL_NOT_AVAILABLE'
                    ? 'Unknown MCP command or tool not available.'
                    : normalized.error?.message || 'Unknown MCP command or tool not available.';
            return commandError(message, normalized.error?.details || {});
        }
        return command('tool_calls', { raw, family, action, toolCalls: [normalized.call], valid: true });
    }

    function inferArgumentsForTool(toolName, rawArgs) {
        const text = String(rawArgs || '').trim();
        if (!text) return {};
        if (text.startsWith('{')) {
            const parsed = host.parseJsonWithSafeRepair ? host.parseJsonWithSafeRepair(text) : safeJsonParse(text);
            if (parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) return parsed.value;
        }
        const name = String(toolName || '').toLowerCase();
        if (name.includes('browser') || name.includes('puppeteer')) return { url: extractUrl(text) || cleanTarget(text) };
        if (name.includes('memory')) return { content: text };
        if (name.includes('read') || name.includes('file') || name.includes('filesystem')) return { path: cleanTarget(text) };
        return text ? { value: text } : {};
    }

    function parsePathAndContent(input) {
        const tokens = splitCommandLine(input);
        return { path: cleanTarget(tokens[0] || ''), content: tokens.slice(1).join(' ') };
    }

    async function executeDirectCommand(commandOrInput, options = {}) {
        const parsed = typeof commandOrInput === 'string' ? parseDirectCommand(commandOrInput) : commandOrInput;
        if (!parsed?.handled) return { handled: false, messages: [] };
        const messages = [];
        const executions = [];
        try {
            if (parsed.error) messages.push(buildMessage('mcp_command', 'MCP Command', parsed.error, 'failed', parsed.details));
            else if (parsed.type === 'list_tools') messages.push(buildToolListMessage());
            else if (parsed.type === 'list_servers') messages.push(buildServerListMessage());
            else if (parsed.type === 'health') messages.push(buildHealthMessage());
            else if (parsed.type === 'debug') messages.push(buildDebugMessage());
            else if (parsed.type === 'refresh') messages.push(await buildRefreshMessage());
            else if (parsed.type === 'reset') messages.push(await buildResetMessage(parsed.target));
            else if (parsed.type === 'browser_status') messages.push(buildBrowserStatusMessage());
            else if (parsed.type === 'browser_reset') messages.push(await buildResetMessage('browser'));
            else if (parsed.type === 'resources') messages.push(buildResourceListMessage(parsed.target));
            else if (parsed.type === 'prompts') messages.push(buildPromptListMessage(parsed.target));
            else if (parsed.type === 'read_resource') messages.push(await buildReadResourceMessage(parsed.uri));
            else if (parsed.type === 'prompt') messages.push(buildPromptMessage(parsed.name));
            else if (parsed.type === 'inspect_tool') messages.push(buildInspectToolMessage(parsed.tool));
            else if (parsed.type === 'help') messages.push(buildHelpMessage());
            else if (parsed.type === 'tool_calls') {
                for (const call of parsed.toolCalls || []) {
                    const execution = await host.executeToolCall(call, { source: call.source || 'direct-command', timeoutMs: options.timeoutMs });
                    executions.push(execution);
                    messages.push(host.renderToolResult ? host.renderToolResult(execution) : buildMessage(execution.toolName, execution.serverName, execution.error || execution.status, execution.status));
                }
            } else {
                messages.push(buildHelpMessage());
            }
        } catch (error) {
            messages.push(buildMessage('mcp_command', 'MCP Command', error.message || 'MCP command failed.', 'failed', parsed));
        }
        return { handled: true, command: parsed, messages: messages.filter(Boolean), executions };
    }

    function buildToolListMessage() {
        if (host.buildToolListMessage) return host.buildToolListMessage();
        return buildMessage('tools', 'MCP', buildToolListSummary(), 'success', {});
    }

    function buildServerListMessage() {
        const servers = host.listServers ? host.listServers() : [];
        const summary = servers.length
            ? servers.map(server => `${server.name || server.id}: ${server.status || 'unknown'} (${server.tools?.length || 0} tools)`).join('\n')
            : 'No MCP servers are registered.';
        return buildMessage('servers', 'MCP', summary, 'success', { servers });
    }

    function buildHealthMessage() {
        if (host.buildHealthMessage) return host.buildHealthMessage(host.getHealth());
        return buildMessage('health', 'MCP', JSON.stringify(host.getHealth ? host.getHealth() : {}, null, 2), 'success', {});
    }

    function buildDebugMessage() {
        const report = host.buildDebugReport ? host.buildDebugReport() : 'Architect MCP debug report unavailable.';
        return buildMessage('debug', 'MCP', report, 'success', {});
    }

    async function buildRefreshMessage() {
        const result = host.refreshServers ? await host.refreshServers() : [];
        return buildMessage('refresh', 'MCP', `MCP refresh complete: ${result.length} server checks.`, 'success', { result });
    }

    async function buildResetMessage(target = '') {
        const result = target ? await host.resetSession(target) : await host.resetAllSessions();
        const label = target ? `MCP reset complete for ${target}.` : 'MCP reset complete.';
        return buildMessage('reset', 'MCP', label, 'success', result);
    }

    function buildBrowserStatusMessage() {
        const health = host.getHealth ? host.getHealth() : {};
        const browser = health.browser || {};
        const summary = browser.currentUrl
            ? `Browser session is ${browser.open ? 'open' : 'closed'} at ${browser.currentUrl}.`
            : `Browser session is ${browser.open ? 'open' : 'closed'}.`;
        return buildMessage('browser_status', 'Puppeteer Browser', summary, 'success', browser);
    }

    function buildResourceListMessage(target = '') {
        const resources = (host.listResources ? host.listResources() : []).filter(item => !target || item.serverId === target || item.serverName === target);
        const summary = resources.length
            ? resources.map(item => `- ${item.name || item.uri} (${item.serverName || item.serverId})`).join('\n')
            : 'No resources exposed by active MCP servers.';
        return buildMessage('resources', 'MCP', summary, 'success', { resources });
    }

    function buildPromptListMessage(target = '') {
        const prompts = (host.listPrompts ? host.listPrompts() : []).filter(item => !target || item.serverId === target || item.serverName === target);
        const summary = prompts.length
            ? prompts.map(item => `- ${item.name || item.id} (${item.serverName || item.serverId})`).join('\n')
            : 'No prompts exposed by active MCP servers.';
        return buildMessage('prompts', 'MCP', summary, 'success', { prompts });
    }

    async function buildReadResourceMessage(uri) {
        const target = String(uri || '').trim();
        if (!target) return buildMessage('read_resource', 'MCP', 'Missing resource URI.', 'failed', {});
        const resources = host.listResources ? host.listResources() : [];
        const resource = resources.find(item => item.uri === target);
        if (!resource) return buildMessage('read_resource', 'MCP', 'Resource not available.', 'failed', { uri: target });
        if (typeof mcpRuntimeReadResource !== 'function') return buildMessage('read_resource', resource.serverName || 'MCP', 'Resource reading is not supported by this MCP runtime.', 'failed', { uri: target });
        const server = (typeof getWorkspaceMcpServers === 'function' ? getWorkspaceMcpServers() : []).find(item => item.id === resource.serverId);
        if (!server) return buildMessage('read_resource', 'MCP', 'Resource server is not available.', 'failed', { uri: target });
        const result = await mcpRuntimeReadResource(server, target);
        return buildMessage('read_resource', resource.serverName || 'MCP', typeof result === 'string' ? result : JSON.stringify(result, null, 2), 'success', { uri: target }, result);
    }

    function buildPromptMessage(name) {
        const target = String(name || '').trim();
        if (!target) return buildMessage('prompt', 'MCP', 'Missing prompt name.', 'failed', {});
        const prompts = host.listPrompts ? host.listPrompts() : [];
        const prompt = prompts.find(item => item.name === target || item.id === target);
        if (!prompt) return buildMessage('prompt', 'MCP', 'Prompt not available.', 'failed', { name: target });
        return buildMessage('prompt', prompt.serverName || 'MCP', prompt.description || prompt.name || target, 'success', prompt, prompt);
    }

    function buildInspectToolMessage(tool) {
        const body = `${tool.serverName || 'MCP'} / ${tool.name}\n${tool.description || 'No description.'}`;
        return buildMessage('inspect', tool.serverName || 'MCP', body, 'success', { tool: tool.name, schema: tool.inputSchema || {} }, tool);
    }

    function buildHelpMessage() {
        const help = [
            'MCP commands:',
            '/mcp tools',
            '/mcp health',
            '/mcp refresh',
            '/mcp reset [server]',
            '/mcp debug',
            '/mcp call <tool_name> <json_or_args>',
            '/browser navigate <url>',
            '/browser screenshot [url]',
            '/browser text [url]',
            '/memory store <content>',
            '/fs read <path>'
        ].join('\n');
        return buildMessage('help', 'MCP', help, 'success', {});
    }

    function buildMessage(toolName, serverName, content, status = 'success', args = {}, rawOutput = null) {
        return {
            role: 'tool_result',
            content: String(content || ''),
            timestamp: Date.now(),
            attachments: [],
            status,
            toolName,
            serverName,
            toolArgs: host.redactSecrets ? host.redactSecrets(args || {}) : (args || {}),
            toolPreview: String(content || ''),
            toolImages: [],
            toolRawOutput: typeof rawOutput === 'string'
                ? rawOutput
                : JSON.stringify(host.redactSecrets ? host.redactSecrets(rawOutput ?? { content, args }) : (rawOutput ?? { content, args }), null, 2)
        };
    }

    function command(type, fields = {}) {
        return {
            handled: true,
            kind: 'mcp_direct_command',
            type,
            valid: fields.valid !== false,
            ...fields
        };
    }

    function commandError(error, details = {}) {
        return command('error', { error, details, valid: false });
    }

    function isBrowserCommandName(name) {
        return ['browser_navigate', 'browser_open', 'browser_screenshot', 'browser_extract_text'].includes(name);
    }

    function splitCommandLine(input = '') {
        const tokens = [];
        const text = String(input || '');
        let current = '';
        let quote = '';
        let escape = false;
        for (const char of text) {
            if (escape) {
                current += char;
                escape = false;
                continue;
            }
            if (char === '\\') {
                escape = true;
                continue;
            }
            if (quote) {
                if (char === quote) quote = '';
                else current += char;
                continue;
            }
            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }
            if (/\s/.test(char)) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
                continue;
            }
            current += char;
        }
        if (current) tokens.push(current);
        return tokens;
    }

    function extractUrl(value) {
        const match = String(value || '').match(/\bhttps?:\/\/[^\s<>"']+|\blocalhost:\d+(?:\/[^\s<>"']*)?|\b127\.0\.0\.1:\d+(?:\/[^\s<>"']*)?/i);
        const raw = match ? cleanTarget(match[0]) : '';
        return host.normalizeUrl ? host.normalizeUrl(raw) : raw;
    }

    function cleanTarget(value) {
        return String(value || '').trim().replace(/^on\s+/i, '').replace(/^["']|["']$/g, '').replace(/[),.;]+$/g, '');
    }

    function safeJsonParse(text) {
        try {
            return { ok: true, value: JSON.parse(text) };
        } catch (error) {
            return { ok: false, error: error.message || 'Invalid JSON' };
        }
    }

    function buildToolListSummary() {
        if (host.buildToolListSummary) return host.buildToolListSummary();
        const groups = groupTools(host.listTools ? host.listTools() : []);
        return Object.entries(groups).map(([label, tools]) => {
            const values = tools.length ? tools.map(tool => `- ${tool.name} (${tool.serverName || tool.serverId || 'MCP'})`).sort().join('\n') : '- none active';
            return `${label}\n${values}`;
        }).join('\n\n');
    }

    function groupTools(tools) {
        return tools.reduce((groups, tool) => {
            const category = tool.category === 'browser' ? 'browser/puppeteer' : ['filesystem', 'memory'].includes(tool.category) ? tool.category : 'other';
            groups[category].push(tool);
            return groups;
        }, { 'browser/puppeteer': [], filesystem: [], memory: [], other: [] });
    }

    host._extend({
        parseDirectCommand,
        executeDirectCommand,
        splitCommandLine
    });
})(window);
