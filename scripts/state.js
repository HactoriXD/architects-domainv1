// Configuration
    // ============================================
    const CONFIG = {
        DEFAULT_PROVIDER: 'openrouter',
        DEFAULT_MODEL: 'anthropic/claude-sonnet-4',
        SITE_NAME: "Architect's Domain",
        SITE_URL: 'https://architects-domain.local',
        ASSISTANT_NAME: 'Assistant',
        STORAGE_KEY: 'architects_domain_chats',
        SETTINGS_KEY: 'architects_domain_settings'
    };

    const VISION_MODELS = ['anthropic/claude-sonnet-4','anthropic/claude-3.5-sonnet','anthropic/claude-3-opus','anthropic/claude-3-sonnet','anthropic/claude-3-haiku','openai/gpt-4o','openai/gpt-4o-mini','openai/gpt-4-turbo','google/gemini-pro-1.5','google/gemini-flash-1.5','meta-llama/llama-3.2-90b-vision-instruct','meta-llama/llama-3.2-11b-vision-instruct'];
    const SYSTEM_PROMPT_PRESETS = {
        roleplay: 'You are a vivid roleplay partner. Maintain character consistency, sensory detail, emotional continuity, and scene momentum. Ask before changing major stakes or tone.',
        coding: 'You are a senior engineering partner. Be precise, inspect assumptions, prefer existing patterns, explain tradeoffs briefly, and produce practical code with focused tests when useful.',
        research: 'You are a rigorous research analyst. Separate facts from inference, cite uncertainty, compare sources when available, and end with the clearest next question or decision.',
        journal: 'You are a reflective journaling companion. Be warm, grounded, and psychologically careful. Ask thoughtful questions, notice patterns, and never overclaim certainty.',
        lorekeeper: 'You are a lorekeeper for an evolving fictional domain. Preserve canon, track names and contradictions, deepen symbols, and turn scattered ideas into coherent mythology.'
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
        webSearchToggle: document.getElementById('webSearchToggle'),
        webSearchStatus: document.getElementById('webSearchStatus'),
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
    const formatFileSize = (bytes) => bytes < 1024 ? bytes+' B' : bytes < 1024*1024 ? (bytes/1024).toFixed(1)+' KB' : (bytes/(1024*1024)).toFixed(1)+' MB';
    const isVisionModel = (id) => VISION_MODELS.some(vm => id.includes(vm.split('/')[1]) || id === vm);
    const hasFreePricing = (m) => m.pricing && ('prompt' in m.pricing || 'completion' in m.pricing) && parseFloat(m.pricing?.prompt || 0) === 0 && parseFloat(m.pricing?.completion || 0) === 0;
    const getProvider = () => PROVIDERS[state.provider] || PROVIDERS[CONFIG.DEFAULT_PROVIDER];
    const getApiKey = () => (state.apiKeys[state.provider] || '').trim();

    function generateChatTitle(text) {
        if (!text) return 'New Ritual';
        const generic = /^\s*(hi|hello|hey|yo|sup|heyy|heyyy|hai|hola|what's up|whats up|greetings|good morning|good evening|good afternoon|howdy|wassup|wsg|helo)\s*[!.]*\s*$/i;
        if (generic.test(text)) return null;
        const cleaned = text.replace(/^["']|["']$/g, '').replace(/[!?#]+/g, '').replace(/\s+/g, ' ').trim();
        const words = cleaned.split(/\s+/);
        const title = words.slice(0, 5).join(' ');
        if (!title) return 'New Ritual';
        return title.charAt(0).toUpperCase() + title.slice(1);
    }

    function generateChatTitleFromMessages(messages) {
        for (const msg of messages) {
            if (msg.role === 'user') {
                const title = generateChatTitle(msg.content);
                if (title) return title;
            }
        }
        return 'New Ritual';
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

    function normalizeModel(providerId, model) {
        const id = model.id || model.model || model.name;
        return {
            ...model,
            id,
            name: model.name || model.id || id,
            provider: providerId,
            context_length: model.context_length || model.contextLength || model.model_spec?.capabilities?.optimizedForCode?.contextLength || 0,
            pricing: model.pricing || {}
        };
    }

    function buildFallbackModels(providerId) {
        if (providerId === 'deepseek') {
            return [
                { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', context_length: 128000, provider: providerId, pricing: {} },
                { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context_length: 128000, provider: providerId, pricing: {} }
            ];
        }
        if (providerId === 'venice') {
            return [
                { id: 'venice-uncensored', name: 'Venice Uncensored', context_length: 0, provider: providerId, pricing: {} }
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
