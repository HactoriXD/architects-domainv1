// Copy code to clipboard
    window.copyCode = async function(codeId) {
        const block = document.querySelector(`[data-code-id="${codeId}"]`);
        if (!block) return;
        const codeEl = block.querySelector('code');
        const rawCode = decodeURIComponent(codeEl.dataset.raw);
        
        try {
            await navigator.clipboard.writeText(rawCode);
            const btn = block.querySelector('.code-copy-btn');
            btn.classList.add('copied');
            btn.querySelector('span').textContent = 'Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.querySelector('span').textContent = 'Copy';
            }, 2000);
        } catch (err) {
            showToast('Failed to copy code', 'error');
        }
    };

    // Copy message content
    window.copyMessage = async function(index) {
        const msg = state.messages[index];
        if (!msg) return;
        
        try {
            await navigator.clipboard.writeText(msg.content);
            const btn = document.querySelector(`.message[data-index="${index}"] .copy-btn`);
            if (btn) {
                btn.classList.add('copied');
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy';
                }, 2000);
            }
            showToast('Copied to clipboard', 'success');
        } catch (err) {
            showToast('Failed to copy', 'error');
        }
    };

    window.toggleMessageThinking = function(index) {
        const panel = document.querySelector(`.message[data-index="${index}"] .message-thinking`);
        const button = document.querySelector(`.message[data-index="${index}"] .message-thinking-toggle`);
        if (!panel || !button) return;
        const open = panel.classList.toggle('open');
        button.setAttribute('aria-expanded', String(open));
        const hasThinking = !panel.classList.contains('empty');
        button.querySelector('span').textContent = open
            ? 'Hide Thinking'
            : hasThinking ? 'Show Thinking' : 'Thinking Unavailable';
    };

    // Edit message
    window.editMessage = function(index) {
        const msgEl = document.querySelector(`.message[data-index="${index}"]`);
        if (!msgEl) return;
        msgEl.classList.add('editing');
        const textarea = msgEl.querySelector('.message-edit-textarea');
        if (textarea) {
            // Use the raw content from state, not the escaped HTML
            textarea.value = state.messages[index].content;
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
    };

    window.cancelEdit = function(index) {
        const msgEl = document.querySelector(`.message[data-index="${index}"]`);
        if (msgEl) msgEl.classList.remove('editing');
    };

    window.saveEdit = async function(index) {
        if (state.isStreaming) {
            showToast('Stop the current generation before editing', 'info');
            return;
        }
        const msgEl = document.querySelector(`.message[data-index="${index}"]`);
        if (!msgEl) return;
        const textarea = msgEl.querySelector('.message-edit-textarea');
        const newContent = textarea.value.trim();
        if (!newContent) return;
        
        // Update the message and remove all messages after it
        state.messages[index].content = newContent;
        state.messages = state.messages.slice(0, index + 1);
        refreshLastUsageFromMessages();
        
        // Save and re-render
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].messages = [...state.messages];
            state.chats[state.currentChatId].lastUsage = state.lastUsage;
            state.chats[state.currentChatId].updatedAt = Date.now();
            saveChats();
        }
        
        renderMessages();
        
        // If it was a user message, regenerate the response
        if (state.messages[index].role === 'user') {
            await regenerateFromIndex(index);
        }
    };

function renderMessages() {
        if (state.messages.length === 0) {
            el.emptyState.style.display = 'flex';
            el.messagesList.style.display = 'none';
            el.scrollToBottom.classList.remove('visible');
            updateConversationNavState();
            return;
        }
        el.emptyState.style.display = 'none';
        el.messagesList.style.display = 'flex';
        el.messagesList.innerHTML = state.messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isTool = msg.role === 'tool_result';
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            let attachmentsHtml = '';
            if (msg.attachments?.length) {
                attachmentsHtml = '<div class="message-attachments">' + msg.attachments.map((att, attachmentIndex) => att.type === 'image'
                    ? `<button class="message-attachment image" type="button" onclick="openMessageImage(${i}, ${attachmentIndex})" title="Open image"><img src="${att.data}" alt="${escapeHtml(att.name)}" loading="lazy"></button>`
                    : `<div class="message-attachment file"><div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="file-info"><div class="file-name">${escapeHtml(att.name)}</div><div class="file-size">${formatFileSize(att.size)}</div></div></div>`
                ).join('') + '</div>';
            }
            const statusHtml = msg.status
                ? `<div class="message-status ${msg.status}">${msg.status === 'error' ? 'Request failed' : msg.role === 'tool_result' ? `Tool ${escapeHtml(msg.status)}` : 'Generation stopped'}</div>`
                : '';
            
            // Action buttons
            const userActions = `
                <div class="message-actions">
                    <button class="message-action-btn copy-btn" onclick="copyMessage(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
                    <button class="message-action-btn" onclick="editMessage(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
                </div>`;
            
            const assistantActions = `
                <div class="message-actions">
                    <button class="message-action-btn copy-btn" onclick="copyMessage(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
                    <button class="message-action-btn" onclick="editMessage(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
                    <button class="message-action-btn" onclick="regenerateResponse(${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Regenerate</button>
                </div>`;
            
            // Edit form (hidden by default) - escape content for safety
            const escapedContent = escapeHtml(msg.content);
            const toolBodyHtml = isTool ? renderToolResultBody(msg) : '';
            const thinkingHtml = !isUser && !isTool ? renderThinkingPanel(msg, i) : '';
            const editForm = `
                <div class="message-edit-container">
                    <textarea class="message-edit-textarea">${escapedContent}</textarea>
                    <div class="message-edit-actions">
                        <button class="btn" onclick="cancelEdit(${i})">Cancel</button>
                        <button class="btn btn-primary" onclick="saveEdit(${i})">Save</button>
                    </div>
                </div>`;
            
            return `<div class="message ${msg.role}" data-index="${i}">
                <div class="message-avatar">${isUser 
                    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
                    : isTool ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4l6 6-6 6"/><path d="M4 20v-7a3 3 0 0 1 3-3h13"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
                }</div>
                <div class="message-content">
                    <div class="message-header"><span class="message-role">${isUser ? 'You' : isTool ? 'MCP Tool' : CONFIG.ASSISTANT_NAME}</span><span class="message-time">${time}</span></div>
                    ${attachmentsHtml}
                    ${thinkingHtml}
                    <div class="message-body message-bubble">${isTool ? toolBodyHtml : formatMessageContent(msg.content)}</div>
                    ${statusHtml}
                    ${editForm}
                    ${isTool ? '' : isUser ? userActions : assistantActions}
                </div>
            </div>`;
        }).join('');
        updateConversationNavState();
    }

    function renderToolResultBody(msg) {
        const status = escapeHtml(msg.status || 'done');
        const server = escapeHtml(msg.serverName || 'MCP');
        const tool = escapeHtml(msg.toolName || 'tool');
        const preview = escapeHtml(msg.toolPreview || msg.content || 'Tool completed.');
        const args = escapeHtml(JSON.stringify(msg.toolArgs || {}, null, 2));
        const images = getToolResultImages(msg);
        const output = escapeHtml(redactToolResultImagesForDisplay(String(msg.toolRawOutput || '').slice(0, 12000)));
        const imagesHtml = images.map((image, index) => (
            `<img class="tool-result-screenshot" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || `Tool image ${index + 1}`)}" loading="lazy" style="max-width:100%;border-radius:8px;margin-top:8px;">`
        )).join('');
        return `
            <div class="tool-result-card">
                <div class="tool-result-top">
                    <span class="tool-result-pill ${status}">${status}</span>
                    <strong>${server} / ${tool}</strong>
                </div>
                <div class="tool-result-preview">${preview}</div>
                ${imagesHtml}
                <details class="tool-result-details">
                    <summary>Show tool output</summary>
                    <div class="tool-result-grid">
                        <div>
                            <span>Arguments</span>
                            <pre>${args}</pre>
                        </div>
                        <div>
                            <span>Output</span>
                            <pre>${output || 'No output'}</pre>
                        </div>
                    </div>
                </details>
            </div>
        `;
    }

    function getToolResultImages(msg) {
        const images = [];
        const seen = new Set();
        const addImage = (image) => {
            if (!image?.src || seen.has(image.src)) return;
            seen.add(image.src);
            images.push(image);
        };
        for (const image of msg.toolImages || []) addImage(image);
        try {
            collectToolResultImages(JSON.parse(msg.toolRawOutput || '{}'), addImage);
        } catch (error) {
            collectToolResultImages(msg.toolRawOutput || '', addImage);
        }
        return images.slice(0, 8);
    }

    function collectToolResultImages(value, addImage, key = '') {
        if (value == null) return;
        if (typeof value === 'string') {
            const image = normalizeToolResultImage(value, key);
            if (image) addImage(image);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => collectToolResultImages(item, addImage, key));
            return;
        }
        if (typeof value === 'object') {
            Object.entries(value).forEach(([childKey, childValue]) => {
                collectToolResultImages(childValue, addImage, childKey);
            });
        }
    }

    function normalizeToolResultImage(value, key = '') {
        const text = String(value || '').trim();
        const hint = String(key || '').toLowerCase();
        const dataUrlMatch = text.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
        if (dataUrlMatch) {
            const ext = dataUrlMatch[1].toLowerCase() === 'jpg' ? 'jpeg' : dataUrlMatch[1].toLowerCase();
            return { src: `data:image/${ext};base64,${dataUrlMatch[2].replace(/\s+/g, '')}`, alt: 'Tool image' };
        }
        const compact = text.replace(/\s+/g, '');
        const keySuggestsImage = /screenshot|image|png|jpeg|jpg|base64|data/.test(hint);
        if ((keySuggestsImage || compact.length > 1000) && compact.startsWith('iVBOR')) {
            return { src: `data:image/png;base64,${compact}`, alt: 'Tool PNG image' };
        }
        if ((keySuggestsImage || compact.length > 1000) && compact.startsWith('/9j/')) {
            return { src: `data:image/jpeg;base64,${compact}`, alt: 'Tool JPEG image' };
        }
        return null;
    }

    function redactToolResultImagesForDisplay(output) {
        return output
            .replace(/data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\s]{80,}/gi, '[base64 image]')
            .replace(/"((?:screenshot|screenshotBase64|image|data)[^"]*)"\s*:\s*"((?:iVBOR|\/9j\/)[A-Za-z0-9+/=\s]{80,})"/gi, '"$1": "[base64 image]"');
    }

    function renderThinkingPanel(msg, index) {
        const text = String(msg?.reasoning || '').trim();
        const wasRequested = Boolean(msg?.reasoningRequested);
        if (!text && !wasRequested) return '';
        const provider = PROVIDERS[msg?.reasoningProvider]?.label || getProvider().label;
        const body = text || `${provider} did not return visible thinking for this response. Some models keep reasoning hidden even when thinking is enabled, or only return summaries/encrypted placeholders.`;
        const buttonText = text ? 'Show Thinking' : 'Thinking Unavailable';
        return `
            <div class="message-thinking ${text ? '' : 'empty'}">
                <button class="message-thinking-toggle" type="button" aria-expanded="false" onclick="toggleMessageThinking(${index})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.93 4.93l2.12 2.12"/><path d="M16.95 16.95l2.12 2.12"/><path d="M19.07 4.93l-2.12 2.12"/><path d="M7.05 16.95l-2.12 2.12"/></svg>
                    <span>${buttonText}</span>
                </button>
                <div class="message-thinking-body">${formatMessageContent(body)}</div>
            </div>
        `;
    }

    function addStreamingMessage(options = {}) {
        if (document.getElementById('streaming-message')) return;
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.id = 'streaming-message';
        div.innerHTML = `<div class="message-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
            <div class="message-content"><div class="message-header"><span class="message-role">${CONFIG.ASSISTANT_NAME}</span><span class="message-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
            <div class="message-thinking streaming-thinking" hidden>
                <button class="message-thinking-toggle" type="button" aria-expanded="false" onclick="this.closest('.message-thinking').classList.toggle('open'); this.setAttribute('aria-expanded', String(this.closest('.message-thinking').classList.contains('open'))); this.querySelector('span').textContent = this.closest('.message-thinking').classList.contains('open') ? 'Hide Thinking' : 'Show Thinking';">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.93 4.93l2.12 2.12"/><path d="M16.95 16.95l2.12 2.12"/><path d="M19.07 4.93l-2.12 2.12"/><path d="M7.05 16.95l-2.12 2.12"/></svg>
                    <span>Show Thinking</span>
                </button>
                <div class="message-thinking-body"></div>
            </div>
            <div class="message-body message-bubble"><div class="typing-indicator"><span class="typing-bar"></span></div></div></div>`;
        el.messagesList.appendChild(div);
        updateConversationNavState();
        if (options.scroll !== false) scrollToBottom();
    }

    let pendingStreamingContent = '';
    let streamingRenderFrame = null;

    function cancelStreamingRender() {
        if (streamingRenderFrame !== null) {
            cancelAnimationFrame(streamingRenderFrame);
            streamingRenderFrame = null;
        }
        pendingStreamingContent = '';
    }

    function renderPendingStreamingMessage() {
        streamingRenderFrame = null;
        if (state.activeStream && state.activeStream.chatId !== state.currentChatId) return;
        const div = document.getElementById('streaming-message');
        if (div) {
            const shouldFollowStream = state.followStream && isNearMessageBottom(120);
            const body = div.querySelector('.message-body');
            const thinking = div.querySelector('.streaming-thinking');
            const thinkingBody = thinking?.querySelector('.message-thinking-body');
            if (thinking && thinkingBody) {
                const reasoning = String(state.activeStream?.reasoning || '').trim();
                const requested = Boolean(state.activeStream?.thinkingRequested);
                thinking.hidden = !reasoning && !requested;
                thinking.classList.toggle('empty', !reasoning && requested);
                const toggleLabel = thinking.querySelector('.message-thinking-toggle span');
                if (toggleLabel) toggleLabel.textContent = reasoning ? 'Show Thinking' : 'Thinking Requested';
                thinkingBody.innerHTML = reasoning
                    ? formatMessageContent(reasoning, false, true)
                    : formatMessageContent('Waiting for visible thinking from the provider...', false, true);
            }
            body.style.whiteSpace = '';
            body.innerHTML = formatMessageContent(pendingStreamingContent, false, true);
            if (shouldFollowStream) {
                scrollToBottom({ behavior: 'auto' });
            } else {
                state.followStream = false;
                checkScrollPosition();
            }
            updateConversationNavState();
        }
    }

    function updateStreamingMessage(content, reasoning = null) {
        if (state.activeStream) state.activeStream.content = content;
        if (state.activeStream && reasoning !== null) state.activeStream.reasoning = String(reasoning || '');
        if (state.activeStream && state.activeStream.chatId !== state.currentChatId) return;
        pendingStreamingContent = String(content ?? '');
        if (streamingRenderFrame === null) {
            streamingRenderFrame = requestAnimationFrame(renderPendingStreamingMessage);
        }
    }
