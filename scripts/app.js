// PWA Install Prompt
    // ============================================
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // Could show install button here if desired
    });

    // Register service worker for offline support (if served from HTTPS)
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
        // Service worker would need to be a separate file in production
        // For now, the app works offline via localStorage
    }

    // ============================================

// Initialize
    // ============================================
    async function init() {
        loadChats();
        loadMemories();
        initMcpRegistry();
        loadMcpServers();
        loadSettings();
        loadWorkspaces();
        initEventListeners();
        initLightbox();
        initWorkspacesUi();
        initMemory();
        initMcpUi();
        initDataManager();
        applyWorkspaceState(getActiveWorkspace());
        await fetchModels();
        
        const workspaceChats = getWorkspaceChats();
        if (workspaceChats.length > 0) {
            const mostRecent = workspaceChats.sort((a,b) => b.updatedAt - a.updatedAt)[0];
            loadChat(mostRecent.id);
        } else {
            createNewChat();
        }
        
        updateSystemPromptStats();
        updatePinnedContextUI();
        updateStats();
        updateConversationNavState();
        updateContextInspector();
        el.messageInput.focus();
        
        // Show welcome toast on first visit
        if (!localStorage.getItem('architects_domain_welcomed')) {
            setTimeout(() => {
                showToast('Press Ctrl+? to see keyboard shortcuts', 'info');
                localStorage.setItem('architects_domain_welcomed', 'true');
            }, 2000);
        }
    }

    init();
