const PROVIDERS = {
        openrouter: {
            label: 'OpenRouter',
            apiBase: 'https://openrouter.ai/api/v1',
            defaultModel: CONFIG.DEFAULT_MODEL,
            supportsWebSearch: true,
            searchMode: 'openrouter-tool',
            supportsNativeTools: true,
            apiKeyLabel: 'OpenRouter API Key',
            apiKeyPlaceholder: 'sk-or-...',
            apiKeyHint: 'Used for OpenRouter model routing. Stored locally.',
            priority: ['anthropic', 'openai', 'google', 'meta', 'mistral']
        },
        groq: {
            label: 'Groq',
            badge: 'GroqCloud · OpenAI-compatible',
            apiBase: 'https://api.groq.com/openai/v1',
            defaultModel: 'llama-3.3-70b-versatile',
            supportsWebSearch: false,
            searchMode: 'none',
            supportsNativeTools: false,
            apiKeyLabel: 'Groq API Key',
            apiKeyPlaceholder: 'gsk_...',
            apiKeyHint: 'Used for GroqCloud\'s OpenAI-compatible endpoint. Stored locally.',
            priority: ['llama-3.3', 'openai', 'qwen', 'meta-llama', 'groq']
        },
        nanogpt: {
            label: 'NanoGPT',
            badge: 'NanoGPT · OpenAI-compatible',
            apiBase: 'https://nano-gpt.com/api/v1',
            defaultModel: 'openai/gpt-5.2',
            supportsWebSearch: false,
            searchMode: 'none',
            supportsNativeTools: false,
            apiKeyLabel: 'NanoGPT API Key',
            apiKeyPlaceholder: 'ngpt_... or NanoGPT API key',
            apiKeyHint: 'NanoGPT is OpenAI-compatible. Subscription mode uses NanoGPT’s subscription endpoint.',
            priority: ['openai', 'anthropic', 'google', 'minimax', 'qwen']
        },
        deepseek: {
            label: 'DeepSeek',
            apiBase: 'https://api.deepseek.com',
            defaultModel: 'deepseek-v4-flash',
            supportsWebSearch: false,
            searchMode: 'none',
            supportsNativeTools: true,
            apiKeyLabel: 'DeepSeek API Key',
            apiKeyPlaceholder: 'sk-...',
            apiKeyHint: 'Used for DeepSeek direct API requests. Stored locally.',
            priority: ['deepseek']
        },
        venice: {
            label: 'Venice.ai',
            apiBase: 'https://api.venice.ai/api/v1',
            defaultModel: 'venice-uncensored',
            supportsWebSearch: true,
            searchMode: 'venice-parameters',
            supportsNativeTools: true,
            apiKeyLabel: 'Venice API Key',
            apiKeyPlaceholder: 'api key',
            apiKeyHint: 'Used for Venice.ai direct API requests. Stored locally.',
            priority: ['venice', 'zai-org', 'deepseek', 'qwen', 'mistral', 'llama']
        }
    };

    const GROQ_CURATED_MODELS = [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', context_length: 131072, max_completion_tokens: 32768, input_cost_per_1k_tokens: 0.00059, output_cost_per_1k_tokens: 0.00079, tags: ['fast', 'coding'], capabilities: { streaming: true, tools: false }, pricing_source: 'provider' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', context_length: 131072, max_completion_tokens: 131072, input_cost_per_1k_tokens: 0.00005, output_cost_per_1k_tokens: 0.00008, tags: ['fast'], capabilities: { streaming: true, tools: false }, pricing_source: 'provider' },
        { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context_length: 131072, max_completion_tokens: 65536, input_cost_per_1k_tokens: 0.00015, output_cost_per_1k_tokens: 0.00060, tags: ['fast', 'reasoning', 'coding'], capabilities: { streaming: true, tools: false }, pricing_source: 'provider' },
        { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context_length: 131072, max_completion_tokens: 65536, input_cost_per_1k_tokens: 0.000075, output_cost_per_1k_tokens: 0.00030, tags: ['fast', 'reasoning'], capabilities: { streaming: true, tools: false }, pricing_source: 'provider' },
        { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', context_length: 131072, max_completion_tokens: 40960, input_cost_per_1k_tokens: 0.00029, output_cost_per_1k_tokens: 0.00059, tags: ['reasoning', 'coding'], capabilities: { streaming: true, tools: false }, pricing_source: 'provider' },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B 16E', context_length: 131072, max_completion_tokens: 8192, input_cost_per_1k_tokens: 0.00011, output_cost_per_1k_tokens: 0.00034, tags: ['fast', 'preview'], capabilities: { streaming: true, tools: false }, pricing_source: 'provider' },
        { id: 'groq/compound', name: 'Groq Compound', context_length: 131072, max_completion_tokens: 8192, tags: ['fast'], capabilities: { streaming: true, tools: false }, pricing_note: 'Provider pricing' },
        { id: 'groq/compound-mini', name: 'Groq Compound Mini', context_length: 131072, max_completion_tokens: 8192, tags: ['fast'], capabilities: { streaming: true, tools: false }, pricing_note: 'Provider pricing' }
    ];

    const NANOGPT_FALLBACK_MODELS = [
        { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
        { id: 'openai/gpt-5.2-chat-latest', name: 'GPT-5.2 Chat Latest' },
        { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
        { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'minimax/minimax-m2.7', name: 'MiniMax M2.7' },
        { id: 'qwen/qwen3-coder-plus', name: 'Qwen3 Coder Plus' }
    ];

// Model Management
    // ============================================
    async function fetchOpenRouterCategoryIds(category) {
        try {
            const response = await fetch(`${PROVIDERS.openrouter.apiBase}/models?category=${encodeURIComponent(category)}`, {
                headers: getAuthHeaders(false)
            });
            if (!response.ok) return new Set();
            const data = await response.json();
            return new Set((data.data || []).map(m => m.id).filter(Boolean));
        } catch (e) {
            return new Set();
        }
    }

    function mergeProviderModelsWithCurated(providerId, models = []) {
        if (providerId !== 'groq') return models;
        const byId = new Map(GROQ_CURATED_MODELS.map(model => [model.id, { ...model }]));
        for (const model of models) {
            if (!model?.id) continue;
            byId.set(model.id, { ...(byId.get(model.id) || {}), ...model });
        }
        return [...byId.values()];
    }

    function getNanoGptMode() {
        const mode = state.providerSettings.nanogpt?.mode || state.nanogptMode || 'standard';
        return ['standard', 'subscription', 'paid'].includes(mode) ? mode : 'standard';
    }

    function getNanoGptApiBase(mode = getNanoGptMode()) {
        if (mode === 'subscription') return 'https://nano-gpt.com/api/subscription/v1';
        if (mode === 'paid') return 'https://nano-gpt.com/api/paid/v1';
        return 'https://nano-gpt.com/api/v1';
    }

    function getProviderModelsUrl(providerId = state.provider, mode = getNanoGptMode()) {
        if (providerId === 'nanogpt') return `${getNanoGptApiBase(mode)}/models?detailed=true`;
        return `${getProvider().apiBase}/models`;
    }

    function getProviderChatUrl(providerId = state.provider) {
        if (providerId === 'nanogpt') {
            return getNanoGptMode() === 'subscription'
                ? 'https://nano-gpt.com/api/subscription/v1/chat/completions'
                : 'https://nano-gpt.com/api/v1/chat/completions';
        }
        return `${getProvider().apiBase}/chat/completions`;
    }

    function normalizeNanoGptModel(model) {
        const id = model.id || model.model || model.name;
        const rawName = model.name || model.display_name || model.title || id;
        const providerName = model.owned_by || model.provider || model.vendor || String(id || '').split('/')[0] || 'NanoGPT';
        const maxOutput = model.max_output_tokens || model.max_completion_tokens || model.max_tokens || model.output_limit || null;
        return {
            ...model,
            id,
            name: `NanoGPT · ${String(rawName || id).replace(/^NanoGPT\s*·\s*/i, '').trim()}`,
            owned_by: model.owned_by || providerName,
            provider_name: providerName,
            description: model.description || model.short_description || '',
            context_length: model.context_length || model.contextLength || model.context_window || model.max_context_length || 0,
            max_completion_tokens: maxOutput,
            max_output_tokens: maxOutput,
            capabilities: model.capabilities || {},
            pricing: model.pricing || model.cost_estimate || {},
            category: model.category || model.type || providerName,
            cost_estimate: model.cost_estimate || null,
            tags: Array.isArray(model.tags) ? model.tags : [providerName, model.category].filter(Boolean),
            pricing_note: model.pricing || model.cost_estimate ? null : 'Provider pricing'
        };
    }

    function normalizeNanoGptModelsCache(cache = state.nanogptModelsCache) {
        const empty = { standard: [], subscription: [], paid: [] };
        if (Array.isArray(cache)) return { ...empty, standard: cache };
        if (!cache || typeof cache !== 'object') return empty;
        return {
            standard: Array.isArray(cache.standard) ? cache.standard : [],
            subscription: Array.isArray(cache.subscription) ? cache.subscription : [],
            paid: Array.isArray(cache.paid) ? cache.paid : []
        };
    }

    function getNanoGptModeModels(mode = getNanoGptMode()) {
        state.nanogptModelsCache = normalizeNanoGptModelsCache();
        return state.nanogptModelsCache[mode] || [];
    }

    function getNanoGptModeLabel(mode = getNanoGptMode()) {
        if (mode === 'subscription') return 'NanoGPT Subscription';
        if (mode === 'paid') return 'NanoGPT Paid';
        return 'NanoGPT';
    }

    function labelNanoGptModelForMode(model, mode = getNanoGptMode()) {
        const rawName = String(model.name || model.id || '').replace(/^NanoGPT(?:\s+Subscription|\s+Paid)?\s*[·Â]\s*/i, '').trim();
        return { ...model, name: rawName, nanogptMode: mode };
    }

    function applyNanoGptModelCache(models, mode = getNanoGptMode()) {
        state.nanogptModelsCache = normalizeNanoGptModelsCache();
        state.nanogptModelsCache[mode] = models.map(model => labelNanoGptModelForMode(model, mode));
        state.nanogptModelsFetchedAt = Date.now();
        state.providerSettings.nanogpt = {
            ...(state.providerSettings.nanogpt || {}),
            mode,
            modelsCache: state.nanogptModelsCache,
            modelsFetchedAt: state.nanogptModelsFetchedAt
        };
    }

    function validateNanoGptSelectionForMode(mode = getNanoGptMode(), options = {}) {
        if (state.provider !== 'nanogpt') return true;
        const models = getNanoGptModeModels(mode);
        state.models = [...models];
        if (!models.length) {
            state.selectedModel = null;
            state.nanogptSelectedModel = '';
            state.providerSettings.nanogpt = {
                ...(state.providerSettings.nanogpt || {}),
                selectedModelId: null,
                mode
            };
            if (el.selectedModelName) el.selectedModelName.textContent = 'No models';
            renderModelList([]);
            updateNanoGptSettingsUI();
            updateSendButton();
            if (options.warn) showToast('No NanoGPT subscription models found. Refresh models or check your subscription/API key.', 'error');
            return false;
        }
        const selectedId = state.selectedModel?.provider === 'nanogpt' ? state.selectedModel.id : state.providerSettings.nanogpt?.selectedModelId;
        const selected = models.find(model => model.id === selectedId);
        selectModel(selected || models[0]);
        renderModelList(models);
        return true;
    }

    function canSendNanoGptSelection() {
        if (state.provider !== 'nanogpt' || getNanoGptMode() !== 'subscription') return true;
        const selectedId = state.selectedModel?.id;
        return Boolean(selectedId && getNanoGptModeModels('subscription').some(model => model.id === selectedId));
    }

    function buildNanoGptModelId(modelId = state.selectedModel?.id) {
        let id = String(modelId || '');
        if (!id || state.provider !== 'nanogpt') return id;
        const parts = id.split(':');
        const base = parts.shift();
        const suffixes = new Set(parts.filter(Boolean));
        if (state.nanogptOnlineEnabled) suffixes.add('online');
        if (state.nanogptMemoryEnabled) suffixes.add('memory');
        return [base, ...suffixes].join(':');
    }

    function updateNanoGptSettingsUI() {
        const visible = state.provider === 'nanogpt';
        if (el.nanoGptSettingsGroup) el.nanoGptSettingsGroup.hidden = !visible;
        if (!visible) return;
        state.nanogptModelsCache = normalizeNanoGptModelsCache();
        if (el.nanoGptModeSelect) el.nanoGptModeSelect.value = getNanoGptMode();
        if (el.nanoGptOnlineToggle) el.nanoGptOnlineToggle.checked = Boolean(state.nanogptOnlineEnabled);
        if (el.nanoGptMemoryToggle) el.nanoGptMemoryToggle.checked = Boolean(state.nanogptMemoryEnabled);
        if (el.nanoGptModelPreview) el.nanoGptModelPreview.textContent = buildNanoGptModelId() || 'Select a NanoGPT model';
    }

    async function fetchModels() {
        const provider = getProvider();
        const nanoGptMode = state.provider === 'nanogpt' ? getNanoGptMode() : null;
        try {
            el.selectedModelName.textContent = `Loading ${provider.label}...`;
            el.modelList.innerHTML = '<div class="loading-models"><div class="spinner"></div><span>Loading models...</span></div>';
            if (!getApiKey() && !['openrouter', 'nanogpt'].includes(state.provider)) {
                state.models = buildFallbackModels(state.provider);
                state.modelCategories.roleplay = new Set();
                state.modelCategories.coding = new Set();
                const savedId = state.selectedModel?.provider === state.provider ? state.selectedModel.id : loadSettings();
                const model = state.models.find(m => m.id === savedId) || state.models.find(m => m.id === provider.defaultModel) || state.models[0];
                if (model) selectModel(model);
                else {
                    state.selectedModel = null;
                    el.selectedModelName.textContent = 'No models';
                }
                renderModelList(state.models);
                setProviderStatus(state.provider, 'missing');
                const missingCopy = state.provider === 'groq'
                    ? 'Add Groq API key to fetch live availability. Showing curated Groq models.'
                    : `Add ${provider.label} API key to fetch live availability. Showing local fallback models.`;
                el.modelList.insertAdjacentHTML('afterbegin', `<div class="loading-models provider-empty-state">${missingCopy}</div>`);
                return;
            }
            const response = await fetch(getProviderModelsUrl(), { headers: getAuthHeaders(false) });
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            const providerModels = state.provider === 'nanogpt'
                ? (data.data || []).map(normalizeNanoGptModel).map(model => labelNanoGptModelForMode(model, nanoGptMode))
                : mergeProviderModelsWithCurated(state.provider, data.data || []);
            state.models = providerModels.map(m => normalizeModel(state.provider, m)).filter(m => m.id).sort((a, b) => {
                const priority = provider.priority || [];
                const aP = priority.indexOf(a.id.split('/')[0]), bP = priority.indexOf(b.id.split('/')[0]);
                if (aP !== -1 && bP !== -1) return aP - bP;
                if (aP !== -1) return -1; if (bP !== -1) return 1;
                return a.id.localeCompare(b.id);
            });
            if (state.provider === 'nanogpt') applyNanoGptModelCache(state.models, nanoGptMode);
            if (state.provider === 'openrouter') {
                const [roleplayIds, codingIds] = await Promise.all([
                    fetchOpenRouterCategoryIds('roleplay'),
                    fetchOpenRouterCategoryIds('programming')
                ]);
                state.modelCategories.roleplay = roleplayIds;
                state.modelCategories.coding = codingIds;
            } else {
                state.modelCategories.roleplay = new Set();
                state.modelCategories.coding = new Set();
            }
            if (state.provider === 'nanogpt') {
                if (!validateNanoGptSelectionForMode(nanoGptMode, { warn: nanoGptMode === 'subscription' })) return;
            } else {
                renderModelList(state.models);
            }
            const savedId = state.selectedModel?.provider === state.provider ? state.selectedModel.id : loadSettings();
            const model = state.models.find(m => m.id === savedId) || state.models.find(m => m.id === provider.defaultModel) || state.models[0];
            if (model && state.provider !== 'nanogpt') selectModel(model);
            setProviderStatus(state.provider, getApiKey() ? 'connected' : 'untested');
        } catch (error) {
            console.error('Error:', error);
            setProviderStatus(state.provider, getApiKey() ? 'error' : 'untested');
            state.modelCategories.roleplay = new Set();
            state.modelCategories.coding = new Set();
            if (state.provider === 'nanogpt' && nanoGptMode === 'subscription') {
                applyNanoGptModelCache([], nanoGptMode);
                validateNanoGptSelectionForMode(nanoGptMode, { warn: true });
                return;
            }
            state.models = buildFallbackModels(state.provider);
            if (state.provider === 'nanogpt') {
                applyNanoGptModelCache(state.models, nanoGptMode);
                state.models = getNanoGptModeModels(nanoGptMode);
            }
            if (state.models.length) {
                renderModelList(state.models);
                selectModel(state.models[0]);
                showToast(`Using fallback ${provider.label} models`, 'info');
            } else {
                state.selectedModel = null;
                el.selectedModelName.textContent = 'No models';
                showToast(`Failed to load ${provider.label} models`, 'error');
                el.modelList.innerHTML = '<div class="loading-models" style="color:var(--error)">Failed to load</div>';
            }
        }
    }

    function renderModelList(models) {
        if (models.length === 0) {
            const message = state.provider === 'nanogpt' && getNanoGptMode() === 'subscription'
                ? 'No NanoGPT subscription models found. Refresh models or check your subscription/API key.'
                : 'No models found';
            el.modelList.innerHTML = `<div class="loading-models">${escapeHtml(message)}</div>`;
            return;
        }
        const filteredModels = state.modelFilter === 'all' ? models : models.filter(m => getModelTraits(m)[state.modelFilter]);
        if (filteredModels.length === 0) { el.modelList.innerHTML = '<div class="loading-models">No models match this filter</div>'; return; }
        const renderItems = (items) => items.map(m => {
            const ctx = formatContextSize(m.context_length || 0);
            const tokenPricing = formatTokenPricing(m);
            const oneMessageCost = formatEstimatedMessageCost(m, 1000, 1000);
            const traits = getModelTraits(m);
            const modelId = escapeHtml(m.id);
            const modelName = escapeHtml(m.name || m.id);
            const modelTitle = escapeHtml(m.name || m.id);
            const providerBadge = state.provider === 'groq'
                ? '<span class="model-badge groq">GroqCloud</span>'
                : state.provider === 'nanogpt'
                    ? `<span class="model-badge nanogpt">${m.fallback ? 'Fallback' : 'NanoGPT'}</span>`
                    : '';
            const badges = [
                traits.free ? '<span class="model-badge free">Free</span>' : (state.provider === 'openrouter' ? '<span class="model-badge paid">Paid</span>' : ''),
                providerBadge,
                traits.vision ? '<span class="model-badge vision">Vision</span>' : '',
                traits.reasoning ? '<span class="model-badge reasoning">Reasoning</span>' : '',
                traits.coding ? '<span class="model-badge coding">Coding</span>' : '',
                traits.roleplay ? '<span class="model-badge roleplay">Roleplay</span>' : ''
            ].join('');
            const displayCostMeta = oneMessageCost === 'Provider pricing' ? 'Provider pricing' : `${oneMessageCost}/1K+1K`;
            return `<div class="model-item ${state.selectedModel?.id === m.id ? 'selected' : ''}" data-model-id="${modelId}" title="${modelTitle}">
                <div class="model-item-header"><div class="model-item-name"><span title="${modelTitle}">${modelName}</span>${badges}</div><span class="model-item-context">${ctx} ctx</span></div>
                <div class="model-item-meta">${getProvider().badge || getProvider().label} &middot; ${tokenPricing} &middot; ${displayCostMeta}</div></div>`;
        }).join('');
        if (state.provider === 'openrouter') {
            const paidModels = filteredModels.filter(m => !getModelTraits(m).free);
            const freeModels = filteredModels.filter(m => getModelTraits(m).free);
            const sections = [];
            if (paidModels.length) sections.push(`<div class="model-list-section"><div class="model-list-section-title">Paid Models</div>${renderItems(paidModels)}</div>`);
            if (freeModels.length) sections.push(`<div class="model-list-section"><div class="model-list-section-title">Free Models</div>${renderItems(freeModels)}</div>`);
            el.modelList.innerHTML = sections.join('');
        } else {
            el.modelList.innerHTML = renderItems(filteredModels);
        }
    }

    function handleModelListClick(event) {
        const item = event.target.closest('.model-item');
        if (!item?.dataset.modelId) return;
        const model = state.models.find(m => m.id === item.dataset.modelId);
        if (model) {
            selectModel(model);
            closeModelDropdown();
        }
    }

    function selectModel(model) {
        state.selectedModel = model;
        state.providerSettings[state.provider] = {
            ...(state.providerSettings[state.provider] || {}),
            selectedModelId: model.id,
            settings: { ...state.settings }
        };
        if (state.provider === 'nanogpt') state.nanogptSelectedModel = model.id;
        const workspace = getActiveWorkspace();
        if (workspace) {
            workspace.providerPreset = {
                provider: state.provider,
                selectedModelId: model.id,
                settings: { ...state.settings }
            };
            touchWorkspace(workspace.id);
        }
        el.selectedProviderName.textContent = getProvider().label;
        updateSelectedModelCostDisplay();
        el.visionBadge.style.display = isVisionModel(model.id) ? 'inline-block' : 'none';
        el.modelList.querySelectorAll('.model-item').forEach(item => item.classList.toggle('selected', item.dataset.modelId === model.id));
        if (model.context_length) el.contextMax.textContent = formatContextSize(model.context_length);
        updateDeepSeekThinkingUI();
        updateNanoGptSettingsUI();
        updateStats();
        saveSettings();
    }

    function updateSelectedModelCostDisplay() {
        if (!state.selectedModel || !el.selectedModelName) return;
        const name = (state.selectedModel.name || state.selectedModel.id).replace(/^[^:]+:\s*/, '');
        el.selectedModelName.textContent = name;
        el.selectedModelName.title = name;
    }

    function estimateCurrentInputTokens() {
        const draftTokens = estimateTokens(el.messageInput?.value || '');
        return draftTokens
            + estimateTokens(state.savedSystemPrompt)
            + estimateTokens(state.pinnedNotes)
            + getEnabledMemoriesForContext().reduce((acc, memory) => acc + estimateTokens(memory.content), 0)
            + state.messages.reduce((acc, message) => acc + estimateTokens(message.content), 0);
    }

    function filterModels(query) {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            renderModelList(state.models);
            return;
        }
        renderModelList(state.models.filter(m => m.id.toLowerCase().includes(normalizedQuery) || (m.name && m.name.toLowerCase().includes(normalizedQuery))));
    }
    function setModelFilter(filter) {
        const chip = el.modelFilterRow.querySelector(`[data-filter="${filter}"]`);
        if (chip?.hidden) filter = 'all';
        state.modelFilter = filter;
        el.modelFilterRow.querySelectorAll('.model-filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === filter));
        filterModels(el.modelSearch.value);
    }
    function toggleModelDropdown() { const open = el.modelDropdown.classList.toggle('open'); el.modelSelectorBtn.classList.toggle('open', open); if (open) { el.modelSearch.focus(); el.modelSearch.value = ''; state.modelFilter = 'all'; el.modelFilterRow.querySelectorAll('.model-filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all')); renderModelList(state.models); } }
    function closeModelDropdown() { el.modelDropdown.classList.remove('open'); el.modelSelectorBtn.classList.remove('open'); }
    function toggleSettings() { el.settingsPanel.classList.toggle('open'); }
    function closeSettings() { el.settingsPanel.classList.remove('open'); }
    function openSettings(focusApiKey = false) {
        requestAnimationFrame(() => {
            el.settingsPanel.classList.add('open');
            if (focusApiKey) el.apiKeyInput.focus();
        });
    }

    function updateProviderUI() {
        const provider = getProvider();
        el.providerSelect.value = state.provider;
        el.apiKeyInput.value = state.apiKeys[state.provider] || '';
        if (el.apiKeyLabel) el.apiKeyLabel.textContent = provider.apiKeyLabel || `${provider.label} API Key`;
        if (el.apiKeyInput) el.apiKeyInput.placeholder = provider.apiKeyPlaceholder || 'Enter API key for selected provider';
        if (el.apiKeyHint) el.apiKeyHint.textContent = provider.apiKeyHint || 'Your API keys remain locally stored in your browser and are sent directly to the selected provider.';
        if (el.testProviderBtn) el.testProviderBtn.textContent = `Test ${provider.label} Connection`;
        const freeFilter = el.modelFilterRow.querySelector('[data-filter="free"]');
        if (freeFilter) {
            freeFilter.hidden = state.provider !== 'openrouter';
            if (freeFilter.hidden && state.modelFilter === 'free') state.modelFilter = 'all';
        }
        el.modelFilterRow.querySelectorAll('.model-filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === state.modelFilter));
        updateProviderStatusUI();
        updateWebSearchUI();
        updateDeepSeekThinkingUI();
        updateNanoGptSettingsUI();
    }

    function updateWebSearchUI() {
        const provider = getProvider();
        if (state.webSearchEnabled && !provider.supportsWebSearch) state.webSearchEnabled = false;
        el.webSearchToggle.classList.toggle('active', state.webSearchEnabled);
        el.webSearchStatus.textContent = state.webSearchEnabled ? 'On' : 'Off';
        el.webSearchToggle.disabled = !provider.supportsWebSearch;
        el.webSearchToggle.title = provider.supportsWebSearch
            ? `${provider.label} web search is ${state.webSearchEnabled ? 'on' : 'off'}`
            : `${provider.label} direct API does not expose web search`;
    }

    function supportsThinkingControl(providerId = state.provider) {
        return ['deepseek', 'openrouter', 'venice'].includes(providerId);
    }

    function getDeepSeekThinkingEnabled(modelId = state.selectedModel?.id, providerId = state.provider) {
        if (!modelId || !supportsThinkingControl(providerId)) return false;
        return Boolean(state.providerSettings[providerId]?.thinkingByModel?.[modelId]);
    }

    function setDeepSeekThinkingEnabled(enabled, modelId = state.selectedModel?.id, providerId = state.provider) {
        if (!modelId || !supportsThinkingControl(providerId)) return;
        state.providerSettings[providerId] = {
            ...(state.providerSettings[providerId] || {}),
            thinkingByModel: {
                ...(state.providerSettings[providerId]?.thinkingByModel || {}),
                [modelId]: Boolean(enabled)
            }
        };
        saveSettings();
        updateDeepSeekThinkingUI();
        updateNanoGptSettingsUI();
    }

    function updateDeepSeekThinkingUI() {
        const provider = getProvider();
        const canThink = supportsThinkingControl(state.provider) && Boolean(state.selectedModel);
        const thinkingEnabled = canThink && getDeepSeekThinkingEnabled();

        if (el.deepSeekThinkingGroup && el.deepSeekThinkingToggle) {
            el.deepSeekThinkingGroup.hidden = !canThink;
            el.deepSeekThinkingToggle.checked = thinkingEnabled;
            if (el.thinkingSettingsTitle) el.thinkingSettingsTitle.textContent = `Enable ${provider.label} Thinking Mode`;
            if (el.thinkingSettingsHint) {
                el.thinkingSettingsHint.textContent = `${provider.label} will request visible reasoning when the selected model supports it.`;
            }
        }

        if (el.deepSeekThinkingButton && el.deepSeekThinkingButtonLabel) {
            el.deepSeekThinkingButton.hidden = !canThink;
            el.deepSeekThinkingButton.classList.toggle('active', thinkingEnabled);
            el.deepSeekThinkingButton.classList.toggle('generating', thinkingEnabled && state.isStreaming);
            el.deepSeekThinkingButton.setAttribute('aria-pressed', String(thinkingEnabled));
            el.deepSeekThinkingButtonLabel.textContent = thinkingEnabled ? 'THINKING ON' : 'THINKING OFF';
            if (el.thinkingProviderLabel) el.thinkingProviderLabel.textContent = provider.label;
            el.deepSeekThinkingButton.title = thinkingEnabled
                ? state.isStreaming
                    ? `${provider.label} thinking is active during generation`
                    : `${provider.label} thinking is on for this model`
                : `${provider.label} thinking is off for this model`;
        }
    }

    async function changeProvider(providerId) {
        if (!PROVIDERS[providerId] || state.provider === providerId) return;
        persistCurrentProviderSettings();
        state.provider = providerId;
        restoreProviderSettings(providerId);
        state.selectedModel = null;
        state.models = [];
        state.modelFilter = 'all';
        el.selectedProviderName.textContent = getProvider().label;
        el.selectedModelName.textContent = 'Loading...';
        updateProviderUI();
        saveSettings();
        closeModelDropdown();
        await fetchModels();
        updateSendButton();
    }

    function persistCurrentProviderSettings() {
        state.providerSettings[state.provider] = {
            ...(state.providerSettings[state.provider] || {}),
            selectedModelId: state.selectedModel?.id || state.providerSettings[state.provider]?.selectedModelId || null,
            settings: { ...state.settings },
            thinkingByModel: { ...(state.providerSettings[state.provider]?.thinkingByModel || {}) },
            ...(state.provider === 'nanogpt' ? { mode: getNanoGptMode() } : {})
        };
        const workspace = getActiveWorkspace();
        if (workspace) {
            workspace.providerPreset = {
                provider: state.provider,
                selectedModelId: state.selectedModel?.id || state.providerSettings[state.provider]?.selectedModelId || null,
                settings: { ...state.settings }
            };
            touchWorkspace(workspace.id);
        }
    }

    function restoreProviderSettings(providerId) {
        const saved = state.providerSettings[providerId];
        state.settings = { temperature: 0.7, maxTokens: 8192, topP: 1.0, topK: 0, frequencyPenalty: 0, presencePenalty: 0, ...(saved?.settings || {}) };
        restoreSettingsUI();
    }

    function setProviderStatus(providerId, status) {
        state.providerStatus[providerId] = status;
        updateProviderStatusUI();
        saveSettings();
    }

    function updateProviderStatusUI() {
        if (!el.providerStatus) return;
        const status = state.providerStatus[state.provider] || (getApiKey() ? 'untested' : 'missing');
        const labels = {
            connected: 'Connected',
            testing: 'Testing...',
            error: 'Invalid',
            missing: 'Missing key',
            untested: 'Not tested'
        };
        el.providerStatus.textContent = labels[status] || 'Not tested';
        el.providerStatus.className = `provider-status ${status === 'connected' ? 'connected' : status === 'error' || status === 'missing' ? 'error' : status === 'testing' ? 'testing' : ''}`;
    }

    async function testProviderConnection() {
        if (!getApiKey()) {
            setProviderStatus(state.provider, 'missing');
            showToast(`Enter a ${getProvider().label} API key first`, 'error');
            return;
        }
        setProviderStatus(state.provider, 'testing');
        try {
            const response = await fetch(getProviderModelsUrl(), { headers: getAuthHeaders(false) });
            if (!response.ok) throw new Error(await parseApiError(response));
            setProviderStatus(state.provider, 'connected');
            showToast(`${getProvider().label} connection verified`, 'success');
            await fetchModels();
        } catch (error) {
            console.error('Provider test failed:', error.message || error);
            setProviderStatus(state.provider, 'error');
            showToast(`${getProvider().label} key failed validation`, 'error');
        }
    }

    function clearLocalKeys() {
        if (!confirm('Clear all locally stored provider keys from this browser?')) return;
        state.apiKeys = {};
        state.providerStatus = {};
        el.apiKeyInput.value = '';
        saveSettings();
        updateProviderUI();
        updateSendButton();
        showToast('Local provider keys cleared', 'success');
    }

    function toggleWebSearch() {
        if (!getProvider().supportsWebSearch) {
            state.webSearchEnabled = false;
            updateWebSearchUI();
            saveSettings();
            showToast(`${getProvider().label} direct API has no web search endpoint`, 'info');
            return;
        }
        state.webSearchEnabled = !state.webSearchEnabled;
        updateWebSearchUI();
        saveSettings();
        if (state.webSearchEnabled && !getProvider().supportsWebSearch) {
            showToast(`${getProvider().label} direct API has no web search endpoint`, 'info');
        }
    }

    // ============================================

// API Communication
    // ============================================
    function buildRequestBody(apiMessages, options = {}) {
        const provider = getProvider();
        const requestBody = {
            model: state.provider === 'nanogpt' ? buildNanoGptModelId(state.selectedModel.id) : state.selectedModel.id,
            messages: apiMessages,
            temperature: state.settings.temperature,
            max_tokens: state.settings.maxTokens,
            top_p: state.settings.topP,
            stream: true
        };
        if (state.provider !== 'groq') requestBody.stream_options = { include_usage: true };
        if (state.settings.topK > 0 && state.provider !== 'deepseek') requestBody.top_k = state.settings.topK;
        if (state.provider === 'groq') delete requestBody.top_k;
        if (state.settings.frequencyPenalty > 0 && state.provider !== 'groq') requestBody.frequency_penalty = state.settings.frequencyPenalty;
        if (state.settings.presencePenalty > 0 && state.provider !== 'groq') requestBody.presence_penalty = state.settings.presencePenalty;
        if (state.provider === 'groq' && requestBody.temperature === 0) requestBody.temperature = 0.00000001;
        if (state.provider === 'nanogpt') {
            delete requestBody.stream_options;
            delete requestBody.top_k;
            delete requestBody.frequency_penalty;
            delete requestBody.presence_penalty;
        }

        if (state.webSearchEnabled && provider.searchMode === 'openrouter-tool') {
            requestBody.tools = [{ type: 'openrouter:web_search', parameters: { max_results: 5, search_context_size: 'medium' } }];
        }
        const mcpTools = options.includeMcpTools === false
            ? []
            : (typeof buildProviderToolDefinitions === 'function' ? buildProviderToolDefinitions() : []);
        if (mcpTools.length && provider.supportsNativeTools !== false && !(state.webSearchEnabled && provider.searchMode === 'openrouter-tool')) {
            requestBody.tools = mcpTools;
            requestBody.tool_choice = 'auto';
        }
        if (state.webSearchEnabled && provider.searchMode === 'venice-parameters') {
            requestBody.venice_parameters = {
                enable_web_search: 'on',
                enable_web_citations: true
            };
        }
        if (supportsThinkingControl(state.provider)) {
            const thinkingEnabled = getDeepSeekThinkingEnabled(state.selectedModel?.id, state.provider);
            if (state.provider === 'openrouter') {
                requestBody.reasoning = thinkingEnabled
                    ? { enabled: true, effort: 'high', exclude: false }
                    : { enabled: false, effort: 'none', exclude: true };
            } else if (state.provider === 'venice') {
                requestBody.reasoning = thinkingEnabled
                    ? { enabled: true, effort: 'high', summary: 'auto' }
                    : { enabled: false };
                requestBody.reasoning_effort = thinkingEnabled ? 'high' : 'none';
                requestBody.venice_parameters = {
                    ...(requestBody.venice_parameters || {}),
                    disable_thinking: !thinkingEnabled,
                    strip_thinking_response: !thinkingEnabled
                };
            } else if (state.provider === 'deepseek') {
            requestBody.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
            if (thinkingEnabled) requestBody.reasoning_effort = 'high';
            }
        }

        return requestBody;
    }

    async function parseApiError(response) {
        try {
            const err = await response.json();
            return formatProviderError(response.status, err.error?.message || err.message || 'API request failed');
        } catch (e) {
            return formatProviderError(response.status, await response.text() || 'API request failed');
        }
    }

    function formatProviderError(status, message) {
        const provider = getProvider();
        const detail = String(message || '').trim();
        if (state.provider === 'groq') {
            if (status === 401 || /unauthorized|invalid api key|api key/i.test(detail)) return 'Groq API key was rejected. Check your Groq API key in Settings.';
            if (status === 404 || /model.*not.*found|does not exist|not found/i.test(detail)) return 'Groq could not find that model. Pick a current Groq model or refresh the model list.';
            if (status === 429 || /rate limit|too many requests/i.test(detail)) return 'Groq rate limit reached. Wait a moment or choose a smaller/faster model.';
            if (status === 413 || /context|maximum context|token/i.test(detail)) return 'Groq rejected the request because the context or output token limit is too large.';
            if (status === 400 && /unsupported|not supported|unknown parameter|invalid.*parameter/i.test(detail)) return `Groq rejected an unsupported request parameter. ${detail}`;
            if (/failed to fetch|network|cors/i.test(detail)) return 'Could not reach GroqCloud. Check your network connection and browser CORS access.';
            return `Groq request failed. ${detail}`;
        }
        if (state.provider === 'nanogpt') {
            if (status === 401 || status === 403 || /unauthorized|invalid api key|api key/i.test(detail)) return 'NanoGPT API key was rejected. Check your NanoGPT API key in Settings.';
            if (status === 402 || /balance|payment|insufficient|credits/i.test(detail)) return 'NanoGPT reports insufficient balance or payment access for this request.';
            if (status === 404 || /model.*not.*found|does not exist|not found|unavailable/i.test(detail)) return 'NanoGPT could not use that model. Refresh models or choose another NanoGPT model.';
            if (status === 429 || /rate limit|too many requests/i.test(detail)) return 'NanoGPT rate limit reached. Wait a moment or choose another model.';
            if (/failed to fetch|network|cors/i.test(detail)) return 'Could not reach NanoGPT. Check your network connection and browser CORS access.';
            return `NanoGPT request failed. ${detail}`;
        }
        return detail || `${provider.label} request failed`;
    }

    function normalizeUsage(usage) {
        if (!usage) return null;
        const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? 0;
        const output = usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? 0;
        const total = usage.total_tokens ?? usage.totalTokens ?? (input + output);
        return {
            input: Number(input) || 0,
            output: Number(output) || 0,
            total: Number(total) || 0,
            provider: state.provider,
            model: state.selectedModel?.id || null,
            exact: true,
            at: Date.now()
        };
    }

    function refreshLastUsageFromMessages() {
        const lastWithUsage = [...state.messages].reverse().find(m => m.usage);
        state.lastUsage = lastWithUsage?.usage || null;
        if (state.currentChatId && state.chats[state.currentChatId]) {
            state.chats[state.currentChatId].lastUsage = state.lastUsage;
        }
    }

    function buildPinnedContextMessage(notes) {
        const trimmed = String(notes || '').trim();
        if (!trimmed) return null;
        return {
            role: 'system',
            content: `Pinned chat context. Use this as durable context for this chat, but do not mention it unless directly relevant.\n\n${trimmed}`
        };
    }

    function buildWorkspaceNotesMessage(workspace = getActiveWorkspace()) {
        const notes = String(workspace?.workspaceNotes || '').trim();
        if (!notes) return null;
        return {
            role: 'system',
            content: `Workspace notes. Use these as durable project context for this workspace.\n\n${notes}`
        };
    }

    const MEMORY_CATEGORY_ORDER = ['identity', 'preference', 'relationship', 'project', 'goal'];

    function getEnabledMemoriesForContext() {
        return [...state.memories]
            .filter(memory => memory.enabled && memory.content && memory.workspaceId === state.activeWorkspaceId)
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                const aCategory = MEMORY_CATEGORY_ORDER.indexOf(a.category);
                const bCategory = MEMORY_CATEGORY_ORDER.indexOf(b.category);
                const categoryCompare = (aCategory === -1 ? 999 : aCategory) - (bCategory === -1 ? 999 : bCategory);
                if (categoryCompare !== 0) return categoryCompare;
                if ((a.updatedAt || 0) !== (b.updatedAt || 0)) return (a.updatedAt || 0) - (b.updatedAt || 0);
                return String(a.id).localeCompare(String(b.id));
            });
    }

    function buildMemoryContextMessage(memories = getEnabledMemoriesForContext()) {
        if (!memories.length) return null;
        const lines = memories.map(memory => `- [${memory.category}${memory.pinned ? ', pinned' : ''}] ${memory.content}`);
        return {
            role: 'system',
            content: `Persistent user-approved memory. Use these notes as durable context, but do not mention them unless directly relevant.\n\n${lines.join('\n')}`
        };
    }

    function getEnabledLorebooksForContext(workspace = getActiveWorkspace()) {
        return [...(workspace?.lorebooks || [])]
            .filter(entry => entry.enabled && entry.content)
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                if ((a.updatedAt || 0) !== (b.updatedAt || 0)) return (a.updatedAt || 0) - (b.updatedAt || 0);
                return String(a.id).localeCompare(String(b.id));
            });
    }

    function buildLorebookContextMessage(entries = getEnabledLorebooksForContext()) {
        if (!entries.length) return null;
        const lines = entries.map(entry => `## ${entry.title}${entry.pinned ? ' (pinned)' : ''}\n${entry.content}`);
        return {
            role: 'system',
            content: `Workspace lorebook entries. Treat these as user-approved durable canon or project facts.\n\n${lines.join('\n\n')}`
        };
    }

    function buildMcpMemoryContextMessage(memories = state.mcpMemoryContext || []) {
        if (!memories.length) return null;
        const lines = memories.slice(0, 5).map(memory => `- [${memory.importance || 'memory'}${memory.tags?.length ? `; ${memory.tags.join(', ')}` : ''}] ${memory.content}`);
        return {
            role: 'system',
            content: `Relevant Memory MCP recall. Use these local memories only when relevant, and do not mention this context unless asked.\n\n${lines.join('\n')}`
        };
    }

    function getEnabledImportedFilesForContext(workspace = getActiveWorkspace()) {
        return [...(workspace?.importedFiles || [])]
            .filter(file => file.enabled && file.content)
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                if ((a.updatedAt || 0) !== (b.updatedAt || 0)) return (a.updatedAt || 0) - (b.updatedAt || 0);
                return String(a.id).localeCompare(String(b.id));
            });
    }

    function buildImportedFilesContextMessage(files = getEnabledImportedFilesForContext()) {
        if (!files.length) return null;
        const sections = files.map(file => `## ${file.name}${file.pinned ? ' (pinned)' : ''}\n${file.content.slice(0, WORKSPACE_FILE_LIMIT)}`);
        return {
            role: 'system',
            content: `Workspace imported files. Use these local files only when relevant.\n\n${sections.join('\n\n')}`
        };
    }

    function buildMcpCapabilityContextMessage() {
        if (typeof buildMcpRuntimeContextMessage === 'function') return buildMcpRuntimeContextMessage();
        return null;
    }

    function messageToApiMessage(msg) {
        if (msg.role === 'tool_result') {
            return { role: 'assistant', content: msg.content };
        }
        if (msg.attachments?.length && msg.role === 'user') {
            const contentParts = [];
            for (const att of msg.attachments) {
                if (att.type === 'image' && att.data) {
                    const base64Match = att.data.match(/^data:([^;]+);base64,(.+)$/);
                    if (base64Match) contentParts.push({ type: 'image_url', image_url: { url: att.data } });
                } else if (att.type === 'file' && att.data) {
                    contentParts.push({ type: 'text', text: `[File: ${att.name}]\n${att.data}` });
                }
            }
            if (msg.content) contentParts.push({ type: 'text', text: msg.content });
            return { role: msg.role, content: contentParts.length === 1 && contentParts[0].type === 'text' ? contentParts[0].text : contentParts };
        }

        return { role: msg.role, content: msg.content };
    }

    function buildApiMessages(messages, options = {}) {
        const apiMessages = [];
        const systemPrompt = String(options.systemPrompt ?? state.savedSystemPrompt ?? '').trim();
        const pinnedNotes = String(options.pinnedNotes ?? state.pinnedNotes ?? '').trim();
        if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
        const workspaceNotesMessage = buildWorkspaceNotesMessage();
        if (workspaceNotesMessage) apiMessages.push(workspaceNotesMessage);
        const pinnedMessage = buildPinnedContextMessage(pinnedNotes);
        const mcpMemoryMessage = buildMcpMemoryContextMessage();
        if (mcpMemoryMessage) apiMessages.push(mcpMemoryMessage);
        const memoryMessage = buildMemoryContextMessage();
        if (memoryMessage) apiMessages.push(memoryMessage);
        const lorebookMessage = buildLorebookContextMessage();
        if (lorebookMessage) apiMessages.push(lorebookMessage);
        const importedFilesMessage = buildImportedFilesContextMessage();
        if (importedFilesMessage) apiMessages.push(importedFilesMessage);
        const mcpMessage = buildMcpCapabilityContextMessage();
        if (mcpMessage) apiMessages.push(mcpMessage);
        if (pinnedMessage) apiMessages.push(pinnedMessage);
        for (const msg of messages) apiMessages.push(messageToApiMessage(msg));
        return apiMessages;
    }
