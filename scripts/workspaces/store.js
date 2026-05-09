// Workspace Store
// ============================================
const WORKSPACE_FILE_LIMIT = 240000;
const WORKSPACE_ALLOWED_EXTENSIONS = new Set(['txt', 'md', 'json', 'js', 'ts', 'css', 'html', 'py', 'csv']);

function createWorkspaceRecord(seed = {}) {
    const now = Date.now();
    const id = seed.id || generateId();
    return {
        id,
        name: String(seed.name || 'Architect\'s Domain').trim(),
        kind: seed.kind || 'workspace',
        icon: String(seed.icon || 'AD').trim().slice(0, 4) || 'AD',
        color: seed.color || '#8b5cf6',
        archived: Boolean(seed.archived),
        createdAt: seed.createdAt || now,
        updatedAt: seed.updatedAt || now,
        chatIds: Array.isArray(seed.chatIds) ? [...new Set(seed.chatIds.filter(Boolean))] : [],
        memoryIds: Array.isArray(seed.memoryIds) ? [...new Set(seed.memoryIds.filter(Boolean))] : [],
        mcpServerIds: Array.isArray(seed.mcpServerIds) ? [...new Set(seed.mcpServerIds.filter(Boolean))] : [],
        providerPreset: seed.providerPreset || {
            provider: state.provider,
            selectedModelId: state.selectedModel?.id || state.providerSettings[state.provider]?.selectedModelId || null,
            settings: { ...state.settings }
        },
        systemPrompt: String(seed.systemPrompt || '').trim(),
        pinnedNotes: String(seed.pinnedNotes || '').trim(),
        workspaceNotes: String(seed.workspaceNotes || '').trim(),
        lorebooks: Array.isArray(seed.lorebooks) ? seed.lorebooks.map(normalizeLorebookEntry).filter(Boolean) : [],
        importedFiles: Array.isArray(seed.importedFiles) ? seed.importedFiles.map(normalizeImportedFile).filter(Boolean) : []
    };
}

function normalizeLorebookEntry(entry) {
    if (!entry) return null;
    const content = String(entry.content || '').trim();
    const title = String(entry.title || 'Lore entry').trim();
    if (!content && !title) return null;
    const now = Date.now();
    return {
        id: entry.id || generateId(),
        title,
        content,
        enabled: entry.enabled !== false,
        pinned: Boolean(entry.pinned),
        createdAt: entry.createdAt || now,
        updatedAt: entry.updatedAt || entry.createdAt || now
    };
}

function normalizeImportedFile(file) {
    if (!file) return null;
    const name = String(file.name || '').trim();
    const content = String(file.content || '');
    if (!name || !content) return null;
    const now = Date.now();
    return {
        id: file.id || generateId(),
        name,
        extension: String(file.extension || name.split('.').pop() || '').toLowerCase(),
        size: Number(file.size) || content.length,
        content,
        enabled: file.enabled !== false,
        pinned: Boolean(file.pinned),
        createdAt: file.createdAt || now,
        updatedAt: file.updatedAt || file.createdAt || now
    };
}

function loadWorkspaces() {
    try {
        const saved = localStorage.getItem(CONFIG.WORKSPACES_KEY);
        const parsed = saved ? JSON.parse(saved) : null;
        state.workspaces = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        state.workspaces = {};
    }
    normalizeLoadedWorkspaces();
    migrateLegacyIntoWorkspaces();
}

function saveWorkspaces() {
    try {
        const serialized = JSON.stringify(state.workspaces);
        if (typeof hasStorageHeadroom === 'function' && !hasStorageHeadroom(serialized, 'Workspaces', CONFIG.WORKSPACES_KEY)) return;
        localStorage.setItem(CONFIG.WORKSPACES_KEY, serialized);
        if (state.activeWorkspaceId) localStorage.setItem(CONFIG.ACTIVE_WORKSPACE_KEY, state.activeWorkspaceId);
    } catch (e) {
        console.error('Workspace save failed:', e);
        showToast('Could not save workspaces locally. Export or clear data.', 'error');
    }
}

function normalizeLoadedWorkspaces() {
    const normalized = {};
    for (const workspace of Object.values(state.workspaces || {})) {
        const record = createWorkspaceRecord(workspace);
        normalized[record.id] = record;
    }
    state.workspaces = normalized;
    const savedActiveId = localStorage.getItem(CONFIG.ACTIVE_WORKSPACE_KEY);
    if (savedActiveId && state.workspaces[savedActiveId]) state.activeWorkspaceId = savedActiveId;
}

function migrateLegacyIntoWorkspaces() {
    const workspaceIds = Object.keys(state.workspaces);
    let workspace = workspaceIds.length ? state.workspaces[state.activeWorkspaceId] || state.workspaces[workspaceIds[0]] : null;
    if (!workspace) {
        workspace = createWorkspaceRecord({
            name: 'Architect\'s Domain',
            kind: 'workspace',
            icon: 'AD',
            color: '#8b5cf6',
            chatIds: Object.keys(state.chats),
            memoryIds: state.memories.map(memory => memory.id),
            mcpServerIds: state.mcpServers.map(server => server.id),
            providerPreset: {
                provider: state.provider,
                selectedModelId: state.providerSettings[state.provider]?.selectedModelId || null,
                settings: { ...state.settings }
            },
            systemPrompt: state.savedSystemPrompt,
            pinnedNotes: state.pinnedNotes
        });
        state.workspaces[workspace.id] = workspace;
    }
    state.activeWorkspaceId = state.activeWorkspaceId && state.workspaces[state.activeWorkspaceId] ? state.activeWorkspaceId : workspace.id;
    for (const chat of Object.values(state.chats)) {
        if (!chat.workspaceId) chat.workspaceId = workspace.id;
        addWorkspaceRelation(chat.workspaceId, 'chatIds', chat.id, { silent: true });
    }
    for (const memory of state.memories) {
        if (!memory.workspaceId) memory.workspaceId = workspace.id;
        addWorkspaceRelation(memory.workspaceId, 'memoryIds', memory.id, { silent: true });
    }
    for (const server of state.mcpServers) {
        if (!server.workspaceId) server.workspaceId = workspace.id;
        addWorkspaceRelation(server.workspaceId, 'mcpServerIds', server.id, { silent: true });
    }
    saveWorkspaces();
    saveChats();
    saveMemories();
    saveMcpServers();
}

function getActiveWorkspace() {
    return state.workspaces[state.activeWorkspaceId] || Object.values(state.workspaces)[0] || null;
}

function getWorkspaceById(id) {
    return state.workspaces[id] || null;
}

function touchWorkspace(id = state.activeWorkspaceId) {
    const workspace = getWorkspaceById(id);
    if (!workspace) return;
    workspace.updatedAt = Date.now();
    saveWorkspaces();
}

function addWorkspaceRelation(workspaceId, key, id, options = {}) {
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace || !id) return;
    if (!Array.isArray(workspace[key])) workspace[key] = [];
    if (!workspace[key].includes(id)) workspace[key].push(id);
    if (!options.silent) touchWorkspace(workspaceId);
}

function removeWorkspaceRelation(workspaceId, key, id) {
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace || !Array.isArray(workspace[key])) return;
    workspace[key] = workspace[key].filter(item => item !== id);
    touchWorkspace(workspaceId);
}

function getWorkspaceChats(workspaceId = state.activeWorkspaceId) {
    return Object.values(state.chats).filter(chat => chat.workspaceId === workspaceId);
}

function getWorkspaceMemories(workspaceId = state.activeWorkspaceId) {
    return state.memories.filter(memory => memory.workspaceId === workspaceId);
}

function getWorkspaceMcpServers(workspaceId = state.activeWorkspaceId) {
    return state.mcpServers.filter(server => server.workspaceId === workspaceId);
}

function createWorkspace(seed = {}) {
    const workspace = createWorkspaceRecord({
        name: seed.name || 'New Workspace',
        kind: seed.kind || 'workspace',
        icon: seed.icon || 'NW',
        color: seed.color || '#8b5cf6',
        providerPreset: {
            provider: state.provider,
            selectedModelId: state.selectedModel?.id || null,
            settings: { ...state.settings }
        },
        ...seed
    });
    state.workspaces[workspace.id] = workspace;
    saveWorkspaces();
    return workspace;
}

function duplicateWorkspace(id) {
    const source = getWorkspaceById(id);
    if (!source) return null;
    const workspace = createWorkspace({
        ...source,
        id: generateId(),
        name: `${source.name} Copy`,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chatIds: [],
        memoryIds: [],
        mcpServerIds: [],
        lorebooks: source.lorebooks.map(entry => ({ ...entry, id: generateId() })),
        importedFiles: source.importedFiles.map(file => ({ ...file, id: generateId() }))
    });
    for (const chat of getWorkspaceChats(source.id)) {
        const chatId = generateId();
        state.chats[chatId] = {
            ...chat,
            id: chatId,
            workspaceId: workspace.id,
            title: `${chat.title || 'New Ritual'} Copy`,
            messages: (chat.messages || []).map(message => ({ ...message, attachments: message.attachments ? message.attachments.map(att => ({ ...att })) : [] })),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        workspace.chatIds.push(chatId);
    }
    for (const memory of getWorkspaceMemories(source.id)) {
        const memoryId = generateId();
        state.memories.push({
            ...memory,
            id: memoryId,
            workspaceId: workspace.id,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        workspace.memoryIds.push(memoryId);
    }
    for (const server of getWorkspaceMcpServers(source.id)) {
        const serverId = generateId();
        state.mcpServers.push({
            ...server,
            id: serverId,
            workspaceId: workspace.id,
            enabled: false,
            status: 'untested',
            lastError: ''
        });
        workspace.mcpServerIds.push(serverId);
    }
    saveChats();
    saveMemories();
    saveMcpServers();
    saveWorkspaces();
    return workspace;
}

function serializeWorkspace(id = state.activeWorkspaceId) {
    const workspace = getWorkspaceById(id);
    if (!workspace) return null;
    return {
        format: 'architects-domain-workspace',
        version: 1,
        exportedAt: new Date().toISOString(),
        workspace,
        chats: getWorkspaceChats(id),
        memories: getWorkspaceMemories(id),
        mcpServers: getWorkspaceMcpServers(id)
    };
}

function importWorkspacePayload(payload) {
    if (!payload || payload.format !== 'architects-domain-workspace' || payload.version !== 1) {
        throw new Error('Invalid workspace backup');
    }
    const imported = createWorkspaceRecord({ ...payload.workspace, id: generateId(), name: `${payload.workspace.name} Import` });
    imported.chatIds = [];
    imported.memoryIds = [];
    imported.mcpServerIds = [];
    state.workspaces[imported.id] = imported;
    for (const chat of payload.chats || []) {
        const id = generateId();
        state.chats[id] = { ...chat, id, workspaceId: imported.id, createdAt: chat.createdAt || Date.now(), updatedAt: Date.now() };
        imported.chatIds.push(id);
    }
    for (const memory of payload.memories || []) {
        const id = generateId();
        state.memories.push({ ...memory, id, workspaceId: imported.id, createdAt: memory.createdAt || Date.now(), updatedAt: Date.now() });
        imported.memoryIds.push(id);
    }
    for (const server of payload.mcpServers || []) {
        const id = generateId();
        state.mcpServers.push({ ...server, id, workspaceId: imported.id, status: 'untested', lastError: '' });
        imported.mcpServerIds.push(id);
    }
    saveChats();
    saveMemories();
    saveMcpServers();
    saveWorkspaces();
    return imported;
}
