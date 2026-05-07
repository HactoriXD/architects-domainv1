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
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            let attachmentsHtml = '';
            if (msg.attachments?.length) {
                attachmentsHtml = '<div class="message-attachments">' + msg.attachments.map(att => att.type === 'image'
                    ? `<div class="message-attachment image"><img src="${att.data}" alt="${escapeHtml(att.name)}"></div>`
                    : `<div class="message-attachment file"><div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="file-info"><div class="file-name">${escapeHtml(att.name)}</div><div class="file-size">${formatFileSize(att.size)}</div></div></div>`
                ).join('') + '</div>';
            }
            const statusHtml = msg.status
                ? `<div class="message-status ${msg.status}">${msg.status === 'error' ? 'Request failed' : 'Generation stopped'}</div>`
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
                    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
                }</div>
                <div class="message-content">
                    <div class="message-header"><span class="message-role">${isUser ? 'You' : CONFIG.ASSISTANT_NAME}</span><span class="message-time">${time}</span></div>
                    ${attachmentsHtml}
                    <div class="message-body message-bubble">${formatMessageContent(msg.content)}</div>
                    ${statusHtml}
                    ${editForm}
                    ${isUser ? userActions : assistantActions}
                </div>
            </div>`;
        }).join('');
        updateConversationNavState();
    }

    function addStreamingMessage(options = {}) {
        if (document.getElementById('streaming-message')) return;
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.id = 'streaming-message';
        div.innerHTML = `<div class="message-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
            <div class="message-content"><div class="message-header"><span class="message-role">${CONFIG.ASSISTANT_NAME}</span><span class="message-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
            <div class="message-body message-bubble"><div class="typing-indicator"><span class="typing-bar"></span></div></div></div>`;
        el.messagesList.appendChild(div);
        updateConversationNavState();
        if (options.scroll !== false) scrollToBottom();
    }

    function updateStreamingMessage(content) {
        if (state.activeStream) state.activeStream.content = content;
        if (state.activeStream && state.activeStream.chatId !== state.currentChatId) return;
        const div = document.getElementById('streaming-message');
        if (div) {
            const shouldFollowStream = state.followStream && isNearMessageBottom(120);
            const body = div.querySelector('.message-body');
            body.style.whiteSpace = '';
            body.innerHTML = formatMessageContent(content, false, true);
            if (shouldFollowStream) {
                scrollToBottom({ behavior: 'auto' });
            } else {
                state.followStream = false;
                checkScrollPosition();
            }
            updateConversationNavState();
        }
    }
