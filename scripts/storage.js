// Storage
    // ============================================
    function saveChats() {
        try {
            const data = {};
            for (const [id, chat] of Object.entries(state.chats)) {
                data[id] = { ...chat, pinnedNotes: chat.pinnedNotes || '', messages: chat.messages.map(m => ({
                    ...m, attachments: m.attachments?.map(a => ({ ...a, data: a.type === 'image' ? a.data : null })) || []
                }))};
            }
            const serialized = JSON.stringify(data);
            if (typeof hasStorageHeadroom === 'function' && !hasStorageHeadroom(serialized, 'Chats', CONFIG.STORAGE_KEY)) return;
            localStorage.setItem(CONFIG.STORAGE_KEY, serialized);
        } catch (e) { console.error('Save failed:', e); showToast('Could not save chats locally. Export or clear data.', 'error'); }
    }

    function loadChats() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                state.chats = JSON.parse(saved);
                normalizeLoadedChats();
            }
        }
        catch (e) { state.chats = {}; }
    }

    function saveMemories() {
        try {
            const serialized = JSON.stringify(state.memories);
            if (typeof hasStorageHeadroom === 'function' && !hasStorageHeadroom(serialized, 'Memories', CONFIG.MEMORIES_KEY)) return;
            localStorage.setItem(CONFIG.MEMORIES_KEY, serialized);
        } catch (e) {
            console.error('Memory save failed:', e);
            showToast('Could not save memories locally. Export or clear data.', 'error');
        }
    }

    function loadMemories() {
        try {
            const saved = localStorage.getItem(CONFIG.MEMORIES_KEY);
            state.memories = saved ? JSON.parse(saved) : [];
            normalizeLoadedMemories();
        } catch (e) {
            state.memories = [];
        }
    }

    function normalizeLoadedMemories() {
        if (!Array.isArray(state.memories)) state.memories = [];
        state.memories = state.memories.map(memory => {
            const category = normalizeMemoryCategory(memory.category);
            return {
                id: memory.id || generateId(),
                content: String(memory.content || '').trim(),
                category,
                confidence: Number(memory.confidence) || 0.6,
                createdAt: memory.createdAt || Date.now(),
                updatedAt: memory.updatedAt || memory.createdAt || Date.now(),
            sourceChat: memory.sourceChat || null,
            sourceMessage: memory.sourceMessage || null,
            workspaceId: memory.workspaceId || state.activeWorkspaceId || '',
            pinned: Boolean(memory.pinned),
                enabled: memory.enabled !== false
            };
        }).filter(memory => memory.content && memory.category);
    }

    function saveMcpServers() {
        try {
            const serialized = JSON.stringify(state.mcpServers);
            if (typeof hasStorageHeadroom === 'function' && !hasStorageHeadroom(serialized, 'MCP servers', CONFIG.MCP_SERVERS_KEY)) return;
            localStorage.setItem(CONFIG.MCP_SERVERS_KEY, serialized);
        } catch (e) {
            console.error('MCP server save failed:', e);
            showToast('Could not save MCP servers locally. Export or clear data.', 'error');
        }
    }

    function loadMcpServers() {
        try {
            const saved = localStorage.getItem(CONFIG.MCP_SERVERS_KEY);
            state.mcpServers = saved ? JSON.parse(saved) : [];
            normalizeLoadedMcpServers();
        } catch (e) {
            state.mcpServers = [];
        }
    }

    function normalizeLoadedMcpServers() {
        if (!Array.isArray(state.mcpServers)) state.mcpServers = [];
        state.mcpServers = state.mcpServers.map(server => ({
            id: server.id || generateId(),
            name: String(server.name || 'MCP Server').trim(),
            type: server.type || 'custom',
            endpoint: String(server.endpoint || '').trim(),
            transport: server.transport || (['filesystem', 'markdown-vault', 'github', 'web-fetch'].includes(server.type) ? 'bridge' : 'http'),
            config: server.config && typeof server.config === 'object' ? server.config : {},
            workspaceId: server.workspaceId || state.activeWorkspaceId || '',
            enabled: Boolean(server.enabled),
            status: server.status || 'untested',
            capabilities: Array.isArray(server.capabilities) ? server.capabilities : [],
            resources: Array.isArray(server.resources) ? server.resources : [],
            permissions: server.permissions || { read: 'auto', network: 'confirm', destructive: 'confirm' },
            health: server.health || { state: server.status || 'untested', checkedAt: 0 },
            lastSeenAt: server.lastSeenAt || 0,
            executionHistory: Array.isArray(server.executionHistory) ? server.executionHistory.slice(0, 20) : [],
            createdAt: server.createdAt || Date.now(),
            updatedAt: server.updatedAt || server.createdAt || Date.now(),
            lastError: server.lastError || ''
        })).filter(server => server.name);
    }

    function normalizeLoadedChats() {
        for (const chat of Object.values(state.chats)) {
            if (!Array.isArray(chat.messages)) chat.messages = [];
            if (typeof chat.workspaceId !== 'string') chat.workspaceId = state.activeWorkspaceId || '';
            if (typeof chat.systemPrompt !== 'string') chat.systemPrompt = '';
            if (typeof chat.pinnedNotes !== 'string') chat.pinnedNotes = '';
            if (!chat.createdAt) chat.createdAt = Date.now();
            if (!chat.updatedAt) chat.updatedAt = chat.createdAt;
        }
    }

    function saveSettings() {
        try { const serialized = JSON.stringify({
            provider: state.provider,
            apiKeys: state.apiKeys,
            selectedModelId: state.selectedModel?.id,
            activeWorkspaceId: state.activeWorkspaceId,
            webSearchEnabled: state.webSearchEnabled,
            providerSettings: state.providerSettings,
            providerStatus: state.providerStatus,
            settings: state.settings
        });
        if (typeof hasStorageHeadroom === 'function' && !hasStorageHeadroom(serialized, 'Settings', CONFIG.SETTINGS_KEY)) return;
        localStorage.setItem(CONFIG.SETTINGS_KEY, serialized); }
        catch (e) { showToast('Could not save settings locally. Export or clear data.', 'error'); }
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem(CONFIG.SETTINGS_KEY);
            if (saved) {
                const d = JSON.parse(saved);
                if (d.provider && PROVIDERS[d.provider]) state.provider = d.provider;
                if (d.apiKeys) state.apiKeys = d.apiKeys;
                if (d.activeWorkspaceId) state.activeWorkspaceId = d.activeWorkspaceId;
                if (typeof d.webSearchEnabled === 'boolean') state.webSearchEnabled = d.webSearchEnabled;
                if (d.providerSettings) state.providerSettings = d.providerSettings;
                if (d.providerStatus) state.providerStatus = d.providerStatus;
                if (d.settings) state.settings = {...state.settings,...d.settings};
                return d.selectedModelId;
            }
        }
        catch (e) {} return null;
    }

    function getSettingsBackupPayload() {
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            provider: state.provider,
            apiKeys: state.apiKeys,
            webSearchEnabled: state.webSearchEnabled,
            providerSettings: state.providerSettings,
            settings: state.settings
        };
    }

    async function exportEncryptedSettings() {
        const passphrase = prompt('Create a passphrase for this encrypted settings backup:');
        if (!passphrase) return;
        const encrypted = await encryptJson(getSettingsBackupPayload(), passphrase);
        downloadFile(JSON.stringify(encrypted, null, 2), `architects_domain_settings_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
        showToast('Encrypted settings exported', 'success');
    }

    async function importEncryptedSettings(file) {
        if (!file) return;
        const passphrase = prompt('Enter the passphrase for this settings backup:');
        if (!passphrase) return;
        try {
            const encrypted = JSON.parse(await file.text());
            const payload = await decryptJson(encrypted, passphrase);
            if (!payload || payload.version !== 1) throw new Error('Unsupported settings backup');
            if (payload.apiKeys) state.apiKeys = payload.apiKeys;
            if (payload.provider && PROVIDERS[payload.provider]) state.provider = payload.provider;
            if (typeof payload.webSearchEnabled === 'boolean') state.webSearchEnabled = payload.webSearchEnabled;
            if (payload.providerSettings) state.providerSettings = payload.providerSettings;
            if (payload.settings) state.settings = { ...state.settings, ...payload.settings };
            saveSettings();
            restoreSettingsUI();
            updateProviderUI();
            await fetchModels();
            showToast('Encrypted settings imported', 'success');
        } catch (error) {
            console.error('Settings import failed:', error.message || error);
            showToast('Could not import settings backup', 'error');
        }
    }

    async function encryptJson(payload, passphrase) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveBackupKey(passphrase, salt);
        const data = new TextEncoder().encode(JSON.stringify(payload));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        return {
            format: 'architects-domain-settings',
            version: 1,
            kdf: 'PBKDF2-SHA256',
            iterations: 210000,
            cipher: 'AES-GCM',
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
            ciphertext: bytesToBase64(new Uint8Array(ciphertext))
        };
    }

    async function decryptJson(encrypted, passphrase) {
        if (encrypted?.format !== 'architects-domain-settings' || encrypted?.version !== 1) {
            throw new Error('Invalid settings backup');
        }
        const salt = base64ToBytes(encrypted.salt);
        const iv = base64ToBytes(encrypted.iv);
        const key = await deriveBackupKey(passphrase, salt);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(encrypted.ciphertext));
        return JSON.parse(new TextDecoder().decode(plaintext));
    }

    async function deriveBackupKey(passphrase, salt) {
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    function bytesToBase64(bytes) {
        return btoa(String.fromCharCode(...bytes));
    }

    function base64ToBytes(value) {
        return Uint8Array.from(atob(value), char => char.charCodeAt(0));
    }

    // ============================================
