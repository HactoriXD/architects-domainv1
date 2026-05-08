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
        state.activeStream = { chatId: streamChatId, content: '', startedAt: Date.now(), mode: 'regenerate' };
        state.abortController = new AbortController();
        el.stopBtn.classList.add('visible');
        el.sendBtn.disabled = true;
        updateConversationNavState();

        const apiMessages = buildApiMessages(state.messages.slice(0, userMsgIndex + 1));

        addStreamingMessage();

        try {
            const requestBody = buildRequestBody(apiMessages);

            const response = await fetch(`${getProvider().apiBase}/chat/completions`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify(requestBody),
                signal: state.abortController.signal
            });

            if (!response.ok) throw new Error(await parseApiError(response));

            const result = await readStreamingCompletion(response);
            finalizeStreamingMessage(result.content, result.usage, state.activeStream);
        } catch (error) {
            handleStreamFailure(error, { removeUserMessage: false, fallback: 'Failed to regenerate' });
        } finally {
            state.isStreaming = false;
            state.abortController = null;
            state.activeStream = null;
            el.stopBtn.classList.remove('visible');
            updateStats();
            updateSendButton();
            updateConversationNavState();
        }
    }

function finalizeStreamingMessage(content, usage = null, stream = state.activeStream) {
        if (!stream?.chatId) return;
        const chat = state.chats[stream.chatId];
        if (!chat) return;
        if (stream.chatId === state.currentChatId) removeStreamingElement();
        const assistantMessage = { role: 'assistant', content, timestamp: Date.now(), attachments: [], usage };
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
                const stoppedMessage = { role: 'assistant', content: stream.content, timestamp: Date.now(), attachments: [], usage: null, status: 'stopped' };
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

async function readStreamingCompletion(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let usage = null;
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = done ? '' : lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (!data || data === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.usage) usage = normalizeUsage(parsed.usage);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        updateStreamingMessage(fullContent);
                    }
                } catch (e) {
                    console.warn('Skipped malformed stream line:', e);
                }
            }
            if (done) break;
        }

        return { content: fullContent, usage };
    }

    async function sendMessage() {
        const content = el.messageInput.value.trim();
        if ((!content && state.attachments.length === 0) || state.isStreaming || !state.selectedModel) return;
        if (!getApiKey()) { openSettings(true); showToast(`Add a ${getProvider().label} API key to continue`, 'error'); return; }
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
        
        state.isStreaming = true;
        state.followStream = true;
        state.activeStream = { chatId: streamChatId, content: '', startedAt: Date.now(), mode: 'send' };
        state.abortController = new AbortController();
        el.stopBtn.classList.add('visible');
        el.sendBtn.disabled = true;
        updateStats();
        updateConversationNavState();

        const apiMessages = buildApiMessages(state.messages);

        addStreamingMessage();

        try {
            const requestBody = buildRequestBody(apiMessages);

            const response = await fetch(`${getProvider().apiBase}/chat/completions`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify(requestBody),
                signal: state.abortController.signal
            });

            if (!response.ok) throw new Error(await parseApiError(response));

            const result = await readStreamingCompletion(response);
            finalizeStreamingMessage(result.content, result.usage, state.activeStream);
        } catch (error) {
            handleStreamFailure(error, { removeUserMessage: error.name !== 'AbortError', fallback: 'Failed to send message' });
        } finally {
            state.isStreaming = false;
            state.abortController = null;
            state.activeStream = null;
            el.stopBtn.classList.remove('visible');
            updateStats();
            updateSendButton();
            updateConversationNavState();
        }
    }

    function stopGeneration() {
        if (state.abortController) state.abortController.abort();
    }

    // ============================================
