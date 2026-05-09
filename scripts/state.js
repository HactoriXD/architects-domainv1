// Configuration
    // ============================================
    const CONFIG = {
        DEFAULT_PROVIDER: 'openrouter',
        DEFAULT_MODEL: 'anthropic/claude-sonnet-4',
        SITE_NAME: "Architect's Domain",
        SITE_URL: 'https://architects-domain.local',
        ASSISTANT_NAME: 'Assistant',
        STORAGE_KEY: 'architects_domain_chats',
        SETTINGS_KEY: 'architects_domain_settings',
        MEMORIES_KEY: 'architects_domain_memories',
        MCP_SERVERS_KEY: 'architects_domain_mcp_servers',
        WORKSPACES_KEY: 'architects_domain_workspaces',
        ACTIVE_WORKSPACE_KEY: 'architects_domain_active_workspace'
    };

    const VISION_MODELS = ['anthropic/claude-sonnet-4','anthropic/claude-3.5-sonnet','anthropic/claude-3-opus','anthropic/claude-3-sonnet','anthropic/claude-3-haiku','openai/gpt-4o','openai/gpt-4o-mini','openai/gpt-4-turbo','google/gemini-pro-1.5','google/gemini-flash-1.5','meta-llama/llama-3.2-90b-vision-instruct','meta-llama/llama-3.2-11b-vision-instruct'];
    const SYSTEM_PROMPT_PRESETS = {
        roleplay: 'You are an immersive roleplay partner. Maintain character voice, emotional continuity, scene geography, and established canon. Write with sensory detail and consequence. Preserve the user\'s agency, do not take control of their character, and ask before changing major stakes, tone, or boundaries.',
        coding: 'You are a senior engineering partner working inside an existing codebase. Inspect before changing, prefer local patterns, keep edits scoped, and explain tradeoffs briefly. Prioritize correctness, maintainability, focused tests, and non-destructive git hygiene.',
        research: 'You are a rigorous research analyst. Separate confirmed facts from inference, name uncertainty, compare evidence, and avoid overclaiming. Produce concise synthesis, source-aware reasoning, and a clear next decision or question.',
        journal: 'You are a grounded reflective companion. Help clarify emotions, patterns, values, and next actions without diagnosing or overreaching. Be warm, specific, and practical; ask one useful question when more context matters.',
        lorekeeper: 'You are the continuity keeper for an evolving fictional or project domain. Track canon, names, timelines, contradictions, tone, symbols, and unresolved threads. Preserve established facts, flag conflicts gently, and turn fragments into coherent world structure.'
    };
    const MODEL_PRICING_USD_PER_1M = {
        deepseek: {
            'deepseek-chat': { input: 0.27, output: 1.10, estimated: false },
            'deepseek-reasoner': { input: 0.55, output: 2.19, estimated: false },
            'deepseek-v4-flash': { input: 0.17, output: 0.35, estimated: true },
            'deepseek-v4-pro': { input: 1.73, output: 3.80, estimated: true }
        },
        venice: {
            'venice-uncensored': { input: 0.20, output: 0.90, estimated: true },
            'venice-uncensored-1-2': { input: 0.20, output: 0.90, estimated: false },
            'venice-uncensored-role-play': { input: 0.50, output: 2.00, estimated: false },
            'deepseek-v3.2': { input: 0.33, output: 0.48, estimated: false },
            'deepseek-v4-flash': { input: 0.17, output: 0.35, estimated: false },
            'deepseek-v4-pro': { input: 1.73, output: 3.80, estimated: false },
            'zai-org-glm-4.7-flash': { input: 0.13, output: 0.50, estimated: false },
            'mistral-small-3-2-24b-instruct': { input: 0.09, output: 0.25, estimated: false },
            'qwen3-235b-a22b-instruct-2507': { input: 0.15, output: 0.75, estimated: false },
            'qwen3-235b-a22b-thinking-2507': { input: 0.45, output: 3.50, estimated: false }
        }
    };
    const PROVIDER_PRICING_ESTIMATES_USD_PER_1M = {
        deepseek: { input: 0.27, output: 1.10 },
        venice: { input: 0.50, output: 2.00 },
        openrouter: { input: 0, output: 0 }
    };

    // ============================================

// State
    // ============================================
    const state = {
        models: [],
        selectedModel: null,
        currentChatId: null,
        chats: {},
        messages: [],
        attachments: [],
        isStreaming: false,
        abortController: null,
        savedSystemPrompt: '',
        lastUsage: null,
        provider: CONFIG.DEFAULT_PROVIDER,
        apiKeys: {},
        webSearchEnabled: false,
        modelFilter: 'all',
        modelCategories: { roleplay: new Set(), coding: new Set() },
        pinnedNotes: '',
        memories: [],
        memorySuggestions: [],
        memoryFilter: 'all',
        memorySearch: '',
        lightbox: { open: false, images: [], index: 0, zoom: 1, mode: 'fit' },
        mcpServers: [],
        mcpLogs: [],
        mcpChatState: {},
        mcpRegistry: [],
        mcpExecutions: [],
        mcpBridgeHealth: { status: 'unknown', checkedAt: 0, error: '' },
        mcpControl: { open: false, selectedId: 'builtin-filesystem', config: null, status: null, tools: [], log: [], logFilterServer: 'all', logFilterType: 'all', logSearch: '', privacyMode: false, demoMode: false, toolCallingMode: 'native', toolContextPreviewOpen: false, parserErrors: [], approvalQueue: [], sessionApprovals: {}, importPreview: null },
        mcpMemoryContext: [],
        workspaces: {},
        activeWorkspaceId: null,
        workspaceManagerFilterArchived: false,
        workspaceSearch: '',
        followStream: true,
        activeStream: null,
        providerStatus: {},
        providerSettings: {},
        settings: { temperature: 0.7, maxTokens: 8192, topP: 1.0, topK: 0, frequencyPenalty: 0, presencePenalty: 0 }
    };

    // ============================================
    // DOM Elements
    // ============================================
    const el = {
        sidebar: document.getElementById('sidebar'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        sidebarClose: document.getElementById('sidebarClose'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        chatList: document.getElementById('chatList'),
        chatSearch: document.getElementById('chatSearch'),
        newChatBtn: document.getElementById('newChatBtn'),
        workspaceSwitcherBtn: document.getElementById('workspaceSwitcherBtn'),
        workspaceSwitcherMenu: document.getElementById('workspaceSwitcherMenu'),
        workspaceAvatar: document.getElementById('workspaceAvatar'),
        workspaceName: document.getElementById('workspaceName'),
        workspaceKind: document.getElementById('workspaceKind'),
        workspaceManageBtn: document.getElementById('workspaceManageBtn'),
        workspaceModal: document.getElementById('workspaceModal'),
        workspaceCloseBtn: document.getElementById('workspaceCloseBtn'),
        workspaceCreateBtn: document.getElementById('workspaceCreateBtn'),
        workspaceShowArchived: document.getElementById('workspaceShowArchived'),
        workspaceList: document.getElementById('workspaceList'),
        workspaceNameInput: document.getElementById('workspaceNameInput'),
        workspaceKindInput: document.getElementById('workspaceKindInput'),
        workspaceIconInput: document.getElementById('workspaceIconInput'),
        workspaceColorInput: document.getElementById('workspaceColorInput'),
        workspaceNotesInput: document.getElementById('workspaceNotesInput'),
        workspaceExportBtn: document.getElementById('workspaceExportBtn'),
        workspaceImportBtn: document.getElementById('workspaceImportBtn'),
        workspaceImportInput: document.getElementById('workspaceImportInput'),
        lorebookList: document.getElementById('lorebookList'),
        lorebookAddBtn: document.getElementById('lorebookAddBtn'),
        importedFileList: document.getElementById('importedFileList'),
        importedFileInput: document.getElementById('importedFileInput'),
        importedFileAddBtn: document.getElementById('importedFileAddBtn'),
        modelSelectorBtn: document.getElementById('modelSelectorBtn'),
        modelDropdown: document.getElementById('modelDropdown'),
        modelSearch: document.getElementById('modelSearch'),
        modelFilterRow: document.getElementById('modelFilterRow'),
        modelList: document.getElementById('modelList'),
        selectedProviderName: document.getElementById('selectedProviderName'),
        selectedModelName: document.getElementById('selectedModelName'),
        visionBadge: document.getElementById('visionBadge'),
        settingsBtn: document.getElementById('settingsBtn'),
        settingsPanel: document.getElementById('settingsPanel'),
        providerSelect: document.getElementById('providerSelect'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        providerStatus: document.getElementById('providerStatus'),
        testProviderBtn: document.getElementById('testProviderBtn'),
        clearLocalKeysBtn: document.getElementById('clearLocalKeysBtn'),
        exportSettingsBtn: document.getElementById('exportSettingsBtn'),
        importSettingsBtn: document.getElementById('importSettingsBtn'),
        settingsImportInput: document.getElementById('settingsImportInput'),
        storageUsageValue: document.getElementById('storageUsageValue'),
        dataManagerBtn: document.getElementById('dataManagerBtn'),
        privacyModal: document.getElementById('privacyModal'),
        privacyAcceptBtn: document.getElementById('privacyAcceptBtn'),
        privacyOpenDataBtn: document.getElementById('privacyOpenDataBtn'),
        dataManagerModal: document.getElementById('dataManagerModal'),
        dataManagerCloseBtn: document.getElementById('dataManagerCloseBtn'),
        dataStorageUsage: document.getElementById('dataStorageUsage'),
        dataStoragePercent: document.getElementById('dataStoragePercent'),
        dataStorageBar: document.getElementById('dataStorageBar'),
        dataStorageHint: document.getElementById('dataStorageHint'),
        idbStorageUsage: document.getElementById('idbStorageUsage'),
        idbStoragePercent: document.getElementById('idbStoragePercent'),
        idbStorageBar: document.getElementById('idbStorageBar'),
        storageDetailsToggle: document.getElementById('storageDetailsToggle'),
        storageDetailsBody: document.getElementById('storageDetailsBody'),
        storageDetailChats: document.getElementById('storageDetailChats'),
        storageDetailMessages: document.getElementById('storageDetailMessages'),
        storageDetailOldest: document.getElementById('storageDetailOldest'),
        storageDetailLargest: document.getElementById('storageDetailLargest'),
        exportAllDataBtn: document.getElementById('exportAllDataBtn'),
        importAllDataBtn: document.getElementById('importAllDataBtn'),
        dataImportInput: document.getElementById('dataImportInput'),
        clearChatsBtn: document.getElementById('clearChatsBtn'),
        clearMemoriesBtn: document.getElementById('clearMemoriesBtn'),
        clearApiKeysDataBtn: document.getElementById('clearApiKeysDataBtn'),
        fullResetBtn: document.getElementById('fullResetBtn'),
        webSearchToggle: document.getElementById('webSearchToggle'),
        webSearchStatus: document.getElementById('webSearchStatus'),
        contextInspectorBtn: document.getElementById('contextInspectorBtn'),
        contextInspectorPanel: document.getElementById('contextInspectorPanel'),
        contextSourcesList: document.getElementById('contextSourcesList'),
        contextSourcesSummary: document.getElementById('contextSourcesSummary'),
        memoryManagerBtn: document.getElementById('memoryManagerBtn'),
        memoryModal: document.getElementById('memoryModal'),
        memorySearch: document.getElementById('memorySearch'),
        memoryCategoryFilter: document.getElementById('memoryCategoryFilter'),
        memoryList: document.getElementById('memoryList'),
        memoryEmpty: document.getElementById('memoryEmpty'),
        memorySuggestions: document.getElementById('memorySuggestions'),
        memorySuggestionsList: document.getElementById('memorySuggestionsList'),
        memoryCloseBtn: document.getElementById('memoryCloseBtn'),
        mcpServerType: document.getElementById('mcpServerType'),
        mcpServerName: document.getElementById('mcpServerName'),
        mcpServerEndpoint: document.getElementById('mcpServerEndpoint'),
        mcpServerConfig: document.getElementById('mcpServerConfig'),
        mcpAddServerBtn: document.getElementById('mcpAddServerBtn'),
        recommendedMcpSection: document.getElementById('recommendedMcpSection'),
        recommendedMcpList: document.getElementById('recommendedMcpList'),
        mcpServerList: document.getElementById('mcpServerList'),
        mcpBridgeStatus: document.getElementById('mcpBridgeStatus'),
        mcpExecutionList: document.getElementById('mcpExecutionList'),
        mcpControlCenterBtn: document.getElementById('mcpControlCenterBtn'),
        mcpControlCenterModal: document.getElementById('mcpControlCenterModal'),
        mcpControlCloseBtn: document.getElementById('mcpControlCloseBtn'),
        mcpControlServerList: document.getElementById('mcpControlServerList'),
        mcpControlConfig: document.getElementById('mcpControlConfig'),
        mcpToolInspector: document.getElementById('mcpToolInspector'),
        mcpActivityFeed: document.getElementById('mcpActivityFeed'),
        mcpControlAddServerBtn: document.getElementById('mcpControlAddServerBtn'),
        mcpTotalServers: document.getElementById('mcpTotalServers'),
        mcpConnectedServers: document.getElementById('mcpConnectedServers'),
        mcpTotalTools: document.getElementById('mcpTotalTools'),
        mcpActiveTools: document.getElementById('mcpActiveTools'),
        mcpFailedServers: document.getElementById('mcpFailedServers'),
        mcpComposerIndicator: document.getElementById('mcpComposerIndicator'),
        mcpComposerDropdown: document.getElementById('mcpComposerDropdown'),
        mcpImportInput: document.getElementById('mcpImportInput'),
        lightboxModal: document.getElementById('lightboxModal'),
        lightboxImage: document.getElementById('lightboxImage'),
        lightboxTitle: document.getElementById('lightboxTitle'),
        lightboxMeta: document.getElementById('lightboxMeta'),
        lightboxClose: document.getElementById('lightboxClose'),
        lightboxZoomIn: document.getElementById('lightboxZoomIn'),
        lightboxZoomOut: document.getElementById('lightboxZoomOut'),
        lightboxFit: document.getElementById('lightboxFit'),
        lightboxOriginal: document.getElementById('lightboxOriginal'),
        lightboxPrev: document.getElementById('lightboxPrev'),
        lightboxNext: document.getElementById('lightboxNext'),
        lightboxViewport: document.getElementById('lightboxViewport'),
        tempSlider: document.getElementById('tempSlider'),
        tempValue: document.getElementById('tempValue'),
        maxTokensSlider: document.getElementById('maxTokensSlider'),
        maxTokensValue: document.getElementById('maxTokensValue'),
        topPSlider: document.getElementById('topPSlider'),
        topPValue: document.getElementById('topPValue'),
        topKSlider: document.getElementById('topKSlider'),
        topKValue: document.getElementById('topKValue'),
        freqPenaltySlider: document.getElementById('freqPenaltySlider'),
        freqPenaltyValue: document.getElementById('freqPenaltyValue'),
        presPenaltySlider: document.getElementById('presPenaltySlider'),
        presPenaltyValue: document.getElementById('presPenaltyValue'),
        deepSeekThinkingGroup: document.getElementById('deepSeekThinkingGroup'),
        deepSeekThinkingToggle: document.getElementById('deepSeekThinkingToggle'),
        deepSeekThinkingButton: document.getElementById('deepSeekThinkingButton'),
        deepSeekThinkingButtonLabel: document.getElementById('deepSeekThinkingButtonLabel'),
        thinkingProviderLabel: document.getElementById('thinkingProviderLabel'),
        thinkingSettingsTitle: document.getElementById('thinkingSettingsTitle'),
        thinkingSettingsHint: document.getElementById('thinkingSettingsHint'),
        resetSettingsBtn: document.getElementById('resetSettingsBtn'),
        systemPromptContainer: document.getElementById('systemPromptContainer'),
        systemPromptHeader: document.getElementById('systemPromptHeader'),
        systemPrompt: document.getElementById('systemPrompt'),
        systemPromptPresets: document.getElementById('systemPromptPresets'),
        systemPromptBadge: document.getElementById('systemPromptBadge'),
        systemPromptWordCount: document.getElementById('systemPromptWordCount'),
        systemPromptCharCount: document.getElementById('systemPromptCharCount'),
        systemPromptSave: document.getElementById('systemPromptSave'),
        systemPromptClear: document.getElementById('systemPromptClear'),
        systemPromptSaved: document.getElementById('systemPromptSaved'),
        pinnedContextContainer: document.getElementById('pinnedContextContainer'),
        pinnedContextHeader: document.getElementById('pinnedContextHeader'),
        pinnedContext: document.getElementById('pinnedContext'),
        pinnedContextBadge: document.getElementById('pinnedContextBadge'),
        pinnedContextWordCount: document.getElementById('pinnedContextWordCount'),
        pinnedContextCharCount: document.getElementById('pinnedContextCharCount'),
        pinnedContextSave: document.getElementById('pinnedContextSave'),
        pinnedContextClear: document.getElementById('pinnedContextClear'),
        pinnedContextSaved: document.getElementById('pinnedContextSaved'),
        messagesContainer: document.getElementById('messagesContainer'),
        messagesList: document.getElementById('messagesList'),
        emptyState: document.getElementById('emptyState'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        stopBtn: document.getElementById('stopBtn'),
        fileInput: document.getElementById('fileInput'),
        attachmentsPreview: document.getElementById('attachmentsPreview'),
        inputTokens: document.getElementById('inputTokens'),
        outputTokens: document.getElementById('outputTokens'),
        tokenUsageStat: document.getElementById('tokenUsageStat'),
        contextUsed: document.getElementById('contextUsed'),
        contextMax: document.getElementById('contextMax'),
        scrollToBottom: document.getElementById('scrollToBottom'),
        toastContainer: document.getElementById('toastContainer'),
        renameModal: document.getElementById('renameModal'),
        renameInput: document.getElementById('renameInput'),
        renameCancelBtn: document.getElementById('renameCancelBtn'),
        renameConfirmBtn: document.getElementById('renameConfirmBtn'),
        exportBtn: document.getElementById('exportBtn'),
        exportPanel: document.getElementById('exportPanel'),
        shortcutsBtn: document.getElementById('shortcutsBtn'),
        shortcutsModal: document.getElementById('shortcutsModal'),
        jumpLatestUser: document.getElementById('jumpLatestUser'),
        jumpLatestAssistant: document.getElementById('jumpLatestAssistant'),
        jumpStreaming: document.getElementById('jumpStreaming')
    };

    // ============================================
    // Utility Functions
    // ============================================
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
    const estimateTokens = (text) => text ? Math.ceil((text.length / 4 + text.split(/\s+/).filter(w=>w).length) / 2 * 1.3) : 0;
    const formatContextSize = (size) => size >= 1000000 ? (size/1000000).toFixed(1)+'M' : size >= 1000 ? (size/1000).toFixed(0)+'K' : size.toString();
    const escapeHtml = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const formatPrice = (p) => {
        if (p === undefined || p === null || p === '') return 'N/A';
        const perToken = parseFloat(p);
        if (!Number.isFinite(perToken)) return 'N/A';
        if (perToken === 0) return 'Free';
        const perMillion = perToken * 1000000;
        return perMillion < 0.01 ? '$' + perMillion.toFixed(4) : perMillion < 1 ? '$' + perMillion.toFixed(3) : '$' + perMillion.toFixed(2);
    };
    const formatPer1KCost = (value) => {
        const cost = Number(value);
        if (!Number.isFinite(cost)) return 'N/A';
        if (cost === 0) return 'Free';
        return cost < 0.001 ? `$${cost.toFixed(5)}` : cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(3)}`;
    };
    const formatDollarCost = (value) => {
        const cost = Number(value);
        if (!Number.isFinite(cost)) return 'N/A';
        if (cost === 0) return 'Free';
        return cost < 0.001 ? `$${cost.toFixed(5)}` : cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(3)}`;
    };
    const formatFileSize = (bytes) => bytes < 1024 ? bytes+' B' : bytes < 1024*1024 ? (bytes/1024).toFixed(1)+' KB' : (bytes/(1024*1024)).toFixed(1)+' MB';
    const isVisionModel = (id) => VISION_MODELS.some(vm => id.includes(vm.split('/')[1]) || id === vm);
    const hasFreePricing = (m) => Number(m.input_cost_per_1k_tokens) === 0 && Number(m.output_cost_per_1k_tokens) === 0;
    const getProvider = () => PROVIDERS[state.provider] || PROVIDERS[CONFIG.DEFAULT_PROVIDER];
    const getApiKey = () => (state.apiKeys[state.provider] || '').trim();

    function debounce(fn, wait = 120) {
        let timeoutId = null;
        return function debounced(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    const scheduleSaveSettings = debounce(() => saveSettings(), 180);

    function generateChatTitle(text) {
        if (!text) return 'New Chat';
        const generic = /^\s*(hi|hello|hey|yo|sup|heyy|heyyy|hai|hola|what's up|whats up|greetings|good morning|good evening|good afternoon|howdy|wassup|wsg|helo)\s*[!.]*\s*$/i;
        if (generic.test(text)) return null;
        const cleaned = text.replace(/^["']|["']$/g, '').replace(/[!?#]+/g, '').replace(/\s+/g, ' ').trim();
        const words = cleaned.split(/\s+/);
        const title = words.slice(0, 5).join(' ');
        if (!title) return 'New Chat';
        return title.charAt(0).toUpperCase() + title.slice(1);
    }

    function generateChatTitleFromMessages(messages) {
        for (const msg of messages) {
            if (msg.role === 'user') {
                const title = generateChatTitle(msg.content);
                if (title) return title;
            }
        }
        return 'New Chat';
    }

    function getModelTraits(model) {
        const haystack = `${model.id} ${model.name || ''}`.toLowerCase();
        const free = state.provider === 'openrouter' ? model.id.includes(':free') : hasFreePricing(model);
        const inOpenRouterRoleplay = state.provider === 'openrouter' && state.modelCategories.roleplay.has(model.id);
        const inOpenRouterCoding = state.provider === 'openrouter' && state.modelCategories.coding.has(model.id);
        return {
            free,
            paid: !free,
            vision: isVisionModel(model.id) || /vision|vl|multimodal|gpt-4o|pixtral|llava/.test(haystack),
            reasoning: /reason|thinking|r1|o1|o3|o4|qvq|qwq|deepseek-r|grok-4|sonnet|opus/.test(haystack),
            coding: inOpenRouterCoding || /code|coder|coding|programming|devstral|codestral|qwen3-coder|claude|sonnet|gpt-5|deepseek|cobuddy/.test(haystack),
            roleplay: inOpenRouterRoleplay || /roleplay|character|story|storytelling|creative writing|rp|uncensored|mythomax|psyfighter|noromaid|wizard|dolphin|venice|janitor|sillytavern|magnum|euryale|toppy|cinematika/.test(haystack)
        };
    }

    function getAuthHeaders(includeOpenRouterMeta = false) {
        const key = getApiKey();
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;
        if (includeOpenRouterMeta && state.provider === 'openrouter') {
            headers['HTTP-Referer'] = CONFIG.SITE_URL;
            headers['X-Title'] = CONFIG.SITE_NAME;
        }
        return headers;
    }

    function normalizeModelPricing(providerId, model) {
        const id = String(model.id || model.model || model.name || '').toLowerCase();
        const registry = MODEL_PRICING_USD_PER_1M[providerId]?.[id];
        const rawPrompt = model.pricing?.prompt ?? model.pricing?.input;
        const rawCompletion = model.pricing?.completion ?? model.pricing?.output;
        const rawPromptNumber = parseFloat(rawPrompt);
        const rawCompletionNumber = parseFloat(rawCompletion);
        if (Number.isFinite(Number(model.input_cost_per_1k_tokens)) && Number.isFinite(Number(model.output_cost_per_1k_tokens))) {
            return {
                input: Number(model.input_cost_per_1k_tokens),
                output: Number(model.output_cost_per_1k_tokens),
                estimated: Boolean(model.pricing_estimated),
                source: model.pricing_source || 'provider'
            };
        }
        if (registry && (providerId === 'deepseek' || providerId === 'venice')) {
            return {
                input: registry.input / 1000,
                output: registry.output / 1000,
                estimated: registry.estimated,
                source: registry.estimated ? 'estimated' : 'provider'
            };
        }
        if (Number.isFinite(rawPromptNumber) && Number.isFinite(rawCompletionNumber)) {
            return {
                input: rawPromptNumber * 1000,
                output: rawCompletionNumber * 1000,
                estimated: Boolean(model.pricing?.estimated),
                source: model.pricing?.source || 'provider'
            };
        }
        if (registry) {
            return {
                input: registry.input / 1000,
                output: registry.output / 1000,
                estimated: registry.estimated,
                source: registry.estimated ? 'estimated' : 'provider'
            };
        }
        const estimate = PROVIDER_PRICING_ESTIMATES_USD_PER_1M[providerId] || PROVIDER_PRICING_ESTIMATES_USD_PER_1M.openrouter;
        return {
            input: estimate.input / 1000,
            output: estimate.output / 1000,
            estimated: true,
            source: 'estimated'
        };
    }

    function formatTokenPricing(model) {
        const suffix = model.pricing_estimated ? ' est.' : '';
        return `In ${formatPer1KCost(model.input_cost_per_1k_tokens)}/1K · Out ${formatPer1KCost(model.output_cost_per_1k_tokens)}/1K${suffix}`;
    }

    function estimateMessageCost(model, inputTokens, outputTokens) {
        if (!model) return null;
        const inputCost = (Math.max(0, inputTokens || 0) / 1000) * Number(model.input_cost_per_1k_tokens || 0);
        const outputCost = (Math.max(0, outputTokens || 0) / 1000) * Number(model.output_cost_per_1k_tokens || 0);
        return inputCost + outputCost;
    }

    function formatEstimatedMessageCost(model, inputTokens, outputTokens) {
        const cost = estimateMessageCost(model, inputTokens, outputTokens);
        return cost === null ? 'N/A' : formatDollarCost(cost);
    }

    function normalizeModel(providerId, model) {
        const id = model.id || model.model || model.name;
        const normalized = normalizeModelPricing(providerId, { ...model, id });
        return {
            ...model,
            id,
            name: model.name || model.id || id,
            provider: providerId,
            context_length: model.context_length || model.contextLength || model.model_spec?.capabilities?.optimizedForCode?.contextLength || 0,
            input_cost_per_1k_tokens: normalized.input,
            output_cost_per_1k_tokens: normalized.output,
            currency: 'USD',
            pricing_estimated: normalized.estimated,
            pricing_source: normalized.source,
            pricing: {
                ...(model.pricing || {}),
                prompt: normalized.input / 1000,
                completion: normalized.output / 1000
            }
        };
    }

    function buildFallbackModels(providerId) {
        if (providerId === 'deepseek') {
            return [
                normalizeModel(providerId, { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', context_length: 1000000 }),
                normalizeModel(providerId, { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context_length: 1000000 })
            ];
        }
        if (providerId === 'venice') {
            return [
                normalizeModel(providerId, { id: 'venice-uncensored', name: 'Venice Uncensored', context_length: 128000 })
            ];
        }
        return [];
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        el.toastContainer.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ============================================
