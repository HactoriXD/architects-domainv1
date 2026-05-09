// Storage
    // ============================================
    async function saveChats() {
        try {
            await db.chats.saveAll(state.chats);
            await db.messages.saveAllForChats(state.chats);
            await db.contexts.saveAll(state.chats);
        } catch (e) { console.error('Save failed:', e); showToast('Could not save chats locally. Export or clear data.', 'error'); }
    }

    async function loadChats() {
        try {
            const chatMetas = await db.chats.list();
            const chats = {};
            for (const meta of chatMetas) {
                const context = await db.contexts.get(meta.id);
                const messages = await db.messages.getAll(meta.id);
                chats[meta.id] = {
                    ...meta,
                    messages: Array.isArray(messages) ? messages : [],
                    pinnedNotes: context?.pinnedNotes || meta.pinnedNotes || '',
                    systemPrompt: context?.systemPrompt || meta.systemPrompt || ''
                };
            }
            state.chats = chats;
            normalizeLoadedChats();
        } catch (e) { state.chats = {}; }
    }

    async function saveMemories() {
        try {
            await db.memories.saveAll(state.memories);
        } catch (e) {
            console.error('Memory save failed:', e);
            showToast('Could not save memories locally. Export or clear data.', 'error');
        }
    }

    async function loadMemories() {
        try {
            const loaded = await db.memories.list();
            state.memories = loaded.length ? loaded : [];
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

    async function saveMcpServers() {
        try {
            await db.mcpServers.saveAll(state.mcpServers);
        } catch (e) {
            console.error('MCP server save failed:', e);
            showToast('Could not save MCP servers locally. Export or clear data.', 'error');
        }
    }

    async function loadMcpServers() {
        try {
            const loaded = await db.mcpServers.list();
            state.mcpServers = loaded.length ? loaded : [];
            normalizeLoadedMcpServers();
        } catch (e) {
            state.mcpServers = [];
        }
    }

    async function loadMcpOperationalState() {
        try {
            state.mcpLogs = await db.mcpLogs.list(300);
        } catch (e) {
            state.mcpLogs = [];
        }
        try {
            const rows = await db.mcpChatState.list();
            state.mcpChatState = Object.fromEntries(rows.map(row => [row.chatId, {
                chatId: row.chatId,
                activeServerIds: Array.isArray(row.activeServerIds) ? row.activeServerIds : [],
                toolOverrides: row.toolOverrides && typeof row.toolOverrides === 'object' ? row.toolOverrides : {},
                seededFromWorkspaceDefaults: Boolean(row.seededFromWorkspaceDefaults),
                updatedAt: row.updatedAt || Date.now()
            }]));
        } catch (e) {
            state.mcpChatState = {};
        }
    }

    async function saveMcpChatState(chatId) {
        if (!chatId || !state.mcpChatState?.[chatId]) return;
        try {
            await db.mcpChatState.set(chatId, state.mcpChatState[chatId]);
        } catch (e) {
            console.error('MCP chat state save failed:', e);
        }
    }

    async function addMcpLog(entry) {
        const normalized = {
            id: entry.id || generateId(),
            timestamp: entry.timestamp || Date.now(),
            eventType: entry.eventType || 'status',
            serverId: entry.serverId || '',
            serverName: entry.serverName || '',
            toolName: entry.toolName || '',
            durationMs: Number(entry.durationMs) || 0,
            success: entry.success !== false,
            message: String(entry.message || ''),
            details: entry.details || null
        };
        state.mcpLogs = [normalized, ...(state.mcpLogs || [])].slice(0, 300);
        try {
            await db.mcpLogs.add(normalized);
        } catch (e) {
            console.error('MCP log save failed:', e);
        }
        return normalized;
    }

    async function clearMcpLogs() {
        state.mcpLogs = [];
        try {
            await db.mcpLogs.clear();
        } catch (e) {
            console.error('MCP log clear failed:', e);
        }
    }

    function normalizeLoadedMcpServers() {
        if (!Array.isArray(state.mcpServers)) state.mcpServers = [];
        state.mcpServers = state.mcpServers.map(normalizeMcpServerForStorage).filter(server => server.name);
    }

    function normalizeMcpServerForStorage(server = {}) {
        const type = server.type || 'custom';
        const now = Date.now();
        const capabilities = Array.isArray(server.capabilities) ? server.capabilities : [];
        const toolPermissions = normalizeMcpToolPermissions(server, capabilities);
        return {
            id: server.id || generateId(),
            mcpVersion: 2,
            name: String(server.name || 'MCP Server').trim(),
            type,
            endpoint: String(server.endpoint || '').trim(),
            transport: server.transport || (['filesystem', 'browser', 'memory'].includes(type) ? 'mcp-system' : ['markdown-vault', 'github', 'web-fetch', 'git', 'app-inspector', 'bridge-health', 'web-fetch-plus', 'notes-vault'].includes(type) ? 'bridge' : 'http'),
            config: server.config && typeof server.config === 'object' ? server.config : {},
            workspaceId: server.workspaceId || state.activeWorkspaceId || '',
            enabled: Boolean(server.enabled),
            status: server.status || 'untested',
            statusState: normalizeMcpStatusState(server.statusState || server.status || 'untested', server),
            capabilities,
            resources: Array.isArray(server.resources) ? server.resources : [],
            permissions: {
                read: server.permissions?.read || 'auto',
                network: server.permissions?.network || server.permissions?.external || 'confirm',
                destructive: server.permissions?.destructive || 'confirm',
                readOnly: Boolean(server.permissions?.readOnly),
                toolPermissions
            },
            health: server.health || { state: server.status || 'untested', checkedAt: 0 },
            lastSeenAt: server.lastSeenAt || 0,
            lastTestedAt: server.lastTestedAt || server.lastSeenAt || server.health?.checkedAt || 0,
            lastTestDurationMs: Number(server.lastTestDurationMs) || 0,
            toolCount: Number(server.toolCount) || capabilities.filter(item => item.kind === 'tool').length,
            configValidation: server.configValidation || { valid: true, errors: [] },
            executionHistory: Array.isArray(server.executionHistory) ? server.executionHistory.slice(0, 20) : [],
            createdAt: server.createdAt || now,
            updatedAt: server.updatedAt || server.createdAt || now,
            lastError: server.lastError || ''
        };
    }

    function normalizeMcpStatusState(value, server = {}) {
        if (server.enabled === false && ['disabled', 'connected'].includes(value)) return 'disabled';
        const status = String(value || '').toLowerCase();
        if (['connected', 'online', 'degraded'].includes(status)) return 'connected';
        if (['connecting', 'testing'].includes(status)) return 'connecting';
        if (['error', 'offline', 'timeout', 'failed'].includes(status)) return 'error';
        if (['unconfigured', 'needs_configuration', 'needs-configuration', 'untested'].includes(status)) return 'needs_configuration';
        if (['disabled'].includes(status)) return 'disabled';
        return 'disconnected';
    }

    function normalizeMcpToolPermissions(server = {}, capabilities = []) {
        const existing = server.permissions?.toolPermissions || server.toolPermissions || {};
        const entries = {};
        for (const tool of capabilities.filter(item => item.kind === 'tool')) {
            const safety = tool.safety || inferMcpToolSafety(tool.name, tool.description);
            const prior = existing[tool.name] || {};
            entries[tool.name] = {
                enabled: prior.enabled !== false,
                requiresApproval: typeof prior.requiresApproval === 'boolean' ? prior.requiresApproval : safety !== 'read',
                riskLevel: prior.riskLevel || normalizeMcpRiskLevel(safety),
                scope: prior.scope || 'chat',
                lastUsedAt: prior.lastUsedAt || 0,
                errorCount: Number(prior.errorCount) || 0
            };
        }
        for (const [name, prior] of Object.entries(existing)) {
            if (!entries[name]) {
                entries[name] = {
                    enabled: prior.enabled !== false,
                    requiresApproval: prior.requiresApproval !== false,
                    riskLevel: prior.riskLevel || 'external',
                    scope: prior.scope || 'chat',
                    lastUsedAt: prior.lastUsedAt || 0,
                    errorCount: Number(prior.errorCount) || 0
                };
            }
        }
        return entries;
    }

    function normalizeMcpRiskLevel(value) {
        const risk = String(value || '').toLowerCase();
        if (risk === 'network') return 'external';
        if (['read', 'write', 'external', 'destructive'].includes(risk)) return risk;
        return 'read';
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

    async function saveSettings() {
        try { const serialized = JSON.stringify({
            provider: state.provider,
            apiKeys: state.apiKeys,
            selectedModelId: state.selectedModel?.id,
            activeWorkspaceId: state.activeWorkspaceId,
            webSearchEnabled: state.webSearchEnabled,
            providerSettings: state.providerSettings,
            providerStatus: state.providerStatus,
            mcpControl: {
                toolCallingMode: state.mcpControl.toolCallingMode || 'native',
                privacyMode: Boolean(state.mcpControl.privacyMode),
                demoMode: Boolean(state.mcpControl.demoMode)
            },
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
                if (d.mcpControl) {
                    state.mcpControl.toolCallingMode = ['native', 'xml', 'json', 'disabled'].includes(d.mcpControl.toolCallingMode) ? d.mcpControl.toolCallingMode : 'native';
                    state.mcpControl.privacyMode = Boolean(d.mcpControl.privacyMode);
                    state.mcpControl.demoMode = Boolean(d.mcpControl.demoMode);
                    localStorage.setItem('architects_domain_mcp_privacy_mode', String(state.mcpControl.privacyMode));
                    localStorage.setItem('architects_domain_mcp_demo_mode', String(state.mcpControl.demoMode));
                }
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
            mcpControl: {
                toolCallingMode: state.mcpControl.toolCallingMode || 'native',
                privacyMode: Boolean(state.mcpControl.privacyMode),
                demoMode: Boolean(state.mcpControl.demoMode)
            },
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
            if (payload.mcpControl) {
                state.mcpControl.toolCallingMode = ['native', 'xml', 'json', 'disabled'].includes(payload.mcpControl.toolCallingMode) ? payload.mcpControl.toolCallingMode : state.mcpControl.toolCallingMode;
                state.mcpControl.privacyMode = Boolean(payload.mcpControl.privacyMode);
                state.mcpControl.demoMode = Boolean(payload.mcpControl.demoMode);
            }
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
