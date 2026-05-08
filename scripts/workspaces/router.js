// Workspace Router
// ============================================
function persistWorkspacePromptState() {
    const workspace = getActiveWorkspace();
    if (!workspace) return;
    workspace.systemPrompt = state.savedSystemPrompt || '';
    workspace.pinnedNotes = state.pinnedNotes || '';
    workspace.providerPreset = {
        provider: state.provider,
        selectedModelId: state.selectedModel?.id || state.providerSettings[state.provider]?.selectedModelId || null,
        settings: { ...state.settings }
    };
    touchWorkspace(workspace.id);
}

function applyWorkspaceState(workspace) {
    if (!workspace) return;
    state.savedSystemPrompt = workspace.systemPrompt || '';
    state.pinnedNotes = workspace.pinnedNotes || '';
    el.systemPrompt.value = state.savedSystemPrompt;
    el.pinnedContext.value = state.pinnedNotes;
    el.systemPromptBadge.style.display = state.savedSystemPrompt ? 'inline-block' : 'none';
    updateSystemPromptStats();
    updatePinnedContextUI();
    if (workspace.providerPreset?.provider && PROVIDERS[workspace.providerPreset.provider]) {
        state.provider = workspace.providerPreset.provider;
        state.settings = { ...state.settings, ...(workspace.providerPreset.settings || {}) };
        state.providerSettings[state.provider] = {
            ...(state.providerSettings[state.provider] || {}),
            selectedModelId: workspace.providerPreset.selectedModelId || state.providerSettings[state.provider]?.selectedModelId || null,
            settings: { ...state.settings }
        };
        restoreSettingsUI();
        updateProviderUI();
    }
}

async function switchWorkspace(id) {
    const next = getWorkspaceById(id);
    if (!next || next.id === state.activeWorkspaceId) return;
    syncCurrentChatMessages();
    persistWorkspacePromptState();
    state.activeWorkspaceId = next.id;
    localStorage.setItem(CONFIG.ACTIVE_WORKSPACE_KEY, next.id);
    applyWorkspaceState(next);
    state.attachments = [];
    renderAttachmentsPreview();
    const chats = getWorkspaceChats(next.id).sort((a, b) => b.updatedAt - a.updatedAt);
    if (chats.length) {
        loadChat(chats[0].id);
    } else {
        createNewChat();
    }
    renderWorkspaceUi();
    renderMcpServers();
    renderMemorySuggestions();
    renderMemoryManager();
    updateContextInspector();
    await fetchModels();
    closeSidebar();
}

function syncWorkspaceForChat(chatId, workspaceId = state.activeWorkspaceId) {
    const chat = state.chats[chatId];
    if (!chat || !workspaceId) return;
    chat.workspaceId = workspaceId;
    addWorkspaceRelation(workspaceId, 'chatIds', chatId);
}

function syncWorkspaceForMemory(memory, workspaceId = state.activeWorkspaceId) {
    if (!memory || !workspaceId) return;
    memory.workspaceId = workspaceId;
    addWorkspaceRelation(workspaceId, 'memoryIds', memory.id);
}

function syncWorkspaceForMcpServer(server, workspaceId = state.activeWorkspaceId) {
    if (!server || !workspaceId) return;
    server.workspaceId = workspaceId;
    addWorkspaceRelation(workspaceId, 'mcpServerIds', server.id);
}
