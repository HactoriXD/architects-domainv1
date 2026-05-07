const PROVIDERS = {
        openrouter: {
            label: 'OpenRouter',
            apiBase: 'https://openrouter.ai/api/v1',
            defaultModel: CONFIG.DEFAULT_MODEL,
            supportsWebSearch: true,
            searchMode: 'openrouter-tool',
            priority: ['anthropic', 'openai', 'google', 'meta', 'mistral']
        },
        deepseek: {
            label: 'DeepSeek',
            apiBase: 'https://api.deepseek.com',
            defaultModel: 'deepseek-v4-flash',
            supportsWebSearch: false,
            searchMode: 'none',
            priority: ['deepseek']
        },
        venice: {
            label: 'Venice.ai',
            apiBase: 'https://api.venice.ai/api/v1',
            defaultModel: 'venice-uncensored',
            supportsWebSearch: true,
            searchMode: 'venice-parameters',
            priority: ['venice', 'zai-org', 'deepseek', 'qwen', 'mistral', 'llama']
        }
    };

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

    async function fetchModels() {
        const provider = getProvider();
        try {
            el.selectedModelName.textContent = `Loading ${provider.label}...`;
            el.modelList.innerHTML = '<div class="loading-models"><div class="spinner"></div><span>Loading models...</span></div>';
            const response = await fetch(`${provider.apiBase}/models`, { headers: getAuthHeaders(false) });
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            state.models = (data.data || []).map(m => normalizeModel(state.provider, m)).filter(m => m.id).sort((a, b) => {
                const priority = provider.priority || [];
                const aP = priority.indexOf(a.id.split('/')[0]), bP = priority.indexOf(b.id.split('/')[0]);
                if (aP !== -1 && bP !== -1) return aP - bP;
                if (aP !== -1) return -1; if (bP !== -1) return 1;
                return a.id.localeCompare(b.id);
            });
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
            renderModelList(state.models);
            const savedId = state.selectedModel?.provider === state.provider ? state.selectedModel.id : loadSettings();
            const model = state.models.find(m => m.id === savedId) || state.models.find(m => m.id === provider.defaultModel) || state.models[0];
            if (model) selectModel(model);
            setProviderStatus(state.provider, getApiKey() ? 'connected' : 'untested');
        } catch (error) {
            console.error('Error:', error);
            setProviderStatus(state.provider, getApiKey() ? 'error' : 'untested');
            state.modelCategories.roleplay = new Set();
            state.modelCategories.coding = new Set();
            state.models = buildFallbackModels(state.provider);
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
        if (models.length === 0) { el.modelList.innerHTML = '<div class="loading-models">No models found</div>'; return; }
        const filteredModels = state.modelFilter === 'all' ? models : models.filter(m => getModelTraits(m)[state.modelFilter]);
        if (filteredModels.length === 0) { el.modelList.innerHTML = '<div class="loading-models">No models match this filter</div>'; return; }
        const renderItems = (items) => items.map(m => {
            const ctx = formatContextSize(m.context_length || 0);
            const inP = formatPrice(m.pricing?.prompt || 0), outP = formatPrice(m.pricing?.completion || 0);
            const traits = getModelTraits(m);
            const badges = [
                traits.free ? '<span class="model-badge free">Free</span>' : (state.provider === 'openrouter' ? '<span class="model-badge paid">Paid</span>' : ''),
                traits.vision ? '<span class="model-badge vision">Vision</span>' : '',
                traits.reasoning ? '<span class="model-badge reasoning">Reasoning</span>' : '',
                traits.coding ? '<span class="model-badge coding">Coding</span>' : '',
                traits.roleplay ? '<span class="model-badge roleplay">Roleplay</span>' : ''
            ].join('');
            return `<div class="model-item ${state.selectedModel?.id === m.id ? 'selected' : ''}" data-model-id="${m.id}">
                <div class="model-item-header"><div class="model-item-name"><span>${m.name || m.id}</span>${badges}</div><span class="model-item-context">${ctx} ctx</span></div>
                <div class="model-item-meta">${getProvider().label} &middot; In: ${inP}/M &middot; Out: ${outP}/M</div></div>`;
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
        el.modelList.querySelectorAll('.model-item').forEach(item => item.addEventListener('click', () => {
            const model = state.models.find(m => m.id === item.dataset.modelId);
            if (model) { selectModel(model); closeModelDropdown(); }
        }));
    }

    function selectModel(model) {
        state.selectedModel = model;
        state.providerSettings[state.provider] = {
            ...(state.providerSettings[state.provider] || {}),
            selectedModelId: model.id,
            settings: { ...state.settings }
        };
        el.selectedProviderName.textContent = getProvider().label;
        el.selectedModelName.textContent = (model.name || model.id).replace(/^[^:]+:\s*/, '');
        el.visionBadge.style.display = isVisionModel(model.id) ? 'inline-block' : 'none';
        el.modelList.querySelectorAll('.model-item').forEach(item => item.classList.toggle('selected', item.dataset.modelId === model.id));
        if (model.context_length) el.contextMax.textContent = formatContextSize(model.context_length);
        updateStats();
        saveSettings();
    }

    function filterModels(query) { renderModelList(state.models.filter(m => m.id.toLowerCase().includes(query.toLowerCase()) || (m.name && m.name.toLowerCase().includes(query.toLowerCase())))); }
    function setModelFilter(filter) {
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
        el.providerSelect.value = state.provider;
        el.apiKeyInput.value = state.apiKeys[state.provider] || '';
        el.modelFilterRow.querySelectorAll('.model-filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === state.modelFilter));
        updateProviderStatusUI();
        updateWebSearchUI();
    }

    function updateWebSearchUI() {
        const provider = getProvider();
        el.webSearchToggle.classList.toggle('active', state.webSearchEnabled);
        el.webSearchStatus.textContent = state.webSearchEnabled ? 'On' : 'Off';
        el.webSearchToggle.title = provider.supportsWebSearch
            ? `${provider.label} web search is ${state.webSearchEnabled ? 'on' : 'off'}`
            : `${provider.label} direct API does not expose web search`;
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
            settings: { ...state.settings }
        };
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
            const response = await fetch(`${getProvider().apiBase}/models`, { headers: getAuthHeaders(false) });
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
    function buildRequestBody(apiMessages) {
        const provider = getProvider();
        const requestBody = {
            model: state.selectedModel.id,
            messages: apiMessages,
            temperature: state.settings.temperature,
            max_tokens: state.settings.maxTokens,
            top_p: state.settings.topP,
            stream: true,
            stream_options: { include_usage: true }
        };
        if (state.settings.topK > 0 && state.provider !== 'deepseek') requestBody.top_k = state.settings.topK;
        if (state.settings.frequencyPenalty > 0) requestBody.frequency_penalty = state.settings.frequencyPenalty;
        if (state.settings.presencePenalty > 0) requestBody.presence_penalty = state.settings.presencePenalty;

        if (state.webSearchEnabled && provider.searchMode === 'openrouter-tool') {
            requestBody.tools = [{ type: 'openrouter:web_search', parameters: { max_results: 5, search_context_size: 'medium' } }];
        }
        if (state.webSearchEnabled && provider.searchMode === 'venice-parameters') {
            requestBody.venice_parameters = {
                enable_web_search: 'on',
                enable_web_citations: true
            };
        }

        return requestBody;
    }

    async function parseApiError(response) {
        try {
            const err = await response.json();
            return err.error?.message || err.message || 'API request failed';
        } catch (e) {
            return await response.text() || 'API request failed';
        }
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

    function messageToApiMessage(msg) {
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
        const pinnedMessage = buildPinnedContextMessage(pinnedNotes);
        if (pinnedMessage) apiMessages.push(pinnedMessage);
        for (const msg of messages) apiMessages.push(messageToApiMessage(msg));
        return apiMessages;
    }
