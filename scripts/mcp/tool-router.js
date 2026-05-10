// MCP Tool Router
// ============================================
function extractProviderToolCallsFromChunk(delta) {
    return delta?.tool_calls || [];
}

function parseProviderToolCallsFromMessage(message) {
    if (window.ArchitectMCP?.parseProviderToolCallsFromMessage) {
        const result = window.ArchitectMCP.parseProviderToolCallsFromMessage(message);
        if (result.errors?.length) {
            state.mcpControl.parserErrors = state.mcpControl.parserErrors || [];
            state.mcpControl.parserErrors.push(...result.errors);
        }
        return result.calls || [];
    }
    const seen = new Set();
    return (message?.tool_calls || []).map(call => {
        const requestedName = providerToolNameToMcpName(call.function?.name || call.name || '');
        const argsResult = parseToolArguments(call.function?.arguments || call.arguments || '{}');
        if (argsResult.error) {
            state.mcpControl.parserErrors = state.mcpControl.parserErrors || [];
            state.mcpControl.parserErrors.push(argsResult.error);
            return null;
        }
        const payload = normalizeParsedMcpToolPayload({ tool: requestedName, arguments: argsResult.value });
        if (payload.error) {
            state.mcpControl.parserErrors = state.mcpControl.parserErrors || [];
            state.mcpControl.parserErrors.push(payload.error);
            return null;
        }
        const validation = validateParsedMcpToolCall(payload.parsed, { source: 'native' });
        if (!validation.valid) {
            state.mcpControl.parserErrors = state.mcpControl.parserErrors || [];
            state.mcpControl.parserErrors.push(validation.error);
            return null;
        }
        const signature = getMcpToolCallSignature(validation.call.name, validation.call.arguments);
        if (seen.has(signature)) return null;
        seen.add(signature);
        return { ...validation.call, id: call.id || validation.call.id || generateId() };
    }).filter(Boolean);
}

function parseToolArguments(raw) {
    if (window.ArchitectMCP?.parseToolArguments) return window.ArchitectMCP.parseToolArguments(raw);
    if (!raw) return { value: {} };
    if (typeof raw === 'object') return { value: raw };
    const parsed = parseJsonWithSafeRepair(raw);
    if (parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) return { value: parsed.value };
    return { value: {}, error: buildMcpParserError('INVALID_TOOL_JSON', 'MCP parser error: invalid JSON arguments.', raw, parsed.error) };
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
    if (window.ArchitectMCP?.parseModelToolCalls) {
        if (state.mcpControl?.toolCallingMode === 'disabled') return [];
        const result = window.ArchitectMCP.parseModelToolCalls(content);
        if (result.errors?.length) {
            state.mcpControl.parserErrors = state.mcpControl.parserErrors || [];
            state.mcpControl.parserErrors.push(...result.errors);
        }
        return result.calls || [];
    }
    if (state.mcpControl?.toolCallingMode === 'disabled') return [];
    const candidates = extractFallbackMcpToolCandidates(content);
    const calls = [];
    const seen = new Set();
    state.mcpControl.parserErrors = state.mcpControl.parserErrors || [];
    for (const candidate of candidates) {
        let rawPayload = candidate.payload;
        if (candidate.error) {
            state.mcpControl.parserErrors.push(candidate.error);
            continue;
        }
        if (!rawPayload) {
            const parsed = candidate.name
                ? parseJsonWithSafeRepair(candidate.argumentsRaw)
                : parseJsonWithSafeRepair(candidate.raw);
            if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
                state.mcpControl.parserErrors.push(buildMcpParserError('INVALID_TOOL_JSON', 'MCP parser error: invalid JSON arguments.', candidate.argumentsRaw || candidate.raw, parsed.error));
                continue;
            }
            rawPayload = candidate.name ? { tool: candidate.name, arguments: parsed.value } : parsed.value;
        }
        const payload = normalizeParsedMcpToolPayload(rawPayload);
        if (payload.error) {
            state.mcpControl.parserErrors.push(payload.error);
            continue;
        }
        const validation = validateParsedMcpToolCall(payload.parsed, { source: candidate.source || 'fallback' });
        if (!validation.valid) {
            state.mcpControl.parserErrors.push(validation.error);
            continue;
        }
        const signature = getMcpToolCallSignature(validation.call.name, validation.call.arguments);
        if (seen.has(signature)) {
            state.mcpControl.parserErrors.push({ code: 'MCP_DUPLICATE_TOOL_CALL', message: 'Duplicate MCP tool call skipped.', details: { tool: validation.call.name } });
            continue;
        }
        seen.add(signature);
        calls.push(validation.call);
    }
    return calls;
}

function stripFallbackMcpToolMarkup(content) {
    if (window.ArchitectMCP?.stripToolMarkup) return window.ArchitectMCP.stripToolMarkup(content);
    let text = stripLooseDsmLeakLines(stripDsmToolCallBlocks(stripMcpXmlBlocks(normalizeToolMarkupEntities(String(content || '')))));
    const candidates = extractFallbackMcpToolCandidates(text).filter(candidate => candidate.source === 'json');
    for (const candidate of candidates) {
        text = text.replace(candidate.raw, '');
    }
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractFallbackMcpToolCandidates(content) {
    const text = normalizeToolMarkupEntities(String(content || ''));
    const candidates = [];
    const dsmBlocks = extractDsmToolCallBlocks(text);
    const dsmRanges = [];
    for (const block of dsmBlocks) {
        dsmRanges.push([block.start, block.end]);
        candidates.push(...parseDsmToolCallBlock(block));
    }
    const xmlBlocks = extractMcpXmlBlocks(text);
    const xmlRanges = [];
    for (const block of xmlBlocks) {
        if (dsmRanges.some(([start, end]) => block.start >= start && block.end <= end)) continue;
        xmlRanges.push([block.start, block.end]);
        if (block.name) {
            candidates.push({ source: 'xml', name: block.name, argumentsRaw: block.body, raw: block.raw });
        } else if (!/<tool_calls?\b/i.test(block.body) && looksLikeMcpJsonToolCall(block.body)) {
            candidates.push({ source: 'xml-json', raw: block.body });
        }
    }
    for (const item of extractJsonObjectsFromText(text)) {
        if (dsmRanges.some(([start, end]) => item.start >= start && item.end <= end)) continue;
        if (xmlRanges.some(([start, end]) => item.start >= start && item.end <= end)) continue;
        if (looksLikeMcpJsonToolCall(item.raw)) candidates.push({ source: 'json', raw: item.raw });
    }
    return candidates;
}

function extractMcpXmlBlocks(text) {
    const blocks = [];
    const stack = [];
    const tagPattern = /<\/?tool_calls?\b[^>]*>/gi;
    let match;
    while ((match = tagPattern.exec(text))) {
        const tag = match[0];
        if (!/^<\//.test(tag)) {
            stack.push({
                start: match.index,
                openEnd: tagPattern.lastIndex,
                attributes: tag.replace(/^<tool_calls?\b/i, '').replace(/>$/, '')
            });
            continue;
        }
        const open = stack.pop();
        if (!open) continue;
        blocks.push({
            start: open.start,
            end: tagPattern.lastIndex,
            raw: text.slice(open.start, tagPattern.lastIndex),
            body: text.slice(open.openEnd, match.index),
            name: extractMcpXmlAttribute(open.attributes, 'name')
        });
    }
    while (stack.length) {
        const open = stack.pop();
        blocks.push({
            start: open.start,
            end: text.length,
            raw: text.slice(open.start),
            body: text.slice(open.openEnd),
            name: extractMcpXmlAttribute(open.attributes, 'name')
        });
    }
    return blocks.sort((a, b) => a.start - b.start || a.end - b.end);
}

function extractDsmToolCallBlocks(text) {
    return extractDsmTaggedBlocks(text, 'tool_calls');
}

function extractDsmTaggedBlocks(text, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagPattern = new RegExp(`<\\s*(\\/?)\\s*(?:\\|\\s*)+(?:(?:DSM|DSML)\\s*(?:\\|\\s*)+)?${escaped}\\b([^>]*)>`, 'gi');
    const blocks = [];
    const stack = [];
    let match;
    while ((match = tagPattern.exec(text))) {
        if (!match[1]) {
            stack.push({
                start: match.index,
                openEnd: tagPattern.lastIndex,
                attributes: match[2] || ''
            });
            continue;
        }
        const open = stack.pop();
        if (!open) continue;
        blocks.push({
            start: open.start,
            end: tagPattern.lastIndex,
            raw: text.slice(open.start, tagPattern.lastIndex),
            body: text.slice(open.openEnd, match.index),
            attributes: open.attributes,
            name: extractMcpXmlAttribute(open.attributes, 'name')
        });
    }
    while (stack.length) {
        const open = stack.pop();
        blocks.push({
            start: open.start,
            end: text.length,
            raw: text.slice(open.start),
            body: text.slice(open.openEnd),
            attributes: open.attributes,
            name: extractMcpXmlAttribute(open.attributes, 'name')
        });
    }
    return blocks.sort((a, b) => a.start - b.start || a.end - b.end);
}

function parseDsmToolCallBlock(block) {
    const invokes = extractDsmTaggedBlocks(block.body, 'invoke');
    if (!invokes.length) {
        return [{
            source: 'dsm',
            raw: block.raw,
            error: { code: 'MCP_MISSING_TOOL_NAME', message: 'Missing tool name.', details: { preview: sanitizeMcpPreview(block.raw) } }
        }];
    }
    return invokes.map(invoke => ({
        source: 'dsm',
        raw: invoke.raw,
        payload: {
            tool: invoke.name,
            arguments: parseDsmParameters(invoke.body)
        }
    }));
}

function parseDsmParameters(body) {
    const args = {};
    const allowed = new Set(['url', 'path', 'content', 'text', 'value', 'file_path', 'filepath', 'filename']);
    for (const parameter of extractDsmTaggedBlocks(body, 'parameter')) {
        const name = extractMcpXmlAttribute(parameter.attributes, 'name');
        if (!name || !allowed.has(name)) continue;
        args[name] = decodeDsmParameterValue(parameter.body);
    }
    return args;
}

function decodeDsmParameterValue(value) {
    return String(value || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
}

function stripMcpXmlBlocks(text) {
    const blocks = extractMcpXmlBlocks(text).filter(block => block.start >= 0 && block.end > block.start);
    if (!blocks.length) return text.replace(/<\/?tool_calls?\b[^>]*>/gi, '');
    const merged = [];
    for (const block of blocks.sort((a, b) => a.start - b.start || b.end - a.end)) {
        const last = merged[merged.length - 1];
        if (last && block.start <= last.end) last.end = Math.max(last.end, block.end);
        else merged.push({ start: block.start, end: block.end });
    }
    let output = '';
    let cursor = 0;
    for (const range of merged) {
        output += text.slice(cursor, range.start);
        cursor = Math.max(cursor, range.end);
    }
    output += text.slice(cursor);
    return output.replace(/<\/?tool_calls?\b[^>]*>/gi, '');
}

function stripDsmToolCallBlocks(text) {
    const blocks = extractDsmToolCallBlocks(text).filter(block => block.start >= 0 && block.end > block.start);
    if (!blocks.length) return text.replace(/<\/?\s*(?:\|\s*)+(?:(?:DSM|DSML)\s*(?:\|\s*)+)?(?:tool_calls|invoke|parameter)\b[^>]*>/gi, '');
    const merged = [];
    for (const block of blocks.sort((a, b) => a.start - b.start || b.end - a.end)) {
        const last = merged[merged.length - 1];
        if (last && block.start <= last.end) last.end = Math.max(last.end, block.end);
        else merged.push({ start: block.start, end: block.end });
    }
    let output = '';
    let cursor = 0;
    for (const range of merged) {
        output += text.slice(cursor, range.start);
        cursor = Math.max(cursor, range.end);
    }
    output += text.slice(cursor);
    return output.replace(/<\/?\s*(?:\|\s*)+(?:(?:DSM|DSML)\s*(?:\|\s*)+)?(?:tool_calls|invoke|parameter)\b[^>]*>/gi, '');
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


function extractJsonObjectsFromText(text) {
    const results = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escape) escape = false;
            else if (char === '\\') escape = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === '{') {
            if (depth === 0) start = index;
            depth += 1;
        } else if (char === '}' && depth > 0) {
            depth -= 1;
            if (depth === 0 && start >= 0) {
                results.push({ raw: text.slice(start, index + 1), start, end: index + 1 });
                start = -1;
            }
        }
    }
    return results;
}

function extractMcpXmlAttribute(attributes, name) {
    const match = String(attributes || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
    return match ? match[1].trim() : '';
}

function looksLikeMcpJsonToolCall(raw) {
    return /"(?:mcp_tool|tool|tool_name|serverId)"\s*:/.test(String(raw || ''));
}

function parseJsonWithSafeRepair(raw) {
    const attempts = [];
    let text = String(raw || '').trim();
    attempts.push(text);
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
        attempts.push(fenceMatch[1].trim());
        attempts.push(fenceMatch[1].trim().replace(/,\s*([}\]])/g, '$1'));
    }
    attempts.push(text.replace(/,\s*([}\]])/g, '$1'));
    for (const attempt of attempts) {
        if (!attempt) continue;
        try {
            const value = JSON.parse(attempt);
            if (typeof value === 'string') {
                try {
                    return { ok: true, value: JSON.parse(value) };
                } catch (error) {
                    return { ok: true, value };
                }
            }
            return { ok: true, value };
        } catch (error) {
            // Try the next safe repair.
        }
    }
    try {
        return { ok: true, value: JSON.parse(text.replace(/,\s*([}\]])/g, '$1')) };
    } catch (error) {
        return { ok: false, error: error.message || String(error) };
    }
}

function normalizeParsedMcpToolPayload(parsed) {
    const toolName = String(parsed?.tool || parsed?.mcp_tool || parsed?.tool_name || parsed?.name || '').trim();
    const args = parsed?.arguments && typeof parsed.arguments === 'object' && !Array.isArray(parsed.arguments) ? parsed.arguments : {};
    if (toolName === 'mcp_call_tool') {
        const realToolName = String(args.tool_name || args.tool || args.mcp_tool || args.name || '').trim();
        if (!realToolName) {
            return { error: { code: 'MCP_MISSING_TOOL_NAME', message: 'Missing tool name.', details: { wrapper: 'mcp_call_tool', arguments: sanitizeMcpPreview(args) } } };
        }
        const realArgs = args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments) ? args.arguments : {};
        return { parsed: { serverId: parsed.serverId || args.serverId || '', tool: realToolName, arguments: realArgs } };
    }
    if (!toolName) return { error: { code: 'MCP_MISSING_TOOL_NAME', message: 'Missing tool name.', details: { arguments: sanitizeMcpPreview(args) } } };
    return { parsed: { serverId: parsed.serverId || '', tool: toolName, arguments: args } };
}

function validateParsedMcpToolCall(parsed, options = {}) {
    const activeTools = getActiveMcpTools();
    const serverId = String(parsed.serverId || '').trim();
    const rawToolName = String(parsed.tool || parsed.mcp_tool || parsed.tool_name || parsed.name || '').trim();
    const args = parsed.arguments && typeof parsed.arguments === 'object' && !Array.isArray(parsed.arguments) ? parsed.arguments : {};
    const resolved = resolveMcpToolName(rawToolName, serverId, activeTools);
    if (!resolved.valid) return { valid: false, error: resolved.error };
    const tool = resolved.tool;
    const server = getWorkspaceMcpServers().find(item => item.id === tool.serverId);
    if (!server || !isMcpServerActiveInCurrentChat(server)) return { valid: false, error: { code: 'MCP_SERVER_INACTIVE', message: 'The requested MCP server is inactive in this chat.', details: { serverId: tool.serverId } } };
    if (!isMcpToolEnabledForChat(server, tool)) return { valid: false, error: { code: 'MCP_TOOL_DISABLED', message: 'The requested MCP tool is disabled by permissions.', details: { tool: tool.name } } };
    const normalizedArgs = normalizeMcpToolArguments(tool, args);
    if (normalizedArgs.error) return { valid: false, error: normalizedArgs.error };
    const schemaError = validateMcpArgumentsAgainstSchema(normalizedArgs.args, tool.inputSchema);
    if (schemaError) return { valid: false, error: { code: 'MCP_ARGUMENTS_INVALID', message: schemaError, details: { tool: tool.name, arguments: sanitizeMcpPreview(normalizedArgs.args) } } };
    return { valid: true, call: { id: generateId(), name: getMcpToolQualifiedName(tool), arguments: normalizedArgs.args, source: options.source || (parsed.serverId ? 'non-native' : 'legacy') } };
}

function resolveMcpToolName(rawName, serverId, activeTools) {
    const requested = String(rawName || '').trim();
    if (!requested) return { valid: false, error: { code: 'MCP_MISSING_TOOL_NAME', message: 'Missing tool name.', details: { serverId } } };
    const aliases = {
        puppeteer_navigate: ['browser_navigate'],
        browser_open: ['browser_navigate'],
        puppeteer_screenshot: ['browser_screenshot'],
        puppeteer_extract_text: ['browser_extract_text'],
        browser_text: ['browser_extract_text'],
        read_file: ['filesystem_read_file', 'filesystem.read_file'],
        write_file: ['filesystem_write_file', 'filesystem.write_file'],
        list_files: ['filesystem_list', 'filesystem.list_files', 'list_directory'],
        store_memory: ['memory_store']
    };
    const findMatches = names => {
        const wanted = new Set(names.filter(Boolean));
        return activeTools.filter(tool => {
            const qualified = getMcpToolQualifiedName(tool);
            const serverMatches = !serverId || tool.serverId === serverId || tool.serverName === serverId;
            if (!serverMatches) return false;
            return [...wanted].some(name => qualified === name || tool.name === name || `${tool.serverName}:${tool.name}` === name || `${tool.serverId}:${tool.name}` === name);
        });
    };
    const choose = matches => {
        const unique = [...new Map(matches.map(tool => [getMcpToolQualifiedName(tool), tool])).values()];
        if (unique.length === 1) return { valid: true, tool: unique[0] };
        if (unique.length > 1) return { valid: false, error: { code: 'MCP_TOOL_AMBIGUOUS', message: 'Ambiguous MCP tool request.', details: { tool: requested, matches: unique.map(tool => getMcpToolQualifiedName(tool)) } } };
        return null;
    };

    const exact = choose(findMatches([requested]));
    if (exact) return exact;
    const colonSuffix = requested.includes(':') ? requested.split(':').pop().trim() : '';
    if (colonSuffix) {
        const suffix = choose(findMatches([colonSuffix]));
        if (suffix) return suffix;
    }
    const providerSuffix = requested.includes('__') ? requested.split('__').pop().trim() : '';
    if (providerSuffix && providerSuffix !== requested) {
        const suffix = choose(findMatches([providerSuffix]));
        if (suffix) return suffix;
    }
    const aliasTargets = [...new Set([requested, colonSuffix, providerSuffix].filter(Boolean).flatMap(name => aliases[name] || []))];
    if (aliasTargets.length) {
        const alias = choose(findMatches(aliasTargets));
        if (alias) return alias;
    }
    return { valid: false, error: { code: 'MCP_TOOL_NOT_AVAILABLE', message: 'Tool not available.', details: { serverId, tool: requested } } };
}

function getMcpToolCategory(tool) {
    const name = String(tool?.name || '');
    const server = String(tool?.serverName || '').toLowerCase();
    const serverId = String(tool?.serverId || '').toLowerCase();
    if (name.startsWith('memory_') || serverId.includes('memory') || server.includes('memory')) return 'memory';
    if (name.startsWith('browser_') || name.startsWith('puppeteer_') || serverId.includes('browser') || server.includes('browser') || server.includes('puppeteer')) return 'browser';
    if (isFilesystemToolName(name) || serverId.includes('filesystem') || server.includes('filesystem')) return 'filesystem';
    return 'generic';
}

function getToolSchemaProperties(tool) {
    return tool?.inputSchema?.properties || {};
}

function hasToolSchemaProperty(tool, key) {
    return Boolean(getToolSchemaProperties(tool)?.[key]);
}

function isToolSchemaRequired(tool, key) {
    return Array.isArray(tool?.inputSchema?.required) && tool.inputSchema.required.includes(key);
}

function normalizeMcpToolArguments(tool, args) {
    const normalized = { ...(args || {}) };
    const name = tool.name;
    const category = getMcpToolCategory(tool);
    if (category === 'memory') normalizeMemoryArguments(name, normalized, tool);
    if (category === 'filesystem') normalizeFilesystemArguments(name, normalized);
    if (category === 'browser') normalizeBrowserArguments(name, normalized);
    if (name === 'memory_store' && !String(normalized.content ?? normalized.value ?? '').trim()) {
        return { error: { code: 'MCP_ARGUMENTS_INVALID', message: 'Memory content is required.', details: { tool: name, arguments: sanitizeMcpPreview(normalized) } } };
    }
    if (category === 'filesystem' && requiresPathArgument(name, tool) && !String(normalized.path || '').trim()) {
        return { error: { code: 'MCP_ARGUMENTS_INVALID', message: 'Filesystem path is required.', details: { tool: name, arguments: sanitizeMcpPreview(normalized) } } };
    }
    if (isFilesystemWriteToolName(name) && !String(normalized.content ?? '').length) {
        return { error: { code: 'MCP_ARGUMENTS_INVALID', message: 'Filesystem write content is required.', details: { tool: name, arguments: sanitizeMcpPreview(normalized) } } };
    }
    if (category === 'browser' && isToolSchemaRequired(tool, 'url') && !String(normalized.url || '').trim()) {
        return { error: { code: 'MCP_ARGUMENTS_INVALID', message: 'Browser URL is required.', details: { tool: name, arguments: sanitizeMcpPreview(normalized) } } };
    }
    return { args: normalized };
}

function normalizeMemoryArguments(name, args, tool) {
    if (name !== 'memory_store') return;
    const content = args.content ?? args.text ?? args.value ?? args.memory ?? '';
    if (hasToolSchemaProperty(tool, 'content')) args.content = content;
    else if (hasToolSchemaProperty(tool, 'value')) args.value = content;
    else args.content = content;
    if (args.key && !args.title) args.title = String(args.key);
    if (args.title && hasToolSchemaProperty(tool, 'tags') && !Array.isArray(args.tags)) args.tags = [String(args.title)];
}

function normalizeFilesystemArguments(name, args) {
    if (!args.path) args.path = args.file_path ?? args.filepath ?? args.filename ?? '';
    if (isFilesystemWriteToolName(name) && !('content' in args)) args.content = args.text ?? args.value ?? '';
}

function normalizeBrowserArguments(name, args) {
    if (!args.url) args.url = args.targetUrl ?? args.href ?? '';
    if (typeof args.url === 'string' && /^localhost:\d+(?:\/.*)?$/i.test(args.url.trim())) args.url = `http://${args.url.trim().replace(/\/?$/, '/')}`;
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

function getMcpToolCallSignature(name, args) {
    return `${name}:${JSON.stringify(args || {})}`;
}

function buildMcpParserError(code, message, raw, details = '') {
    return { code, message, details: { reason: details, preview: sanitizeMcpPreview(raw) } };
}

function sanitizeMcpPreview(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value || {});
    return text
        .replace(/(api[_-]?key|authorization|token|password|secret)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1: [redacted]')
        .slice(0, 500);
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

function parseMcpDirectCommand(content) {
    if (window.ArchitectMCP?.parseDirectCommand) return window.ArchitectMCP.parseDirectCommand(content);
    if (state.mcpControl?.toolCallingMode === 'disabled') return { handled: false };
    const text = String(content || '').trim();
    if (!text) return { handled: false };

    const slash = parseSlashMcpCommand(text);
    if (slash.handled) return slash;

    const lower = text.toLowerCase();
    if (/^(?:use\s+)?mcp\s+tools?\.?$/.test(lower) || /^show\s+mcp\s+tools?\.?$/.test(lower)) {
        return { handled: true, type: 'list_tools' };
    }

    const url = extractDirectCommandUrl(text);
    if (url && /\bmcp\b/i.test(text) && (/\b(browser|puppeteer)\b/i.test(text) || /\bbrowser_(?:navigate|screenshot|extract_text)\b/i.test(text))) {
        let toolName = 'browser_screenshot';
        if (/\b(browser_extract_text|extract_text|extract|text|read page)\b/i.test(text)) toolName = 'browser_extract_text';
        else if (/\b(browser_navigate|navigate|open|go to)\b/i.test(text)) toolName = 'browser_navigate';
        else if (/\b(browser_screenshot|screenshot|see|look|inspect visually)\b/i.test(text)) toolName = 'browser_screenshot';
        return buildDirectMcpToolCommand(toolName, { url });
    }

    return { handled: false };
}

function parseSlashMcpCommand(text) {
    const mcp = text.match(/^\/mcp(?:\s+(.+))?$/i);
    if (mcp) return parseMcpRootCommand(mcp[1] || '');

    const browser = text.match(/^\/(?:browser|puppeteer)\s+(\S+)(?:\s+([\s\S]*))?$/i);
    if (browser) {
        const action = browser[1].toLowerCase();
        const toolName = {
            navigate: 'browser_navigate',
            open: 'browser_navigate',
            screenshot: 'browser_screenshot',
            text: 'browser_extract_text',
            read: 'browser_extract_text',
            extract: 'browser_extract_text',
            extract_text: 'browser_extract_text'
        }[action];
        if (!toolName) return directMcpError('Unknown MCP command or tool not available.');
        const url = extractDirectCommandUrl(browser[2] || '');
        if (!url) return directMcpError('Missing URL/path/content.');
        return buildDirectMcpToolCommand(toolName, { url });
    }

    const memory = text.match(/^\/memory\s+store(?:\s+([\s\S]+))?$/i);
    if (memory) {
        const content = String(memory[1] || '').trim();
        if (!content) return directMcpError('Missing URL/path/content.');
        return buildDirectMcpToolCommand('memory_store', { content });
    }

    const file = text.match(/^\/(?:fs|file)\s+read(?:\s+([\s\S]+))?$/i);
    if (file) {
        const path = cleanDirectCommandTarget(file[1] || '');
        if (!path) return directMcpError('Missing URL/path/content.');
        return buildDirectMcpToolCommand('read_file', { path });
    }

    return { handled: false };
}

function parseMcpRootCommand(rest) {
    const input = String(rest || '').trim();
    if (!input) return { handled: true, type: 'list_tools' };
    const [commandRaw, ...parts] = input.split(/\s+/);
    const command = String(commandRaw || '').toLowerCase();
    const tail = input.slice(commandRaw.length).trim();
    if (['tools', 'list'].includes(command)) return { handled: true, type: 'list_tools' };
    if (['browser_navigate', 'browser_open', 'browser_screenshot', 'browser_extract_text'].includes(command)) {
        const toolName = command === 'browser_open' ? 'browser_navigate' : command;
        const url = extractDirectCommandUrl(tail);
        if (!url) return directMcpError('Missing URL/path/content.');
        return buildDirectMcpToolCommand(toolName, { url });
    }
    if (command === 'memory_store') {
        const content = tail.trim();
        if (!content) return directMcpError('Missing URL/path/content.');
        return buildDirectMcpToolCommand('memory_store', { content });
    }
    if (command === 'read_file') {
        const path = cleanDirectCommandTarget(tail);
        if (!path) return directMcpError('Missing URL/path/content.');
        return buildDirectMcpToolCommand('read_file', { path });
    }
    return directMcpError('Unknown MCP command or tool not available.', { command, arguments: parts.join(' ') });
}

function buildDirectMcpToolCommand(toolName, args) {
    const payload = normalizeParsedMcpToolPayload({ tool: toolName, arguments: args || {} });
    if (payload.error) return { handled: true, error: directMcpErrorMessage(payload.error), details: payload.error.details || {} };
    const validation = validateParsedMcpToolCall(payload.parsed, { source: 'direct-command' });
    if (!validation.valid) {
        return {
            handled: true,
            error: directMcpErrorMessage(validation.error),
            details: validation.error.details || {}
        };
    }
    return { handled: true, type: 'tool_calls', toolCalls: [validation.call] };
}

function directMcpError(message, details = {}) {
    return { handled: true, error: message, details };
}

function directMcpErrorMessage(error) {
    if (error?.code === 'MCP_TOOL_NOT_AVAILABLE' || error?.code === 'MCP_TOOL_AMBIGUOUS' || error?.code === 'MCP_MISSING_TOOL_NAME') {
        return 'Unknown MCP command or tool not available.';
    }
    if (error?.code === 'MCP_ARGUMENTS_INVALID') return error.message || 'Missing URL/path/content.';
    return error?.message || 'Unknown MCP command or tool not available.';
}

function extractDirectCommandUrl(value) {
    const match = String(value || '').match(/\bhttps?:\/\/[^\s<>"']+|\blocalhost:\d+(?:\/[^\s<>"']*)?|\b127\.0\.0\.1:\d+(?:\/[^\s<>"']*)?/i);
    return match ? cleanDirectCommandTarget(match[0]) : '';
}

function cleanDirectCommandTarget(value) {
    return String(value || '').trim().replace(/^on\s+/i, '').replace(/[),.;]+$/g, '');
}

function buildMcpToolListSummary() {
    if (window.ArchitectMCP?.buildToolListSummary) return window.ArchitectMCP.buildToolListSummary();
    const groups = {
        'browser/puppeteer': [],
        filesystem: [],
        memory: [],
        other: []
    };
    for (const tool of getActiveMcpTools()) {
        const category = getMcpToolCategory(tool);
        const key = category === 'browser' ? 'browser/puppeteer' : category === 'filesystem' || category === 'memory' ? category : 'other';
        groups[key].push(`${tool.name} (${tool.serverName || 'MCP'})`);
    }
    const lines = Object.entries(groups).map(([label, tools]) => {
        const values = tools.length ? tools.sort().map(name => `- ${name}`).join('\n') : '- none active';
        return `${label}\n${values}`;
    });
    return lines.join('\n\n');
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

    return tool ? [{ id: generateId(), name: getMcpToolQualifiedName(tool), arguments: args }] : [];
}
