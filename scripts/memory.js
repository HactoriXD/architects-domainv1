// Persistent Memory
    // ============================================
    const MEMORY_CATEGORIES = {
        identity: 'Identity',
        preference: 'Preferences',
        relationship: 'Relationships',
        project: 'Projects',
        goal: 'Long-term goals'
    };

    const MEMORY_CATEGORY_ALIASES = {
        preferences: 'preference',
        relationships: 'relationship',
        projects: 'project',
        goals: 'goal'
    };

    const MEMORY_GENERIC_TERMS = new Set([
        'good', 'nice', 'cool', 'ok', 'okay', 'yes', 'no', 'fine', 'great', 'awesome', 'bad',
        'thing', 'things', 'stuff', 'something', 'anything', 'it', 'this', 'that', 'them'
    ]);

    const MEMORY_SPECIFIC_OBJECTS = /\b(pizza|league|league of legends|minecraft|github|javascript|typescript|python|react|vue|svelte|node|cats?|dogs?|wife|husband|partner|girlfriend|boyfriend|friend|mother|father|sister|brother|son|daughter|project|app|game|website|business|startup|school|college|university|job|career|music|guitar|piano|drawing|writing|fitness|gym|language|english|romanian|bucharest|romania)\b/i;

    function normalizeMemoryCategory(category) {
        const normalized = MEMORY_CATEGORY_ALIASES[category] || category;
        return MEMORY_CATEGORIES[normalized] ? normalized : null;
    }

    function memoryExists(content) {
        const normalized = String(content || '').trim().toLowerCase();
        return state.memories.some(memory => memory.content.trim().toLowerCase() === normalized && memory.workspaceId === state.activeWorkspaceId)
            || state.memorySuggestions.some(suggestion => suggestion.content.trim().toLowerCase() === normalized && suggestion.workspaceId === state.activeWorkspaceId);
    }

    function extractMemorySuggestionsFromText(text, sourceMessage) {
        const source = String(text || '').trim();
        if (!source || source.length > 600) return [];
        const rules = [
            { pattern: /\bmy name is\s+([A-Z][\w'-]{1,40}(?:\s+[A-Z][\w'-]{1,40})?)/i, category: 'identity', build: m => `User's name is ${m[1].trim()}.`, confidence: 0.94 },
            { pattern: /\bi(?:'m| am)\s+([a-z][\w\s'-]{2,80})/i, category: 'identity', build: m => `User identifies as ${cleanMemoryFragment(m[1])}.`, confidence: 0.72 },
            { pattern: /\bi (?:like|love|enjoy|prefer)\s+([^.!?\n]{2,100})/i, category: 'preference', build: m => `User likes ${cleanMemoryFragment(m[1])}.`, confidence: 0.78 },
            { pattern: /\bi (?:play|play a lot of|am playing)\s+([^.!?\n]{2,100})/i, category: 'preference', build: m => `User plays ${cleanMemoryFragment(m[1])}.`, confidence: 0.78 },
            { pattern: /\bi (?:hate|dislike|don't like|do not like)\s+([^.!?\n]{2,100})/i, category: 'preference', build: m => `User dislikes ${cleanMemoryFragment(m[1])}.`, confidence: 0.78 },
            { pattern: /\bi have\s+([^.!?\n]{2,100})/i, category: 'relationship', build: m => classifyHaveMemory(m[1]), confidence: 0.7 },
            { pattern: /\bmy (?:wife|husband|partner|girlfriend|boyfriend|friend|mother|father|sister|brother|cat|dog)\s+is\s+([^.!?\n]{2,100})/i, category: 'relationship', build: m => `User relationship note: ${cleanMemoryFragment(m[0])}.`, confidence: 0.76 },
            { pattern: /\bi(?:'m| am) working on\s+([^.!?\n]{2,120})/i, category: 'project', build: m => `User is working on ${cleanMemoryFragment(m[1])}.`, confidence: 0.82 },
            { pattern: /\bmy project is\s+([^.!?\n]{2,120})/i, category: 'project', build: m => `User project: ${cleanMemoryFragment(m[1])}.`, confidence: 0.82 },
            { pattern: /\bi want to\s+([^.!?\n]{2,120})/i, category: 'goal', build: m => `User wants to ${cleanMemoryFragment(m[1])}.`, confidence: 0.68 },
            { pattern: /\bmy goal is to\s+([^.!?\n]{2,120})/i, category: 'goal', build: m => `User goal: ${cleanMemoryFragment(m[1])}.`, confidence: 0.84 }
        ];

        const suggestions = [];
        for (const rule of rules) {
            const match = source.match(rule.pattern);
            if (!match) continue;
            const content = rule.build(match);
            const evaluation = evaluateMemoryCandidate(content, rule.category);
            if (!evaluation.allowed || memoryExists(evaluation.content)) continue;
            suggestions.push({
                id: generateId(),
                content: evaluation.content,
                category: evaluation.category,
                confidence: Math.max(rule.confidence, evaluation.score),
                sourceChat: state.currentChatId,
                sourceMessage,
                workspaceId: state.activeWorkspaceId,
                createdAt: Date.now()
            });
        }
        return suggestions;
    }

    function evaluateMemoryCandidate(text, category) {
        const normalizedCategory = normalizeMemoryCategory(category);
        if (!normalizedCategory) return { allowed: false, score: 0, reason: 'invalid_category' };

        const content = normalizeMemoryPhrase(text);
        const lowered = content.toLowerCase().replace(/[.!?]+$/g, '').trim();
        if (content.length < 8) return { allowed: false, score: 0, reason: 'too_short' };
        if (/^(hi|hello|hey|ok|okay|yes|no|thanks|thank you|cool|nice|good)\b[.!?]*$/i.test(content)) {
            return { allowed: false, score: 0, reason: 'filler' };
        }
        if (/^user (?:is|likes|plays|has|wants)\s+(?:good|nice|cool|ok|okay|yes|fine|great|awesome|bad|stuff|things?|something|anything|it|this|that)\.?$/i.test(content)) {
            return { allowed: false, score: 0, reason: 'generic' };
        }
        if (/^user likes\s+(?:stuff|things?|something|anything|it|this|that)\.?$/i.test(content)) {
            return { allowed: false, score: 0, reason: 'vague_preference' };
        }
        if (/^user is\s+(?:a\s+)?(?:user|person|human|good|nice|cool|ok|okay|fine|great|awesome|bad)\.?$/i.test(content)) {
            return { allowed: false, score: 0, reason: 'vague_identity' };
        }
        if (/^user identifies as\s+(?:working on|playing|trying|using|feeling|tired|hungry|bored|sad|happy|sick|busy|here|online|good|nice|cool|ok|okay|fine|great|awesome|bad)\b/i.test(content)) {
            return { allowed: false, score: 0, reason: 'transient_identity' };
        }

        const fragment = lowered
            .replace(/^user(?:'s name)? (?:is|likes|dislikes|plays|has|wants to|is working on|identifies as|project:|goal:|relationship note:)\s+/i, '')
            .replace(/^user's name is\s+/i, '')
            .trim();
        if (!hasPersistentMeaning(content, fragment)) return { allowed: false, score: 0, reason: 'no_persistent_meaning' };

        let score = 0;
        if (/\b(User's name is|User identifies as|User is \d{1,3}\b|User lives in|User is from)\b/i.test(content)) score += 0.4;
        if (/\bUser (?:likes|dislikes|plays|enjoys|prefers)\b/i.test(content) && hasSpecificObject(fragment)) score += 0.3;
        if (/\b(User is working on|User project:|User goal:|User wants to|User has|User relationship note:)\b/i.test(content)) score += 0.3;
        if (hasSpecificObject(fragment)) score += 0.3;

        score = Math.min(1, score);
        return score >= 0.6
            ? { allowed: true, score, category: normalizedCategory, content }
            : { allowed: false, score, reason: 'low_score' };
    }

    function normalizeMemoryPhrase(text) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim();
        const withoutPeriod = raw.replace(/[.!?]+$/g, '').trim();
        const nameMatch = withoutPeriod.match(/^my name is\s+(.+)$/i);
        if (nameMatch) return `User's name is ${cleanMemoryFragment(nameMatch[1])}.`;
        const playMatch = withoutPeriod.match(/^(?:i\s+)?play\s+league$/i);
        if (playMatch) return 'User plays League of Legends.';
        const normalized = withoutPeriod
            .replace(/\bleague\b/ig, 'League of Legends')
            .replace(/\blol\b/ig, 'League of Legends');
        return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.` : '';
    }

    function hasSpecificObject(contentFragment, fragment = contentFragment) {
        const value = String(fragment || '').toLowerCase().replace(/[.!?]+$/g, '').trim();
        if (!value || MEMORY_GENERIC_TERMS.has(value)) return false;
        if (MEMORY_SPECIFIC_OBJECTS.test(value)) return true;
        if (/[A-Z][a-z]+/.test(String(contentFragment || ''))) return true;
        const words = value.split(/\s+/).filter(word => word && !MEMORY_GENERIC_TERMS.has(word));
        return words.length >= 1 && value.length >= 4;
    }

    function hasPersistentMeaning(content, fragment) {
        if (hasSpecificObject(content, fragment)) return true;
        return /\b(User's name is|User identifies as|User has|User is working on|User wants to|User project:|User goal:)\b/i.test(content);
    }

    function cleanMemoryFragment(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .replace(/^(a|an|the)\s+/i, '')
            .replace(/[,;:]+$/g, '')
            .trim();
    }

    function classifyHaveMemory(fragment) {
        const cleaned = cleanMemoryFragment(fragment);
        if (!cleaned) return null;
        if (/\b(cat|cats|dog|dogs|wife|husband|partner|girlfriend|boyfriend|friend|kid|kids|child|children|son|daughter)\b/i.test(cleaned)) {
            return `User has ${cleaned}.`;
        }
        return `User has ${cleaned}.`;
    }

    function queueMemorySuggestionsForMessage(message, messageIndex) {
        if (!message || message.role !== 'user') return;
        const suggestions = extractMemorySuggestionsFromText(message.content, messageIndex);
        if (!suggestions.length) return;
        state.memorySuggestions.push(...suggestions);
        renderMemorySuggestions();
        updateContextInspector();
    }

    function acceptMemorySuggestion(id) {
        const suggestion = state.memorySuggestions.find(item => item.id === id);
        if (!suggestion) return;
        const input = document.querySelector(`[data-memory-suggestion="${id}"] .memory-suggestion-edit`);
        const content = (input?.value || suggestion.content).trim();
        if (!content) return;
        const now = Date.now();
        const category = normalizeMemoryCategory(suggestion.category);
        if (!category) return;
        state.memories.push({
            id: generateId(),
            content,
            category,
            confidence: suggestion.confidence,
            createdAt: now,
            updatedAt: now,
            sourceChat: suggestion.sourceChat,
            sourceMessage: suggestion.sourceMessage,
            workspaceId: suggestion.workspaceId || state.activeWorkspaceId,
            pinned: false,
            enabled: true
        });
        syncWorkspaceForMemory(state.memories[state.memories.length - 1]);
        state.memorySuggestions = state.memorySuggestions.filter(item => item.id !== id);
        saveMemories();
        renderMemorySuggestions();
        renderMemoryManager();
        updateContextInspector();
        showToast('Memory saved', 'success');
    }

    function rejectMemorySuggestion(id) {
        state.memorySuggestions = state.memorySuggestions.filter(item => item.id !== id);
        renderMemorySuggestions();
    }

    function renderMemorySuggestions() {
        if (!el.memorySuggestions || !el.memorySuggestionsList) return;
        const suggestions = state.memorySuggestions.filter(suggestion => !suggestion.workspaceId || suggestion.workspaceId === state.activeWorkspaceId);
        el.memorySuggestions.hidden = suggestions.length === 0;
        el.memorySuggestionsList.innerHTML = suggestions.map(suggestion => `
            <div class="memory-suggestion-card" data-memory-suggestion="${suggestion.id}">
                <div class="memory-card-meta">
                    <span class="memory-category">${MEMORY_CATEGORIES[suggestion.category] || 'Memory'}</span>
                    <span class="memory-confidence">${Math.round(suggestion.confidence * 100)}%</span>
                </div>
                <textarea class="memory-suggestion-edit">${escapeHtml(suggestion.content)}</textarea>
                <div class="memory-card-actions">
                    <button class="btn" type="button" data-memory-action="reject" data-memory-id="${suggestion.id}">Reject</button>
                    <button class="btn btn-primary" type="button" data-memory-action="accept" data-memory-id="${suggestion.id}">Save Memory</button>
                </div>
            </div>
        `).join('');
    }

    function renderMemoryManager() {
        if (!el.memoryList) return;
        const query = (state.memorySearch || '').toLowerCase();
        const category = state.memoryFilter || 'all';
        const memories = getEnabledAndDisabledMemories().filter(memory => {
            if (memory.workspaceId !== state.activeWorkspaceId) return false;
            const matchesCategory = category === 'all' || memory.category === category;
            const matchesQuery = !query || memory.content.toLowerCase().includes(query);
            return matchesCategory && matchesQuery;
        });

        el.memoryEmpty.style.display = memories.length ? 'none' : 'block';
        el.memoryList.innerHTML = memories.map(memory => `
            <div class="memory-item ${memory.enabled ? '' : 'disabled'}" data-memory-id="${memory.id}">
                <div class="memory-item-header">
                    <span class="memory-category">${MEMORY_CATEGORIES[memory.category] || 'Memory'}</span>
                    <span class="memory-confidence">${Math.round(memory.confidence * 100)}%</span>
                </div>
                <textarea class="memory-edit">${escapeHtml(memory.content)}</textarea>
                <div class="memory-card-actions">
                    <button class="btn" type="button" data-memory-action="toggle-enabled">${memory.enabled ? 'Disable' : 'Enable'}</button>
                    <button class="btn" type="button" data-memory-action="toggle-pinned">${memory.pinned ? 'Unpin' : 'Pin'}</button>
                    <button class="btn" type="button" data-memory-action="save">Save</button>
                    <button class="btn danger" type="button" data-memory-action="delete">Delete</button>
                </div>
            </div>
        `).join('');
    }

    function getEnabledAndDisabledMemories() {
        return getWorkspaceMemories().sort((a, b) => {
            if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
    }

    function handleMemoryManagerAction(event) {
        const button = event.target.closest('[data-memory-action]');
        if (!button) return;
        const item = button.closest('[data-memory-id]');
        const memory = state.memories.find(entry => entry.id === item?.dataset.memoryId);
        if (!memory) return;
        const action = button.dataset.memoryAction;
        if (action === 'toggle-enabled') memory.enabled = !memory.enabled;
        if (action === 'toggle-pinned') memory.pinned = !memory.pinned;
        if (action === 'save') {
            const content = item.querySelector('.memory-edit')?.value.trim();
            if (content) memory.content = content;
        }
        if (action === 'delete') {
            removeWorkspaceRelation(memory.workspaceId, 'memoryIds', memory.id);
            state.memories = state.memories.filter(entry => entry.id !== memory.id);
        }
        memory.updatedAt = Date.now();
        saveMemories();
        renderMemoryManager();
        updateContextInspector();
    }

    function toggleContextInspector() {
        el.contextInspectorPanel.classList.toggle('open');
        updateContextInspector();
    }

    function updateContextInspector() {
        if (!el.contextSourcesList) return;
        const sources = [];
        const workspace = getActiveWorkspace();
        const systemPrompt = String(state.savedSystemPrompt || workspace?.systemPrompt || '').trim();
        const workspaceNotes = String(workspace?.workspaceNotes || '').trim();
        const pinnedNotes = String(state.pinnedNotes || '').trim();
        if (systemPrompt) sources.push({ type: 'System', label: 'System prompt', detail: `${systemPrompt.length} chars`, active: true });
        if (workspaceNotes) sources.push({ type: 'Workspace', label: 'Workspace notes', detail: `${workspaceNotes.length} chars`, active: true });
        for (const memory of getEnabledMemoriesForContext()) {
            sources.push({ type: 'Memory', label: memory.content, detail: MEMORY_CATEGORIES[memory.category] || 'Memory', active: true });
        }
        for (const memory of (state.mcpMemoryContext || [])) {
            sources.push({ type: 'Memory MCP', label: memory.content, detail: `${memory.importance || 'memory'}${memory.relevance ? ` · ${memory.relevance}` : ''}`, active: true });
        }
        for (const entry of getEnabledLorebooksForContext()) {
            sources.push({ type: 'Lore', label: entry.title, detail: entry.pinned ? 'Pinned lorebook' : 'Lorebook', active: true });
        }
        for (const file of getEnabledImportedFilesForContext()) {
            sources.push({ type: 'File', label: file.name, detail: formatFileSize(file.size), active: true });
        }
        for (const server of getWorkspaceMcpServers().filter(server => typeof isMcpServerActiveInCurrentChat === 'function' ? isMcpServerActiveInCurrentChat(server) : server.enabled)) {
            const tools = (server.capabilities || []).filter(capability => capability.kind === 'tool' && (typeof isMcpToolEnabledForChat !== 'function' || isMcpToolEnabledForChat(server, capability)));
            sources.push({
                type: 'MCP',
                label: server.name,
                detail: tools.length ? `${tools.length} tools · ${server.status}` : server.status,
                active: ['connected', 'degraded'].includes(server.status)
            });
        }
        for (const execution of (state.mcpExecutions || []).slice(0, 5)) {
            sources.push({
                type: 'Tool',
                label: execution.toolName,
                detail: `${execution.status}${execution.elapsedMs ? ` · ${execution.elapsedMs}ms` : ''}`,
                active: execution.status === 'success'
            });
        }
        if (pinnedNotes) sources.push({ type: 'Pinned', label: 'Pinned chat context', detail: `${pinnedNotes.length} chars`, active: true });
        el.contextSourcesSummary.textContent = `${sources.filter(source => source.active).length} active`;
        el.contextSourcesList.innerHTML = sources.length ? sources.map(source => `
            <div class="context-source ${source.active ? '' : 'inactive'}">
                <span class="context-source-type">${source.type}</span>
                <div>
                    <div class="context-source-label">${escapeHtml(source.label)}</div>
                    <div class="context-source-detail">${escapeHtml(source.detail)}</div>
                </div>
            </div>
        `).join('') : '<div class="context-source-empty">No extra context sources active.</div>';
    }

    function initMemory() {
        el.memorySuggestionsList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-memory-action]');
            if (!button) return;
            if (button.dataset.memoryAction === 'accept') acceptMemorySuggestion(button.dataset.memoryId);
            if (button.dataset.memoryAction === 'reject') rejectMemorySuggestion(button.dataset.memoryId);
        });
        el.memoryManagerBtn.addEventListener('click', () => {
            el.memoryModal.classList.add('open');
            renderMemoryManager();
        });
        el.memoryCloseBtn.addEventListener('click', () => el.memoryModal.classList.remove('open'));
        el.memoryModal.addEventListener('click', (event) => {
            if (event.target === el.memoryModal) el.memoryModal.classList.remove('open');
        });
        el.memorySearch.addEventListener('input', (event) => {
            state.memorySearch = event.target.value;
            renderMemoryManager();
        });
        el.memoryCategoryFilter.addEventListener('change', (event) => {
            state.memoryFilter = event.target.value;
            renderMemoryManager();
        });
        el.memoryList.addEventListener('click', handleMemoryManagerAction);
        el.contextInspectorBtn.addEventListener('click', toggleContextInspector);
        document.addEventListener('click', (event) => {
            if (!el.contextInspectorBtn.contains(event.target) && !el.contextInspectorPanel.contains(event.target)) {
                el.contextInspectorPanel.classList.remove('open');
            }
        });
        renderMemorySuggestions();
        renderMemoryManager();
        updateContextInspector();
    }
