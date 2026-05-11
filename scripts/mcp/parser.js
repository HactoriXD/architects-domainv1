// Architect's Domain MCP Parser
// ============================================
(function initArchitectMcpParser(global) {
    const host = global.ArchitectMCP;
    if (!host) return;

    const TOOL_ALIASES = {
        puppeteer_navigate: ['browser_navigate'],
        browser_open: ['browser_navigate'],
        puppeteer_screenshot: ['browser_screenshot'],
        puppeteer_extract_text: ['browser_extract_text'],
        browser_text: ['browser_extract_text'],
        read_file: ['filesystem_read_file', 'filesystem.read_file'],
        filesystem_read: ['read_file', 'filesystem.read_file'],
        write_file: ['filesystem_write_file', 'filesystem.write_file'],
        filesystem_write: ['write_file', 'filesystem.write_file'],
        list_files: ['filesystem_list', 'filesystem.list_files', 'list_directory'],
        store_memory: ['memory_store']
    };

    function getToolAliases(name) {
        return TOOL_ALIASES[String(name || '')] || [];
    }

    function getToolCategory(tool = {}) {
        const name = String(tool.name || '');
        const server = String(tool.serverName || '').toLowerCase();
        const serverId = String(tool.serverId || '').toLowerCase();
        if (name.startsWith('memory_') || serverId.includes('memory') || server.includes('memory')) return 'memory';
        if (name.startsWith('browser_') || name.startsWith('puppeteer_') || serverId.includes('browser') || server.includes('browser') || server.includes('puppeteer')) return 'browser';
        if (isFilesystemToolName(name) || serverId.includes('filesystem') || server.includes('filesystem')) return 'filesystem';
        return 'other';
    }

    function getActiveTools() {
        return typeof getActiveMcpTools === 'function' ? getActiveMcpTools() : [];
    }

    function resolveToolName(rawName, serverId = '') {
        const requested = String(rawName || '').trim();
        if (!requested) return { ok: false, error: parserError('MCP_MISSING_TOOL_NAME', 'Missing tool name.', { serverId }) };
        const tools = getActiveTools();
        const choose = matches => {
            const unique = [...new Map(matches.map(tool => [getMcpToolQualifiedName(tool), tool])).values()];
            if (unique.length === 1) return { ok: true, tool: unique[0] };
            if (unique.length > 1) return { ok: false, error: parserError('MCP_TOOL_AMBIGUOUS', 'Ambiguous MCP tool request.', { tool: requested, matches: unique.map(getMcpToolQualifiedName) }) };
            return null;
        };
        const find = names => {
            const wanted = new Set(names.filter(Boolean));
            return tools.filter(tool => {
                const qualified = getMcpToolQualifiedName(tool);
                const serverMatches = !serverId || tool.serverId === serverId || tool.serverName === serverId || tool.type === serverId;
                if (!serverMatches) return false;
                return [...wanted].some(name => qualified === name || tool.name === name || `${tool.serverName}:${tool.name}` === name || `${tool.serverId}:${tool.name}` === name);
            });
        };
        const exact = choose(find([requested]));
        if (exact) return exact;
        const suffix = requested.includes(':') ? requested.split(':').pop().trim() : '';
        if (suffix) {
            const resolved = choose(find([suffix]));
            if (resolved) return resolved;
        }
        const providerSuffix = requested.includes('__') ? requested.split('__').pop().trim() : '';
        if (providerSuffix && providerSuffix !== requested) {
            const resolved = choose(find([providerSuffix]));
            if (resolved) return resolved;
        }
        const aliasTargets = [...new Set([requested, suffix, providerSuffix].filter(Boolean).flatMap(name => TOOL_ALIASES[name] || []))];
        if (aliasTargets.length) {
            const resolved = choose(find(aliasTargets));
            if (resolved) return resolved;
        }
        return { ok: false, error: parserError('MCP_TOOL_NOT_AVAILABLE', 'Tool not available.', { tool: requested, similar: findSimilarTools(requested, tools) }) };
    }

    function findSimilarTools(name, tools) {
        const needle = String(name || '').toLowerCase().split(':').pop();
        return tools
            .map(tool => tool.name)
            .filter(toolName => toolName.toLowerCase().includes(needle.slice(0, 8)) || needle.includes(toolName.toLowerCase().slice(0, 8)))
            .slice(0, 6);
    }

    function normalizeToolRequest(payload = {}, options = {}) {
        const unwrapped = unwrapToolPayload(payload);
        if (unwrapped.error) return { ok: false, error: unwrapped.error };
        const serverId = String(unwrapped.payload.serverId || '').trim();
        const toolName = String(unwrapped.payload.tool || unwrapped.payload.mcp_tool || unwrapped.payload.tool_name || unwrapped.payload.name || '').trim();
        const resolved = resolveToolName(toolName, serverId);
        if (!resolved.ok) return resolved;
        const normalizedArgs = normalizeArgumentsForTool(resolved.tool, unwrapped.payload.arguments || unwrapped.payload.parameters || {});
        if (normalizedArgs.error) return { ok: false, error: normalizedArgs.error };
        const schemaError = validateArgsAgainstSchema(normalizedArgs.args, resolved.tool.inputSchema || {});
        if (schemaError) return { ok: false, error: parserError('MCP_ARGUMENTS_INVALID', schemaError, { tool: resolved.tool.name, arguments: sanitizePreview(normalizedArgs.args) }) };
        return {
            ok: true,
            call: {
                id: typeof generateId === 'function' ? generateId() : `${Date.now()}-${Math.random()}`,
                source: options.source || 'model',
                name: getMcpToolQualifiedName(resolved.tool),
                toolName: resolved.tool.name,
                serverId: resolved.tool.serverId,
                serverName: resolved.tool.serverName,
                arguments: normalizedArgs.args,
                raw: options.raw || '',
                confidence: options.confidence || 1,
                requiresApproval: Boolean(resolved.tool.permission?.requiresApproval)
            }
        };
    }

    function unwrapToolPayload(payload = {}) {
        const toolName = String(payload.tool || payload.mcp_tool || payload.tool_name || payload.name || '').trim();
        const args = asObject(payload.arguments || payload.parameters || {});
        if (toolName === 'mcp_call_tool') {
            const realTool = String(args.tool_name || args.tool || args.mcp_tool || args.name || '').trim();
            if (!realTool) return { error: parserError('MCP_MISSING_TOOL_NAME', 'Missing tool name.', { wrapper: 'mcp_call_tool', arguments: sanitizePreview(args) }) };
            return { payload: { serverId: payload.serverId || args.serverId || '', tool: realTool, arguments: asObject(args.arguments || args.parameters || {}) } };
        }
        if (!toolName) return { error: parserError('MCP_MISSING_TOOL_NAME', 'Missing tool name.', { arguments: sanitizePreview(args) }) };
        return { payload: { serverId: payload.serverId || '', tool: toolName, arguments: args } };
    }

    function normalizeArgumentsForTool(tool, args = {}) {
        const normalized = { ...asObject(args) };
        const name = tool.name;
        const category = getToolCategory(tool);
        if (category === 'browser') {
            if (!normalized.url) normalized.url = normalized.targetUrl ?? normalized.href ?? '';
            if (typeof normalized.url === 'string') normalized.url = normalizeUrl(normalized.url);
            if (isToolSchemaRequired(tool, 'url') && !String(normalized.url || '').trim() && !['browser_screenshot', 'browser_extract_text'].includes(name)) {
                return { error: parserError('MCP_ARGUMENTS_INVALID', 'Browser URL is required.', { tool: name }) };
            }
            if (!String(normalized.url || '').trim()) delete normalized.url;
            if (normalized.url && !isSafeBrowserUrl(normalized.url)) return { error: parserError('MCP_ARGUMENTS_INVALID', 'Invalid or unsafe browser URL.', { tool: name, url: normalized.url }) };
        }
        if (category === 'filesystem') {
            if (!normalized.path) normalized.path = normalized.file_path ?? normalized.filepath ?? normalized.filename ?? '';
            if (requiresPathArgument(name, tool) && !String(normalized.path || '').trim()) return { error: parserError('MCP_ARGUMENTS_INVALID', 'Filesystem path is required.', { tool: name }) };
            if (isFilesystemWriteToolName(name) && !String(normalized.content ?? normalized.text ?? normalized.value ?? '').length) return { error: parserError('MCP_ARGUMENTS_INVALID', 'Filesystem write content is required.', { tool: name }) };
            if (isFilesystemWriteToolName(name) && !('content' in normalized)) normalized.content = normalized.text ?? normalized.value ?? '';
        }
        if (category === 'memory' && name === 'memory_store') {
            const content = normalized.content ?? normalized.text ?? normalized.value ?? normalized.memory ?? '';
            normalized.content = content;
            if (!String(content || '').trim()) return { error: parserError('MCP_ARGUMENTS_INVALID', 'Memory content is required.', { tool: name }) };
            if (normalized.key && !normalized.title) normalized.title = String(normalized.key);
            if (normalized.title && !Array.isArray(normalized.tags)) normalized.tags = [String(normalized.title)];
        }
        return { args: normalized };
    }

    function parseProviderToolCallsFromMessage(message = {}) {
        const calls = [];
        const errors = [];
        const seen = new Set();
        for (const call of message.tool_calls || []) {
            const rawArgs = call.function?.arguments || call.arguments || '{}';
            const parsedArgs = parseToolArguments(rawArgs);
            if (parsedArgs.error) {
                errors.push(parsedArgs.error);
                continue;
            }
            const name = typeof providerToolNameToMcpName === 'function'
                ? providerToolNameToMcpName(call.function?.name || call.name || '')
                : (call.function?.name || call.name || '');
            const normalized = normalizeToolRequest({ tool: name, arguments: parsedArgs.value }, { source: 'native', raw: rawArgs });
            if (!normalized.ok) {
                errors.push(normalized.error);
                continue;
            }
            const signature = getCallSignature(normalized.call);
            if (seen.has(signature)) continue;
            seen.add(signature);
            calls.push({ ...normalized.call, id: call.id || normalized.call.id });
        }
        return { calls, errors, visibleText: '' };
    }

    function parseModelToolCalls(text = '') {
        const sourceText = normalizeToolMarkupEntities(String(text || ''));
        const candidates = extractModelCandidates(sourceText);
        const calls = [];
        const errors = [];
        const seen = new Set();
        for (const candidate of candidates) {
            if (candidate.error) {
                errors.push(candidate.error);
                continue;
            }
            const payload = candidate.payload || parsePayloadCandidate(candidate);
            if (payload.error) {
                errors.push(payload.error);
                continue;
            }
            const normalized = normalizeToolRequest(payload.value || payload, { source: candidate.source || 'model', raw: candidate.raw || candidate.argumentsRaw || '' });
            if (!normalized.ok) {
                errors.push(normalized.error);
                continue;
            }
            const signature = getCallSignature(normalized.call);
            if (seen.has(signature)) {
                errors.push(parserError('MCP_DUPLICATE_TOOL_CALL', 'Duplicate MCP tool call skipped.', { tool: normalized.call.name }));
                continue;
            }
            seen.add(signature);
            calls.push(normalized.call);
        }
        return { calls, errors, visibleText: stripToolMarkup(sourceText) };
    }

    function parsePayloadCandidate(candidate) {
        const raw = candidate.name ? candidate.argumentsRaw : candidate.raw;
        const parsed = parseJsonWithSafeRepair(raw);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
            return { error: parserError('INVALID_TOOL_JSON', 'MCP parser error: invalid JSON arguments.', { reason: parsed.error, preview: sanitizePreview(raw) }) };
        }
        if (candidate.name) return { value: { tool: candidate.name, arguments: parsed.value } };
        return { value: parsed.value };
    }

    function extractModelCandidates(text) {
        const candidates = [];
        const dsmBlocks = extractDsmTaggedBlocks(text, 'tool_calls');
        const dsmRanges = [];
        for (const block of dsmBlocks) {
            dsmRanges.push([block.start, block.end]);
            candidates.push(...parseDsmBlock(block));
        }
        const xmlBlocks = extractXmlToolBlocks(text);
        const xmlRanges = [];
        for (const block of xmlBlocks) {
            if (dsmRanges.some(([start, end]) => block.start >= start && block.end <= end)) continue;
            xmlRanges.push([block.start, block.end]);
            if (block.name) candidates.push({ source: 'xml', name: block.name, argumentsRaw: block.body, raw: block.raw });
            else if (!/<(?:tool_calls?|mcp_call_tool)\b/i.test(block.body) && looksLikeToolJson(block.body)) candidates.push({ source: 'xml-json', raw: block.body });
        }
        for (const fence of extractFencedJson(text)) {
            if (looksLikeToolJson(fence.body)) candidates.push({ source: 'fenced-json', raw: fence.body, fullRaw: fence.raw });
        }
        for (const item of extractJsonObjectsFromText(text)) {
            if (dsmRanges.some(([start, end]) => item.start >= start && item.end <= end)) continue;
            if (xmlRanges.some(([start, end]) => item.start >= start && item.end <= end)) continue;
            if (looksLikeToolJson(item.raw)) candidates.push({ source: 'json', raw: item.raw });
        }
        return candidates;
    }

    function stripToolMarkup(text = '') {
        let output = normalizeToolMarkupEntities(String(text || ''));
        for (const fence of extractFencedJson(output)) {
            if (looksLikeToolJson(fence.body)) output = output.replace(fence.raw, '');
        }
        output = stripRanges(output, extractDsmTaggedBlocks(output, 'tool_calls'));
        output = stripRanges(output, extractXmlToolBlocks(output));
        output = stripLooseDsmLeakLines(output);
        for (const item of extractJsonObjectsFromText(output)) {
            if (looksLikeToolJson(item.raw)) output = output.replace(item.raw, '');
        }
        return output.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function parseToolArguments(raw) {
        if (!raw) return { value: {} };
        if (typeof raw === 'object') return { value: raw };
        const parsed = parseJsonWithSafeRepair(raw);
        if (parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) return { value: parsed.value };
        return { value: {}, error: parserError('INVALID_TOOL_JSON', 'MCP parser error: invalid JSON arguments.', { preview: sanitizePreview(raw), reason: parsed.error }) };
    }

    function parseJsonWithSafeRepair(raw) {
        const text = String(raw || '').trim();
        const attempts = [text];
        const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        if (fence) attempts.push(fence[1].trim(), fence[1].trim().replace(/,\s*([}\]])/g, '$1'));
        attempts.push(text.replace(/,\s*([}\]])/g, '$1'));
        for (const attempt of attempts) {
            if (!attempt) continue;
            try {
                const value = JSON.parse(attempt);
                if (typeof value === 'string') return { ok: true, value: JSON.parse(value) };
                return { ok: true, value };
            } catch (error) {
                // Try the next safe parse shape.
            }
        }
        return { ok: false, error: 'Invalid JSON' };
    }

    function extractXmlToolBlocks(text) {
        const blocks = [];
        const stack = [];
        const tagPattern = /<\/?(tool_calls?|mcp_call_tool)\b[^>]*>/gi;
        let match;
        while ((match = tagPattern.exec(text))) {
            const tag = match[0];
            const tagName = match[1].toLowerCase();
            if (!/^<\//.test(tag)) {
                stack.push({ tagName, start: match.index, openEnd: tagPattern.lastIndex, attributes: tag.replace(/^<(tool_calls?|mcp_call_tool)\b/i, '').replace(/>$/, '') });
                continue;
            }
            const openIndex = stack.map(item => item.tagName).lastIndexOf(tagName);
            if (openIndex < 0) continue;
            const open = stack.splice(openIndex, 1)[0];
            blocks.push({ start: open.start, end: tagPattern.lastIndex, raw: text.slice(open.start, tagPattern.lastIndex), body: text.slice(open.openEnd, match.index), name: tagName === 'mcp_call_tool' ? 'mcp_call_tool' : extractAttribute(open.attributes, 'name') });
        }
        while (stack.length) {
            const open = stack.pop();
            blocks.push({ start: open.start, end: text.length, raw: text.slice(open.start), body: text.slice(open.openEnd), name: open.tagName === 'mcp_call_tool' ? 'mcp_call_tool' : extractAttribute(open.attributes, 'name') });
        }
        return blocks.sort((a, b) => a.start - b.start || a.end - b.end);
    }

    function extractDsmTaggedBlocks(text, tagName) {
        const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tagPattern = new RegExp(`<\\s*(\\/?)\\s*(?:\\|\\s*)+(?:(?:DSM|DSML)\\s*(?:\\|\\s*)+)?${escaped}\\b([^>]*)>`, 'gi');
        const blocks = [];
        const stack = [];
        let match;
        while ((match = tagPattern.exec(text))) {
            if (!match[1]) {
                stack.push({ start: match.index, openEnd: tagPattern.lastIndex, attributes: match[2] || '' });
                continue;
            }
            const open = stack.pop();
            if (!open) continue;
            blocks.push({ start: open.start, end: tagPattern.lastIndex, raw: text.slice(open.start, tagPattern.lastIndex), body: text.slice(open.openEnd, match.index), attributes: open.attributes, name: extractAttribute(open.attributes, 'name') });
        }
        while (stack.length) {
            const open = stack.pop();
            blocks.push({ start: open.start, end: text.length, raw: text.slice(open.start), body: text.slice(open.openEnd), attributes: open.attributes, name: extractAttribute(open.attributes, 'name') });
        }
        return blocks.sort((a, b) => a.start - b.start || a.end - b.end);
    }

    function parseDsmBlock(block) {
        const invokes = extractDsmTaggedBlocks(block.body, 'invoke');
        if (!invokes.length) return [{ source: 'dsm', raw: block.raw, error: parserError('MCP_MISSING_TOOL_NAME', 'Missing tool name.', { preview: sanitizePreview(block.raw) }) }];
        return invokes.map(invoke => ({ source: 'dsm', raw: invoke.raw, payload: { tool: invoke.name, arguments: parseDsmParameters(invoke.body) } }));
    }

    function parseDsmParameters(body) {
        const args = {};
        const allowed = new Set(['url', 'path', 'content', 'text', 'value', 'file_path', 'filepath', 'filename', 'selector', 'key']);
        for (const parameter of extractDsmTaggedBlocks(body, 'parameter')) {
            const name = extractAttribute(parameter.attributes, 'name');
            if (!name || !allowed.has(name)) continue;
            args[name] = decodeEntities(trimDsmParameterBody(parameter.body)).trim();
        }
        return args;
    }

    function trimDsmParameterBody(value) {
        return String(value || '').split(/<\s*\/?\s*(?:\|\s*)+(?:(?:DSM|DSML)\s*(?:\|\s*)+)?(?:tool_calls|invoke|parameter)\b/i)[0];
    }

    function extractFencedJson(text) {
        const result = [];
        const pattern = /```(?:json)?\s*([\s\S]*?)```/gi;
        let match;
        while ((match = pattern.exec(text))) result.push({ raw: match[0], body: match[1], start: match.index, end: pattern.lastIndex });
        return result;
    }

    function extractJsonObjectsFromText(text) {
        const results = [];
        let start = -1, depth = 0, inString = false, escape = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (inString) {
                if (escape) escape = false;
                else if (char === '\\') escape = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') inString = true;
            else if (char === '{') { if (depth === 0) start = index; depth += 1; }
            else if (char === '}' && depth > 0) {
                depth -= 1;
                if (depth === 0 && start >= 0) {
                    results.push({ raw: text.slice(start, index + 1), start, end: index + 1 });
                    start = -1;
                }
            }
        }
        return results;
    }

    function stripRanges(text, ranges) {
        const valid = ranges.filter(range => range.start >= 0 && range.end > range.start).sort((a, b) => a.start - b.start || b.end - a.end);
        if (!valid.length) return text;
        const merged = [];
        for (const range of valid) {
            const last = merged[merged.length - 1];
            if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
            else merged.push({ start: range.start, end: range.end });
        }
        let output = '', cursor = 0;
        for (const range of merged) {
            output += text.slice(cursor, range.start);
            cursor = Math.max(cursor, range.end);
        }
        return output + text.slice(cursor);
    }

    function stripLooseDsmLeakLines(text) {
        return String(text || '').split(/\r?\n/).filter(line => {
            const value = String(line || '');
            if (!value.includes('<') || !value.includes('|')) return true;
            return !/(?:DSM|DSML|tool_calls|invoke|parameter)/i.test(value)
                || !/(?:tool_calls|invoke|parameter)/i.test(value);
        }).join('\n');
    }

    function normalizeToolMarkupEntities(text) {
        const value = String(text || '');
        if (!/(?:&lt;|&#60;|&#x3c;)[\s\S]{0,200}(?:DSM|DSML|tool_calls?|mcp_call_tool|invoke|parameter)/i.test(value)) return value;
        return value
            .replace(/&lt;|&#60;|&#x3c;/gi, '<')
            .replace(/&gt;|&#62;|&#x3e;/gi, '>')
            .replace(/&quot;|&#34;|&#x22;/gi, '"')
            .replace(/&#39;|&#x27;|&apos;/gi, "'")
            .replace(/&amp;/gi, '&');
    }

    function looksLikeToolJson(raw) {
        const text = String(raw || '');
        if (/"(?:mcp_tool|tool_name|tool)"\s*:/.test(text)) return true;
        return /"name"\s*:/.test(text) && /"(?:arguments|parameters)"\s*:/.test(text);
    }

    function extractAttribute(attributes, name) {
        const match = String(attributes || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
        return match ? match[1].trim() : '';
    }

    function decodeEntities(value) {
        return String(value || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    function normalizeUrl(value) {
        const raw = String(value || '').trim();
        if (/^localhost:\d+(?:\/.*)?$/i.test(raw) || /^127\.0\.0\.1:\d+(?:\/.*)?$/i.test(raw)) return `http://${raw.replace(/\/?$/, '/')}`;
        return raw;
    }

    function isSafeBrowserUrl(value) {
        try {
            const url = new URL(normalizeUrl(value));
            return ['http:', 'https:'].includes(url.protocol);
        } catch (error) {
            return false;
        }
    }

    function isFilesystemToolName(name) {
        return ['read_file', 'write_file', 'list_directory', 'search_files', 'get_file_info', 'filesystem_read_file', 'filesystem_write_file', 'filesystem_list'].includes(name) || name.startsWith('filesystem_') || name.startsWith('filesystem.');
    }

    function isFilesystemWriteToolName(name) {
        return name === 'write_file' || name === 'filesystem_write' || name === 'filesystem_write_file' || name === 'filesystem.write_file';
    }

    function requiresPathArgument(name, tool = null) {
        return isToolSchemaRequired(tool, 'path') || ['read_file', 'write_file', 'list_directory', 'search_files', 'get_file_info', 'filesystem_read', 'filesystem_write', 'filesystem_read_file', 'filesystem_write_file', 'filesystem_list', 'filesystem.read_file', 'filesystem.write_file', 'filesystem.list_files'].includes(name);
    }

    function isToolSchemaRequired(tool, key) {
        return Array.isArray(tool?.inputSchema?.required) && tool.inputSchema.required.includes(key);
    }

    function validateArgsAgainstSchema(args, schema = {}) {
        const required = Array.isArray(schema.required) ? schema.required : [];
        for (const key of required) if (!(key in args)) return `Missing required argument: ${key}`;
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

    function asObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function getCallSignature(call) {
        return `${call.name}:${JSON.stringify(call.arguments || {})}`;
    }

    function parserError(code, message, details = {}) {
        return { code, message, details: host.redactSecrets ? host.redactSecrets(details) : details };
    }

    function sanitizePreview(value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value || {});
        return (host.redactSecrets ? host.redactSecrets(text) : text).slice(0, 600);
    }

    host._extend({
        getToolAliases,
        getToolCategory,
        resolveToolName,
        normalizeToolRequest,
        normalizeArgumentsForTool,
        parseProviderToolCallsFromMessage,
        parseModelToolCalls,
        stripToolMarkup,
        parseToolArguments,
        parseJsonWithSafeRepair,
        isSafeBrowserUrl,
        normalizeUrl,
        parserError
    });
})(window);
