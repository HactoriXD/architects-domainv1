// File Handling
    // ============================================
    async function processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const isImage = file.type.startsWith('image/');
            reader.onload = (e) => resolve({ id: generateId(), name: file.name, size: file.size, type: isImage ? 'image' : 'file', mimeType: file.type, data: e.target.result });
            reader.onerror = () => reject(new Error('Failed to read file'));
            isImage ? reader.readAsDataURL(file) : reader.readAsText(file);
        });
    }

    function renderAttachmentsPreview() {
        if (state.attachments.length === 0) {
            el.attachmentsPreview.innerHTML = '';
            el.attachmentsPreview.classList.remove('has-attachments');
            updateSendButton();
            return;
        }
        el.attachmentsPreview.classList.add('has-attachments');
        el.attachmentsPreview.innerHTML = state.attachments.map(att => att.type === 'image'
            ? `<div class="attachment-preview-item image" data-id="${att.id}"><img src="${att.data}" alt="${escapeHtml(att.name)}"><button class="attachment-remove" onclick="removeAttachment('${att.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`
            : `<div class="attachment-preview-item file" data-id="${att.id}"><div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><span class="file-name">${escapeHtml(att.name)}</span><button class="attachment-remove" onclick="removeAttachment('${att.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`
        ).join('');
        updateSendButton();
    }

    window.removeAttachment = (id) => { state.attachments = state.attachments.filter(a => a.id !== id); renderAttachmentsPreview(); };

    function resetConversationScroll(position = 'top') {
        const top = position === 'bottom' ? el.messagesContainer.scrollHeight : 0;
        el.messagesContainer.scrollTo({ top, behavior: 'auto' });
        el.scrollToBottom.classList.remove('visible');
        state.followStream = position === 'bottom';
    }

    function removeStreamingElement() {
        const streaming = document.getElementById('streaming-message');
        if (streaming) streaming.remove();
    }

    function getCurrentChat() {
        return state.currentChatId ? state.chats[state.currentChatId] : null;
    }

    function syncCurrentChatMessages() {
        const chat = getCurrentChat();
        if (!chat) return;
        chat.messages = [...state.messages];
        chat.lastUsage = state.lastUsage;
        chat.updatedAt = Date.now();
    }

    // ============================================
    // Chat Management
    // ============================================
    function createNewChat() {
        const id = generateId();
        removeStreamingElement();
        state.chats[id] = { id, title: 'New Ritual', messages: [], systemPrompt: '', pinnedNotes: '', lastUsage: null, createdAt: Date.now(), updatedAt: Date.now() };
        state.currentChatId = id;
        state.messages = [];
        state.attachments = [];
        state.savedSystemPrompt = '';
        state.pinnedNotes = '';
        state.lastUsage = null;
        el.systemPrompt.value = '';
        el.systemPromptBadge.style.display = 'none';
        el.pinnedContext.value = '';
        updatePinnedContextUI();
        renderAttachmentsPreview();
        renderMessages();
        resetConversationScroll('top');
        renderChatList();
        saveChats();
        return id;
    }

    function loadChat(id) {
        const chat = state.chats[id];
        if (!chat) return;
        removeStreamingElement();
        state.currentChatId = id;
        state.messages = [...chat.messages];
        state.savedSystemPrompt = chat.systemPrompt || '';
        state.pinnedNotes = chat.pinnedNotes || '';
        state.lastUsage = chat.lastUsage || null;
        el.systemPrompt.value = state.savedSystemPrompt;
        el.systemPromptBadge.style.display = state.savedSystemPrompt ? 'inline-block' : 'none';
        el.pinnedContext.value = state.pinnedNotes;
        updateSystemPromptStats();
        updatePinnedContextUI();
        state.attachments = [];
        renderAttachmentsPreview();
        renderMessages();
        if (state.activeStream?.chatId === id) {
            addStreamingMessage({ scroll: false });
            if (state.activeStream.content) updateStreamingMessage(state.activeStream.content);
        }
        requestAnimationFrame(() => resetConversationScroll('bottom'));
        renderChatList();
        updateStats();
        closeSidebar();
    }

    function deleteChat(id) {
        if (!confirm('Delete this chat?')) return;
        if (state.activeStream?.chatId === id && state.abortController) state.abortController.abort();
        delete state.chats[id];
        if (state.currentChatId === id) {
            const ids = Object.keys(state.chats);
            ids.length > 0 ? loadChat(ids[0]) : createNewChat();
        }
        renderChatList();
        saveChats();
        showToast('Chat deleted', 'success');
    }

    let renamingChatId = null;
    function openRenameModal(id) {
        renamingChatId = id;
        el.renameInput.value = state.chats[id]?.title || '';
        el.renameModal.classList.add('open');
        el.renameInput.focus();
    }

    function closeRenameModal() { el.renameModal.classList.remove('open'); renamingChatId = null; }

    function confirmRename() {
        if (renamingChatId && el.renameInput.value.trim()) {
            state.chats[renamingChatId].title = el.renameInput.value.trim();
            saveChats();
            renderChatList();
        }
        closeRenameModal();
    }

    function renderChatList(filter = '') {
        const chats = Object.values(state.chats).filter(c => !filter || c.title.toLowerCase().includes(filter.toLowerCase())).sort((a,b) => b.updatedAt - a.updatedAt);
        if (chats.length === 0) { el.chatList.innerHTML = '<div class="no-chats">No rituals yet</div>'; return; }
        
        const now = Date.now();
        const day = 24*60*60*1000;
        const today = [], yesterday = [], week = [], older = [];
        chats.forEach(c => {
            const age = now - c.updatedAt;
            if (age < day) today.push(c);
            else if (age < 2*day) yesterday.push(c);
            else if (age < 7*day) week.push(c);
            else older.push(c);
        });

        let html = '';
        const renderSection = (title, items) => {
            if (items.length === 0) return '';
            return `<div class="chat-list-section"><div class="chat-list-section-title">${title}</div>${items.map(c => `
                <div class="chat-item ${c.id === state.currentChatId ? 'active' : ''}" data-id="${c.id}">
                    <div class="chat-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                    <div class="chat-item-content"><div class="chat-item-title">${c.title}</div><div class="chat-item-preview">${c.messages.length ? `${c.messages.length} invocations` : 'Dormant'}${c.pinnedNotes ? ' · pinned' : ''}</div></div>
                    <div class="chat-item-actions">
                        <button class="chat-item-action" onclick="event.stopPropagation();openRenameModal('${c.id}')" title="Rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="chat-item-action delete" onclick="event.stopPropagation();deleteChat('${c.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </div>
                </div>`).join('')}</div>`;
        };
        html += renderSection('Today', today);
        html += renderSection('Yesterday', yesterday);
        html += renderSection('This Week', week);
        html += renderSection('Older', older);
        el.chatList.innerHTML = html;
        el.chatList.querySelectorAll('.chat-item').forEach(item => item.addEventListener('click', () => loadChat(item.dataset.id)));
    }
    window.openRenameModal = openRenameModal;
    window.deleteChat = deleteChat;

    // ============================================

// System Prompt
    // ============================================
    function toggleSystemPrompt() { el.systemPromptContainer.classList.toggle('collapsed'); el.systemPromptContainer.classList.toggle('expanded'); }
    function updateSystemPromptStats() {
        const text = el.systemPrompt.value;
        el.systemPromptWordCount.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
        el.systemPromptCharCount.textContent = text.length;
    }
    function saveSystemPrompt() {
        state.savedSystemPrompt = el.systemPrompt.value.trim();
        el.systemPromptBadge.style.display = state.savedSystemPrompt ? 'inline-block' : 'none';
        el.systemPromptSaved.classList.add('visible');
        setTimeout(() => el.systemPromptSaved.classList.remove('visible'), 2000);
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].systemPrompt = state.savedSystemPrompt;
            saveChats();
        }
        showToast('System prompt applied', 'success');
    }
    function clearSystemPrompt() {
        el.systemPrompt.value = '';
        state.savedSystemPrompt = '';
        el.systemPromptBadge.style.display = 'none';
        updateSystemPromptStats();
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].systemPrompt = '';
            saveChats();
        }
        updateStats();
    }

    function applySystemPromptPreset(preset) {
        const text = SYSTEM_PROMPT_PRESETS[preset];
        if (!text) return;
        el.systemPrompt.value = text;
        updateSystemPromptStats();
        showToast('Preset loaded', 'success');
    }

    // ============================================
    // Pinned Context
    // ============================================
    function togglePinnedContext() {
        el.pinnedContextContainer.classList.toggle('collapsed');
        el.pinnedContextContainer.classList.toggle('expanded');
    }

    function updatePinnedContextUI() {
        const text = el.pinnedContext.value;
        const active = state.pinnedNotes.trim().length > 0;
        el.pinnedContextWordCount.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
        el.pinnedContextCharCount.textContent = text.length;
        el.pinnedContextBadge.classList.toggle('visible', active);
    }

    function savePinnedContext() {
        state.pinnedNotes = el.pinnedContext.value.trim();
        updatePinnedContextUI();
        el.pinnedContextSaved.classList.add('visible');
        setTimeout(() => el.pinnedContextSaved.classList.remove('visible'), 2000);
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].pinnedNotes = state.pinnedNotes;
            state.chats[state.currentChatId].updatedAt = Date.now();
            saveChats();
            renderChatList();
        }
        updateStats();
        showToast(state.pinnedNotes ? 'Pinned context applied' : 'Pinned context cleared', 'success');
    }

    function clearPinnedContext() {
        el.pinnedContext.value = '';
        state.pinnedNotes = '';
        updatePinnedContextUI();
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].pinnedNotes = '';
            state.chats[state.currentChatId].updatedAt = Date.now();
            saveChats();
            renderChatList();
        }
        updateStats();
        showToast('Pinned context cleared', 'success');
    }

    // ============================================

// UI Helpers
    // ============================================
    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    function updateStats() {
        const draftTokens = estimateTokens(el.messageInput.value);
        if (state.lastUsage?.exact) {
            const input = state.lastUsage.input + draftTokens;
            const output = state.lastUsage.output;
            const total = state.lastUsage.total + draftTokens;
            el.inputTokens.textContent = formatContextSize(input);
            el.outputTokens.textContent = formatContextSize(output);
            el.contextUsed.textContent = formatContextSize(total);
            el.tokenUsageStat.title = draftTokens
                ? `Exact provider usage plus ~${draftTokens} draft tokens`
                : `Exact provider usage from ${state.lastUsage.provider} (${state.lastUsage.model})`;
            return;
        }

        const estimatedInput = draftTokens
            + estimateTokens(state.savedSystemPrompt)
            + estimateTokens(state.pinnedNotes)
            + state.messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        el.inputTokens.textContent = `~${formatContextSize(estimatedInput)}`;
        el.outputTokens.textContent = '~0';
        el.contextUsed.textContent = `~${formatContextSize(estimatedInput)}`;
        el.tokenUsageStat.title = 'Estimated locally until provider usage returns';
    }

    function updateSendButton() {
        const hasContent = el.messageInput.value.trim().length > 0 || state.attachments.length > 0;
        el.sendBtn.disabled = !hasContent || state.isStreaming || !state.selectedModel;
    }

    function isNearMessageBottom(threshold = 100) {
        const c = el.messagesContainer;
        return c.scrollHeight - c.scrollTop - c.clientHeight <= threshold;
    }

    function scrollToBottom(options = {}) {
        el.messagesContainer.scrollTo({
            top: el.messagesContainer.scrollHeight,
            behavior: options.behavior || 'smooth'
        });
        state.followStream = true;
        el.scrollToBottom.classList.remove('visible');
    }

    function checkScrollPosition() {
        const nearBottom = isNearMessageBottom(100);
        if (state.isStreaming) state.followStream = nearBottom;
        el.scrollToBottom.classList.toggle('visible', !nearBottom && state.messages.length > 0);
    }

    function scrollToMessageElement(elToScroll) {
        if (!elToScroll) return false;
        elToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
    }

    function jumpToLatestMessage(role) {
        const messages = Array.from(el.messagesList.querySelectorAll(`.message.${role}`));
        const target = messages[messages.length - 1];
        if (!scrollToMessageElement(target)) showToast(`No ${role} message yet`, 'info');
    }

    function jumpToStreamingMessage() {
        const streaming = document.getElementById('streaming-message');
        if (streaming) {
            state.followStream = true;
            scrollToMessageElement(streaming);
        } else {
            showToast('No active stream in this chat', 'info');
        }
    }

    function updateConversationNavState() {
        if (!el.jumpLatestUser) return;
        el.jumpLatestUser.disabled = !state.messages.some(m => m.role === 'user');
        el.jumpLatestAssistant.disabled = !state.messages.some(m => m.role === 'assistant');
        el.jumpStreaming.disabled = !(state.activeStream && state.activeStream.chatId === state.currentChatId);
    }

    function toggleSidebar() {
        el.sidebar.classList.toggle('collapsed');
        el.sidebarOverlay.classList.toggle('visible', !el.sidebar.classList.contains('collapsed'));
    }
    function closeSidebar() {
        if (window.innerWidth <= 900) { el.sidebar.classList.add('collapsed'); el.sidebarOverlay.classList.remove('visible'); }
    }

    // ============================================

// Shortcuts Modal
    // ============================================
    function openShortcutsModal() { el.shortcutsModal.classList.add('open'); }
    window.closeShortcutsModal = function() { el.shortcutsModal.classList.remove('open'); };

    // ============================================
