// Regenerate response
    window.regenerateResponse = async function(index) {
        if (state.isStreaming) {
            showToast('Stop the current generation before regenerating', 'info');
            return;
        }
        // Find the user message before this assistant message
        const userMsgIndex = index - 1;
        if (userMsgIndex < 0 || state.messages[userMsgIndex]?.role !== 'user') {
            showToast('Cannot regenerate - no user message found', 'error');
            return;
        }
        
        // Remove the assistant message and any messages after it
        state.messages = state.messages.slice(0, index);
        refreshLastUsageFromMessages();
        
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].messages = [...state.messages];
            state.chats[state.currentChatId].lastUsage = state.lastUsage;
            saveChats();
        }
        
        renderMessages();
        await regenerateFromIndex(userMsgIndex);
    };

    async function regenerateFromIndex(userMsgIndex) {
        if (state.isStreaming || !state.selectedModel) return;
        if (!getApiKey()) { openSettings(true); showToast(`Add a ${getProvider().label} API key to continue`, 'error'); return; }
        
        const streamChatId = state.currentChatId;
        if (!streamChatId) return;
        state.isStreaming = true;
        state.followStream = isNearMessageBottom(120);
        state.activeStream = {
            chatId: streamChatId,
            content: '',
            reasoning: '',
            thinkingRequested: getDeepSeekThinkingEnabled(),
            thinkingProvider: state.provider,
            thinkingModel: state.selectedModel?.id || null,
            startedAt: Date.now(),
            mode: 'regenerate'
        };
        state.abortController = new AbortController();
        el.stopBtn.classList.add('visible');
        el.sendBtn.disabled = true;
        updateDeepSeekThinkingUI();
        updateConversationNavState();

        addStreamingMessage();

        try {
            await refreshMcpMemoryContext(state.messages[userMsgIndex]?.content || '');
            const result = await runCompletionWithMcpTools(buildApiMessages(state.messages.slice(0, userMsgIndex + 1)));
            finalizeStreamingMessage(result.content, result.usage, state.activeStream, result.reasoning, result.finishReason);
        } catch (error) {
            handleStreamFailure(error, { removeUserMessage: false, fallback: 'Failed to regenerate' });
        } finally {
            state.isStreaming = false;
            state.abortController = null;
            state.activeStream = null;
            el.stopBtn.classList.remove('visible');
            updateStats();
            updateSendButton();
            updateDeepSeekThinkingUI();
            updateConversationNavState();
        }
    }

function finalizeStreamingMessage(content, usage = null, stream = state.activeStream, reasoning = null, finishReason = null) {
        if (!stream?.chatId) return;
        const chat = state.chats[stream.chatId];
        if (!chat) return;
        if (stream.chatId === state.currentChatId) removeStreamingElement();
        const visibleContent = sanitizeAssistantVisibleContent(content);
        const reasoningText = String(reasoning ?? stream.reasoning ?? '').trim();
        const assistantMessage = { role: 'assistant', content: visibleContent, timestamp: Date.now(), attachments: [], usage };
        if (finishReason) assistantMessage.finishReason = finishReason;
        if (reasoningText) assistantMessage.reasoning = reasoningText;
        if (stream.thinkingRequested) {
            assistantMessage.reasoningRequested = true;
            assistantMessage.reasoningProvider = stream.thinkingProvider || state.provider;
            assistantMessage.reasoningModel = stream.thinkingModel || state.selectedModel?.id || null;
        }
        if (stream.chatId === state.currentChatId) {
            if (usage) state.lastUsage = usage;
            state.messages.push(assistantMessage);
            chat.messages = [...state.messages];
            chat.lastUsage = state.lastUsage;
        } else {
            chat.messages = [...(chat.messages || []), assistantMessage];
            chat.lastUsage = usage || chat.lastUsage || null;
        }
        chat.updatedAt = Date.now();
        if (!chat.title || chat.title === 'New Ritual' || chat.title === 'New Chat') {
            const title = generateChatTitleFromMessages(chat.messages);
            if (title && title !== 'New Ritual' && title !== 'New Chat') chat.title = title;
        }
        saveChats();
        renderChatList();
        // Re-render to add action buttons
        if (stream.chatId === state.currentChatId) renderMessages();
        updateStats();
    }

    function handleStreamFailure(error, options = {}) {
        const stream = state.activeStream;
        const isAbort = error.name === 'AbortError';
        const chat = stream?.chatId ? state.chats[stream.chatId] : null;
        if (stream?.chatId === state.currentChatId) removeStreamingElement();

        if (isAbort) {
            showToast('Generation stopped', 'info');
            if (chat && stream?.content) {
                const reasoningText = String(stream.reasoning || '').trim();
                const stoppedMessage = { role: 'assistant', content: sanitizeAssistantVisibleContent(stream.content), timestamp: Date.now(), attachments: [], usage: null, status: 'stopped' };
                if (reasoningText) stoppedMessage.reasoning = reasoningText;
                if (stream.thinkingRequested) {
                    stoppedMessage.reasoningRequested = true;
                    stoppedMessage.reasoningProvider = stream.thinkingProvider || state.provider;
                    stoppedMessage.reasoningModel = stream.thinkingModel || state.selectedModel?.id || null;
                }
                if (stream.chatId === state.currentChatId) {
                    state.messages.push(stoppedMessage);
                    chat.messages = [...state.messages];
                } else {
                    chat.messages = [...(chat.messages || []), stoppedMessage];
                }
                chat.updatedAt = Date.now();
                saveChats();
            }
        } else {
            console.error('Error:', error);
            showToast(error.message || options.fallback || 'Request failed', 'error');
            if (options.removeUserMessage && chat) {
                if (stream?.chatId === state.currentChatId) {
                    state.messages.pop();
                    chat.messages = [...state.messages];
                    refreshLastUsageFromMessages();
                } else {
                    chat.messages = (chat.messages || []).slice(0, -1);
                    chat.lastUsage = [...chat.messages].reverse().find(m => m.usage)?.usage || null;
                }
                chat.updatedAt = Date.now();
                saveChats();
            }
        }

        if (stream?.chatId === state.currentChatId) renderMessages();
        renderChatList();
    }

    // ============================================

async function requestStreamingCompletion(apiMessages, options = {}) {
        if (typeof canSendNanoGptSelection === 'function' && !canSendNanoGptSelection()) {
            throw new Error('Selected model is not available in NanoGPT Subscription mode. Refresh models or choose a subscription model.');
        }
        if (options.includeMcpTools !== false && location.protocol !== 'file:' && typeof getMcpSystemTools === 'function') {
            try {
                const resp = await getMcpSystemTools();
                if (resp?.tools) {
                    const servers = getWorkspaceMcpServers();
                    for (const server of servers) {
                        server.capabilities = (resp.tools || [])
                            .filter(t => t.server === server.type)
                            .map(t => typeof normalizeMcpTool === 'function'
                                ? normalizeMcpTool(server, { ...t, inputSchema: t.inputSchema || { type: 'object', properties: t.parameters || {} } })
                                : t);
                    }
                }
            } catch (e) { /* bridge offline — use cached tools */ }
        }
        const requestBody = buildRequestBody(apiMessages, options);

        const response = await fetch(getProviderChatUrl(), {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify(requestBody),
            signal: state.abortController.signal
        });

        if (!response.ok) throw new Error(await parseApiError(response));
        if (!response.body) return requestNonStreamingCompletion(apiMessages, options);
        try {
            return await readStreamingCompletion(response);
        } catch (error) {
            if (state.provider !== 'nanogpt' || error.name === 'AbortError') throw error;
            showToast('NanoGPT streaming failed; retrying without streaming', 'info');
            return requestNonStreamingCompletion(apiMessages, options);
        }
    }

    async function requestNonStreamingCompletion(apiMessages, options = {}) {
        if (typeof canSendNanoGptSelection === 'function' && !canSendNanoGptSelection()) {
            throw new Error('Selected model is not available in NanoGPT Subscription mode. Refresh models or choose a subscription model.');
        }
        const requestBody = buildRequestBody(apiMessages, options);
        requestBody.stream = false;
        delete requestBody.stream_options;
        const response = await fetch(getProviderChatUrl(), {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify(requestBody),
            signal: state.abortController.signal
        });
        if (!response.ok) throw new Error(await parseApiError(response));
        const parsed = await response.json();
        const message = parsed.choices?.[0]?.message || {};
        const separated = separateInlineThinking(message.content || '');
        const reasoning = [
            extractReasoningFromDelta(message),
            separated.reasoning
        ].filter(Boolean).join('\n\n').trim();
        return {
            content: separated.content || message.content || '',
            reasoning,
            usage: normalizeUsage(parsed.usage),
            finishReason: parsed.choices?.[0]?.finish_reason || null,
            toolCalls: parseProviderToolCallsFromMessage(message)
        };
    }

    async function runCompletionWithMcpTools(apiMessages) {
        let workingMessages = [...apiMessages];
        const mcpDisabled = state.mcpControl?.toolCallingMode === 'disabled';
        const inferredCalls = mcpDisabled ? [] : inferMcpToolCallsFromMessages(workingMessages);
        let usedFallbackTool = false;
        if (inferredCalls.length) {
            removeStreamingElement();
            for (const call of inferredCalls) {
                const execution = await executeMcpToolCall(call.name, call.arguments || {});
                appendVisibleToolResultMessage(execution);
                workingMessages.push(buildMcpFallbackResultMessage(execution));
                usedFallbackTool = true;
            }
            syncCurrentChatMessages();
            saveChats();
            renderMessages();
            addStreamingMessage();
        }
        state.mcpControl.parserErrors = [];
        let result = await requestStreamingCompletion(workingMessages, { includeMcpTools: !usedFallbackTool && !mcpDisabled });
        if (!result.toolCalls?.length) {
            result.toolCalls = parseFallbackMcpToolCall(result.content);
            if (result.toolCalls.length) {
                result.content = stripFallbackMcpToolMarkup(result.content);
                updateStreamingMessage(result.content || 'Using MCP tool...');
            } else {
                const stripped = stripFallbackMcpToolMarkup(result.content);
                if (stripped !== result.content) result.content = stripped;
                appendMcpParserErrors();
            }
        }
        for (let round = 0; round < MCP_RUNTIME.maxToolRounds && result.toolCalls?.length; round += 1) {
            removeStreamingElement();
            const assistantToolMessage = buildAssistantToolCallMessage(result.content, result.toolCalls);
            workingMessages.push(assistantToolMessage);
            const toolExecutions = [];
            for (const call of result.toolCalls) {
                const execution = await executeMcpToolCall(call.name, call.arguments || {});
                execution.providerToolCallId = call.id;
                toolExecutions.push(execution);
                workingMessages.push(buildToolResultApiMessage(execution));
                appendVisibleToolResultMessage(execution);
            }
            syncCurrentChatMessages();
            saveChats();
            renderMessages();
            addStreamingMessage();
            state.mcpControl.parserErrors = [];
            result = await requestStreamingCompletion(workingMessages, { includeMcpTools: false });
            if (!result.toolCalls?.length) {
                result.toolCalls = parseFallbackMcpToolCall(result.content);
                if (result.toolCalls.length) {
                    result.content = stripFallbackMcpToolMarkup(result.content);
                    updateStreamingMessage(result.content || 'Using MCP tool...');
                } else {
                    const stripped = stripFallbackMcpToolMarkup(result.content);
                    if (stripped !== result.content) result.content = stripped;
                    appendMcpParserErrors();
                }
            }
            if (toolExecutions.some(execution => execution.status === 'cancelled')) break;
        }
        return result;
    }

    function appendMcpParserErrors() {
        const errors = state.mcpControl?.parserErrors || [];
        if (!errors.length) return;
        if (window.ArchitectMCP?.buildParserErrorMessages) {
            state.messages.push(...window.ArchitectMCP.buildParserErrorMessages(errors.splice(0, 3)));
            return;
        }
        for (const error of errors.splice(0, 3)) {
            state.messages.push({
                role: 'tool_result',
                content: `MCP tool request blocked: ${error.message}`,
                timestamp: Date.now(),
                attachments: [],
                status: 'failed',
                toolName: error.code || 'mcp_parser',
                serverName: 'MCP Parser',
                toolArgs: error.details || {},
                toolPreview: error.message,
                toolImages: [],
                toolRawOutput: JSON.stringify(error, null, 2)
            });
        }
    }

    function appendVisibleToolResultMessage(execution) {
        if (window.ArchitectMCP?.renderToolResult) {
            const message = window.ArchitectMCP.renderToolResult(execution);
            if (message) state.messages.push(message);
            return;
        }
        const toolImages = execution.status === 'success'
            ? extractMcpToolImages(execution.result).slice(0, 4)
            : [];
        state.messages.push({
            role: 'tool_result',
            content: summarizeMcpVisibleResult(execution),
            timestamp: Date.now(),
            attachments: [],
            mcpExecutionId: execution.id,
            status: execution.status,
            toolName: execution.toolName,
            serverName: execution.serverName,
            toolArgs: execution.args || {},
            toolPreview: summarizeMcpVisibleResult(execution),
            toolImages,
            toolRawOutput: execution.status === 'success'
                ? sanitizeMcpToolResult(redactMcpToolImages(execution.result)).slice(0, 20000)
                : execution.error || 'No output'
        });
    }

    function extractMcpToolImages(value, images = []) {
        if (images.length >= 8 || value == null) return images;
        if (typeof value === 'string') {
            const image = normalizeMcpImageData(value);
            if (image) images.push(image);
            return images;
        }
        if (Array.isArray(value)) {
            for (const item of value) extractMcpToolImages(item, images);
            return images;
        }
        if (typeof value === 'object') {
            for (const [key, item] of Object.entries(value)) {
                if (typeof item === 'string') {
                    const image = normalizeMcpImageData(item, key);
                    if (image) images.push(image);
                } else {
                    extractMcpToolImages(item, images);
                }
                if (images.length >= 8) break;
            }
        }
        return images;
    }

    function normalizeMcpImageData(value, key = '') {
        const text = String(value || '').trim();
        const hint = String(key || '').toLowerCase();
        const dataUrlMatch = text.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
        if (dataUrlMatch) {
            const mime = dataUrlMatch[1].toLowerCase() === 'jpg' ? 'jpeg' : dataUrlMatch[1].toLowerCase();
            return { mimeType: `image/${mime}`, src: `data:image/${mime};base64,${dataUrlMatch[2].replace(/\s+/g, '')}` };
        }
        const compact = text.replace(/\s+/g, '');
        const keySuggestsImage = /screenshot|image|png|jpeg|jpg|base64|data/.test(hint);
        const looksLikePng = compact.startsWith('iVBOR') && compact.length > 80;
        const looksLikeJpeg = compact.startsWith('/9j/') && compact.length > 80;
        if (keySuggestsImage && looksLikePng) return { mimeType: 'image/png', src: `data:image/png;base64,${compact}` };
        if (keySuggestsImage && looksLikeJpeg) return { mimeType: 'image/jpeg', src: `data:image/jpeg;base64,${compact}` };
        if (looksLikePng) return { mimeType: 'image/png', src: `data:image/png;base64,${compact}` };
        return null;
    }

    function redactMcpToolImages(value) {
        if (value == null) return value;
        if (typeof value === 'string') return normalizeMcpImageData(value) ? `[base64 image ${value.length} chars]` : value;
        if (Array.isArray(value)) return value.map(redactMcpToolImages);
        if (typeof value === 'object') {
            const redacted = {};
            for (const [key, item] of Object.entries(value)) {
                if (typeof item === 'string' && normalizeMcpImageData(item, key)) {
                    redacted[key] = `[base64 image ${item.length} chars]`;
                } else {
                    redacted[key] = redactMcpToolImages(item);
                }
            }
            return redacted;
        }
        return value;
    }

    function summarizeMcpVisibleResult(execution) {
        if (execution.status !== 'success') {
            return `${execution.serverName} / ${execution.toolName} failed: ${execution.error || 'No output'}`;
        }
        const result = execution.result || {};
        if (result.repo && result.path) {
            return `${execution.serverName} read ${result.repo}/${result.path} (${formatFileSize(result.size || 0)}).`;
        }
        if (result.fullName) {
            return `${execution.serverName} loaded ${result.fullName}: ${result.description || 'repository metadata'}.`;
        }
        if (Array.isArray(result.status)) {
            return `${execution.serverName} checked git status: ${result.status.length ? `${result.status.length} entries` : 'clean'}.`;
        }
        if (Array.isArray(result.commits)) {
            return `${execution.serverName} returned ${result.commits.length} commits.`;
        }
        if (result.ok && result.node) {
            return `${execution.serverName} is healthy on Node ${result.node}.`;
        }
        if (Array.isArray(result.entries)) {
            return `${execution.serverName} listed ${result.entries.length} project entries.`;
        }
        if (result.screen && Array.isArray(result.visibleButtons)) {
            return `${execution.serverName} summarized ${result.screen}: ${result.visibleButtons.length} visible buttons, ${result.visibleInputs?.length || 0} inputs.`;
        }
        if (Array.isArray(result.groups)) {
            const count = result.groups.reduce((total, group) => total + (group.elements?.length || 0), 0);
            return `${execution.serverName} found ${count} interactive elements across ${result.groups.length} regions.`;
        }
        if (Array.isArray(result.issues)) {
            return `${execution.serverName} found ${result.issueCount || result.issues.length} layout issues.`;
        }
        if (Array.isArray(result.surfaces)) {
            const passed = result.surfaces.filter(surface => surface.opened && surface.rendered && surface.closed).length;
            return `${execution.serverName} smoke-tested ${result.surfaces.length} surfaces: ${passed} passed.`;
        }
        if (Array.isArray(result.consoleEntries)) {
            return `${execution.serverName} returned ${result.count || result.consoleEntries.length} console issues.`;
        }
        if (typeof result.clicked === 'boolean') {
            if (result.clicked) return `${execution.serverName} clicked "${result.match?.label || result.requestedText}".`;
            if (result.requiresApproval) return `${execution.serverName} blocked a destructive click pending approval.`;
            return `${execution.serverName} could not click "${result.requestedText || 'requested control'}": ${result.reason || 'no match'}.`;
        }
        if (Array.isArray(result.notes)) {
            return `${execution.serverName} listed ${result.notes.length} notes.`;
        }
        if (Array.isArray(result.matches)) {
            return `${execution.serverName} found ${result.matches.length} matches.`;
        }
        if (result.title && result.url) {
            return `${execution.serverName} fetched “${result.title}”.`;
        }
        if (result.screenshotBase64) {
            return `${execution.serverName} captured a browser screenshot${result.url ? ` from ${result.url}` : ''}.`;
        }
        if (Array.isArray(result.files)) {
            return `${execution.serverName} listed ${result.files.length} files${result.path ? ` in ${result.path}` : ''}.`;
        }
        if (Array.isArray(result)) {
            return `${execution.serverName} returned ${result.length} items from ${execution.toolName}.`;
        }
        return `${execution.serverName} completed ${execution.toolName}.`;
    }

    function buildMcpFallbackResultMessage(execution) {
        return {
            role: 'user',
            content: execution.status === 'success'
                ? `MCP tool result from ${execution.serverName} / ${execution.toolName}. Use this result to answer my previous request:\n\n${sanitizeMcpToolResult(execution.result)}`
                : `MCP tool ${execution.status} from ${execution.serverName} / ${execution.toolName}. Explain the failure and suggest the next fix:\n\n${execution.error || 'No output'}`
        };
    }

    function extractReasoningFromDelta(delta) {
        const parts = [];
        if (typeof delta.reasoning === 'string') parts.push(delta.reasoning);
        if (typeof delta.reasoning_content === 'string') parts.push(delta.reasoning_content);
        if (Array.isArray(delta.reasoning_details)) {
            parts.push(...delta.reasoning_details.map(formatReasoningDetail).filter(Boolean));
        }
        return parts.join('');
    }

    function formatReasoningDetail(detail) {
        if (!detail || typeof detail !== 'object') return '';
        if (typeof detail.text === 'string') return detail.text;
        if (typeof detail.summary === 'string') return detail.summary;
        if (detail.type === 'reasoning.encrypted') return '[Some reasoning content is encrypted]';
        if (typeof detail.data === 'string' && detail.data.includes('[REDACTED]')) return '[Some reasoning content is redacted]';
        return '';
    }

    function separateInlineThinking(content) {
        const source = String(content || '');
        let reasoning = '';
        let visible = source.replace(/<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/gi, (match, thought) => {
            reasoning += (reasoning ? '\n\n' : '') + thought.trim();
            return '';
        });
        visible = visible.replace(/<\/think(?:ing)?>/gi, '');
        return { content: visible.trimStart(), reasoning: reasoning.trim() };
    }

async function readStreamingCompletion(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let fullReasoning = '';
        let usage = null;
        let finishReason = null;
        let buffer = '';
        const toolCallParts = [];

        while (true) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = done ? '' : lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (!data) continue;
                if (data === '[DONE]') {
                    buffer = '';
                    continue;
                }
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.usage) usage = normalizeUsage(parsed.usage);
                    if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
                    const deltaObject = parsed.choices?.[0]?.delta || {};
                    const delta = deltaObject.content;
                    const reasoningDelta = extractReasoningFromDelta(deltaObject);
                    if (reasoningDelta) {
                        fullReasoning += reasoningDelta;
                        updateStreamingMessage(stripVisibleMcpToolMarkup(fullContent), fullReasoning);
                    }
                    if (delta) {
                        fullContent += delta;
                        const separated = separateInlineThinking(fullContent);
                        const visibleReasoning = [fullReasoning, separated.reasoning].filter(Boolean).join('\n\n').trim();
                        updateStreamingMessage(stripVisibleMcpToolMarkup(separated.content), visibleReasoning);
                    }
                    for (const part of extractProviderToolCallsFromChunk(deltaObject)) {
                        const index = part.index || 0;
                        toolCallParts[index] = toolCallParts[index] || { id: part.id || generateId(), function: { name: '', arguments: '' } };
                        if (part.id) toolCallParts[index].id = part.id;
                        if (part.function?.name) toolCallParts[index].function.name += part.function.name;
                        if (part.function?.arguments) toolCallParts[index].function.arguments += part.function.arguments;
                    }
                } catch (e) {
                    console.warn('Skipped malformed stream line:', e);
                }
            }
            if (done) break;
        }

        const separated = separateInlineThinking(fullContent);
        const reasoning = [fullReasoning, separated.reasoning].filter(Boolean).join('\n\n').trim();
        return {
            content: separated.content,
            reasoning,
            usage,
            finishReason,
            toolCalls: parseProviderToolCallsFromMessage({ tool_calls: toolCallParts.filter(Boolean) })
        };
    }

    function stripVisibleMcpToolMarkup(content) {
        if (window.ArchitectMCP?.stripToolMarkup) return window.ArchitectMCP.stripToolMarkup(content);
        return typeof stripFallbackMcpToolMarkup === 'function'
            ? stripFallbackMcpToolMarkup(content)
            : content;
    }

    function sanitizeAssistantVisibleContent(content) {
        return stripVisibleMcpToolMarkup(String(content || ''));
    }

    async function sendMessage() {
        const content = el.messageInput.value.trim();
        const directMcpCommand = content && typeof parseMcpDirectCommand === 'function'
            ? parseMcpDirectCommand(content)
            : { handled: false };
        if ((!content && state.attachments.length === 0) || state.isStreaming || (!state.selectedModel && !directMcpCommand.handled)) return;
        if (!directMcpCommand.handled && !getApiKey()) { openSettings(true); showToast(`Add a ${getProvider().label} API key to continue`, 'error'); return; }
        if (!directMcpCommand.handled && typeof canSendNanoGptSelection === 'function' && !canSendNanoGptSelection()) {
            showToast('Selected model is not available in NanoGPT Subscription mode. Refresh models or choose a subscription model.', 'error');
            return;
        }
        if (!state.currentChatId) createNewChat();
        const streamChatId = state.currentChatId;

        const userMessage = { role: 'user', content: content || '(attached files)', timestamp: Date.now(), attachments: [...state.attachments] };
        state.messages.push(userMessage);
        const userMessageIndex = state.messages.length - 1;
        
        el.messageInput.value = '';
        autoResizeTextarea(el.messageInput);
        state.attachments = [];
        renderAttachmentsPreview();
        renderMessages();
        syncCurrentChatMessages();
        saveChats();
        if (typeof queueMemorySuggestionsForMessage === 'function') queueMemorySuggestionsForMessage(userMessage, userMessageIndex);
        renderChatList();
        scrollToBottom();

        if (directMcpCommand.handled) {
            await handleDirectMcpCommand(directMcpCommand);
            return;
        }
        
        state.isStreaming = true;
        state.followStream = true;
        state.activeStream = {
            chatId: streamChatId,
            content: '',
            reasoning: '',
            thinkingRequested: getDeepSeekThinkingEnabled(),
            thinkingProvider: state.provider,
            thinkingModel: state.selectedModel?.id || null,
            startedAt: Date.now(),
            mode: 'send'
        };
        state.abortController = new AbortController();
        el.stopBtn.classList.add('visible');
        el.sendBtn.disabled = true;
        updateStats();
        updateDeepSeekThinkingUI();
        updateConversationNavState();

        addStreamingMessage();

        try {
            await refreshMcpMemoryContext(userMessage.content || '');
            const result = await runCompletionWithMcpTools(buildApiMessages(state.messages));
            finalizeStreamingMessage(result.content, result.usage, state.activeStream, result.reasoning, result.finishReason);
        } catch (error) {
            handleStreamFailure(error, { removeUserMessage: error.name !== 'AbortError', fallback: 'Failed to send message' });
        } finally {
            state.isStreaming = false;
            state.abortController = null;
            state.activeStream = null;
            el.stopBtn.classList.remove('visible');
            updateStats();
            updateSendButton();
            updateDeepSeekThinkingUI();
            updateConversationNavState();
        }
    }

    async function handleDirectMcpCommand(command) {
        state.isStreaming = true;
        updateSendButton();
        updateConversationNavState();
        try {
            if (window.ArchitectMCP?.executeDirectCommand) {
                const result = await window.ArchitectMCP.executeDirectCommand(command);
                state.messages.push(...(result.messages || []));
                syncCurrentChatMessages();
                saveChats();
                renderMessages();
                renderChatList();
                scrollToBottom();
                return;
            }
            if (command.type === 'list_tools') {
                appendMcpToolListMessage();
            } else if (command.error) {
                appendDirectMcpErrorMessage(command.error, command.details || {});
            } else if (command.type === 'tool_calls') {
                for (const call of command.toolCalls || []) {
                    const execution = await executeMcpToolCall(call.name, call.arguments || {});
                    appendVisibleToolResultMessage(execution);
                }
            }
            syncCurrentChatMessages();
            saveChats();
            renderMessages();
            renderChatList();
            scrollToBottom();
        } catch (error) {
            appendDirectMcpErrorMessage(error.message || 'MCP command failed.', {});
            syncCurrentChatMessages();
            saveChats();
            renderMessages();
            scrollToBottom();
        } finally {
            state.isStreaming = false;
            updateStats();
            updateSendButton();
            updateConversationNavState();
        }
    }

    function appendDirectMcpErrorMessage(message, details = {}) {
        state.messages.push({
            role: 'tool_result',
            content: `MCP command blocked: ${message}`,
            timestamp: Date.now(),
            attachments: [],
            status: 'failed',
            toolName: 'mcp_command',
            serverName: 'MCP Command',
            toolArgs: details,
            toolPreview: message,
            toolImages: [],
            toolRawOutput: JSON.stringify({ message, details }, null, 2)
        });
    }

    function appendMcpToolListMessage() {
        const summary = typeof buildMcpToolListSummary === 'function'
            ? buildMcpToolListSummary()
            : 'No MCP tool summary is available.';
        state.messages.push({
            role: 'tool_result',
            content: summary,
            timestamp: Date.now(),
            attachments: [],
            status: 'success',
            toolName: 'tools',
            serverName: 'MCP',
            toolArgs: {},
            toolPreview: summary,
            toolImages: [],
            toolRawOutput: summary
        });
    }

    async function refreshMcpMemoryContext(query) {
        state.mcpMemoryContext = [];
        const memoryServer = getWorkspaceMcpServers().find(server => server.type === 'memory' && server.enabled);
        if (!memoryServer || location.protocol === 'file:') return;
        try {
            const response = await callMcpSystemTool('memory', 'memory_recall', {
                query: String(query || '').slice(0, 1000),
                limit: 5,
                workspace: state.activeWorkspaceId || 'default'
            });
            state.mcpMemoryContext = response.result?.memories || response.memories || [];
            updateContextInspector();
        } catch (error) {
            console.warn('MCP memory recall failed:', error.message || error);
        }
    }

    function stopGeneration() {
        if (state.abortController) state.abortController.abort();
    }

    // ============================================
