// Event Listeners
    // ============================================
    function initEventListeners() {
        el.sidebarToggle.addEventListener('click', toggleSidebar);
        el.sidebarClose.addEventListener('click', toggleSidebar);
        el.sidebarOverlay.addEventListener('click', closeSidebar);
        el.newChatBtn.addEventListener('click', () => { createNewChat(); closeSidebar(); });
        el.chatSearch.addEventListener('input', (e) => renderChatList(e.target.value));

        el.modelSelectorBtn.addEventListener('click', toggleModelDropdown);
        el.modelSearch.addEventListener('input', (e) => filterModels(e.target.value));
        el.modelFilterRow.addEventListener('click', (e) => {
            const chip = e.target.closest('.model-filter-chip');
            if (chip) setModelFilter(chip.dataset.filter);
        });
        
        document.addEventListener('click', (e) => {
            if (!el.modelSelectorBtn.contains(e.target) && !el.modelDropdown.contains(e.target)) closeModelDropdown();
            if (!el.settingsBtn.contains(e.target) && !el.settingsPanel.contains(e.target)) closeSettings();
        });

        el.settingsBtn.addEventListener('click', toggleSettings);
        el.providerSelect.addEventListener('change', (e) => changeProvider(e.target.value));
        el.apiKeyInput.addEventListener('input', (e) => {
            state.apiKeys[state.provider] = e.target.value.trim();
            setProviderStatus(state.provider, e.target.value.trim() ? 'untested' : 'missing');
            saveSettings();
            updateSendButton();
        });
        el.apiKeyInput.addEventListener('change', () => fetchModels());
        el.testProviderBtn.addEventListener('click', testProviderConnection);
        el.clearLocalKeysBtn.addEventListener('click', clearLocalKeys);
        el.exportSettingsBtn.addEventListener('click', exportEncryptedSettings);
        el.importSettingsBtn.addEventListener('click', () => el.settingsImportInput.click());
        el.settingsImportInput.addEventListener('change', async (e) => {
            await importEncryptedSettings(e.target.files?.[0]);
            e.target.value = '';
        });
        el.webSearchToggle.addEventListener('click', toggleWebSearch);
        el.tempSlider.addEventListener('input', (e) => { state.settings.temperature = parseFloat(e.target.value); el.tempValue.textContent = state.settings.temperature.toFixed(1); saveSettings(); });
        el.maxTokensSlider.addEventListener('input', (e) => { state.settings.maxTokens = parseInt(e.target.value); el.maxTokensValue.textContent = state.settings.maxTokens.toLocaleString(); saveSettings(); });
        el.topPSlider.addEventListener('input', (e) => { state.settings.topP = parseFloat(e.target.value); el.topPValue.textContent = state.settings.topP.toFixed(2); saveSettings(); });
        el.topKSlider.addEventListener('input', (e) => { state.settings.topK = parseInt(e.target.value); el.topKValue.textContent = state.settings.topK; saveSettings(); });
        el.freqPenaltySlider.addEventListener('input', (e) => { state.settings.frequencyPenalty = parseFloat(e.target.value); el.freqPenaltyValue.textContent = state.settings.frequencyPenalty.toFixed(1); saveSettings(); });
        el.presPenaltySlider.addEventListener('input', (e) => { state.settings.presencePenalty = parseFloat(e.target.value); el.presPenaltyValue.textContent = state.settings.presencePenalty.toFixed(1); saveSettings(); });
        el.resetSettingsBtn.addEventListener('click', resetSettings);

        el.systemPromptHeader.addEventListener('click', toggleSystemPrompt);
        el.systemPrompt.addEventListener('input', updateSystemPromptStats);
        el.systemPromptSave.addEventListener('click', saveSystemPrompt);
        el.systemPromptClear.addEventListener('click', clearSystemPrompt);
        el.systemPromptPresets.addEventListener('click', (e) => {
            const preset = e.target.closest('.system-prompt-preset');
            if (preset) applySystemPromptPreset(preset.dataset.preset);
        });
        el.pinnedContextHeader.addEventListener('click', togglePinnedContext);
        el.pinnedContext.addEventListener('input', updatePinnedContextUI);
        el.pinnedContextSave.addEventListener('click', savePinnedContext);
        el.pinnedContextClear.addEventListener('click', clearPinnedContext);

        el.emptyState.addEventListener('click', (e) => {
            const card = e.target.closest('.quick-start-card');
            if (!card) return;
            el.messageInput.value = card.dataset.prompt || '';
            autoResizeTextarea(el.messageInput);
            updateStats();
            updateSendButton();
            el.messageInput.focus();
        });

        el.messageInput.addEventListener('input', () => { autoResizeTextarea(el.messageInput); updateStats(); updateSendButton(); });
        el.messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        el.sendBtn.addEventListener('click', sendMessage);
        el.stopBtn.addEventListener('click', stopGeneration);

        // Ctrl+V paste image support
        document.addEventListener('paste', async (e) => {
            const items = Array.from(e.clipboardData?.items || []);
            const imageItems = items.filter(item => item.type.startsWith('image/'));
            
            if (imageItems.length > 0) {
                e.preventDefault();
                for (const item of imageItems) {
                    const file = item.getAsFile();
                    if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                            showToast('Image too large (max 10MB)', 'error');
                            continue;
                        }
                        try {
                            const attachment = await processFile(file);
                            state.attachments.push(attachment);
                            showToast('Image pasted!', 'success');
                        } catch (err) {
                            showToast('Failed to process pasted image', 'error');
                        }
                    }
                }
                renderAttachmentsPreview();
                updateSendButton();
            }
        });

        el.fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is too large (max 10MB)`, 'error'); continue; }
                try {
                    const attachment = await processFile(file);
                    state.attachments.push(attachment);
                } catch (err) { showToast(`Failed to process ${file.name}`, 'error'); }
            }
            renderAttachmentsPreview();
            e.target.value = '';
        });

        el.messagesContainer.addEventListener('scroll', checkScrollPosition);
        el.scrollToBottom.addEventListener('click', scrollToBottom);
        el.jumpLatestUser.addEventListener('click', () => jumpToLatestMessage('user'));
        el.jumpLatestAssistant.addEventListener('click', () => jumpToLatestMessage('assistant'));
        el.jumpStreaming.addEventListener('click', jumpToStreamingMessage);

        el.renameCancelBtn.addEventListener('click', closeRenameModal);
        el.renameConfirmBtn.addEventListener('click', confirmRename);
        el.renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') closeRenameModal(); });
        el.renameModal.addEventListener('click', (e) => { if (e.target === el.renameModal) closeRenameModal(); });

        // Export panel
        el.exportBtn.addEventListener('click', toggleExportPanel);
        document.addEventListener('click', (e) => {
            if (!el.exportBtn.contains(e.target) && !el.exportPanel.contains(e.target)) closeExportPanel();
        });

        // Shortcuts modal
        el.shortcutsBtn.addEventListener('click', openShortcutsModal);
        el.shortcutsModal.addEventListener('click', (e) => { if (e.target === el.shortcutsModal) closeShortcutsModal(); });

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrl = isMac ? e.metaKey : e.ctrlKey;
            
            // Escape - stop generation or close modals
            if (e.key === 'Escape') {
                if (state.isStreaming) { stopGeneration(); e.preventDefault(); }
                else if (el.shortcutsModal.classList.contains('open')) { closeShortcutsModal(); e.preventDefault(); }
                else if (el.renameModal.classList.contains('open')) { closeRenameModal(); e.preventDefault(); }
            }
            
            // Ctrl+Shift+O - New ritual
            if (ctrl && e.shiftKey && e.key === 'O') { e.preventDefault(); createNewChat(); }

            // Ctrl+Shift+P - Toggle pinned context
            if (ctrl && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePinnedContext(); }
            
            // Ctrl+B - Toggle sidebar
            if (ctrl && e.key === 'b' && !e.shiftKey) { e.preventDefault(); toggleSidebar(); }
            
            // Ctrl+/ - Focus input
            if (ctrl && e.key === '/') { e.preventDefault(); el.messageInput.focus(); }
            
            // Ctrl+? or Ctrl+Shift+/ - Show shortcuts
            if (ctrl && (e.key === '?' || (e.shiftKey && e.key === '/'))) { e.preventDefault(); openShortcutsModal(); }
            
            // Ctrl+Shift+E - Export as Markdown
            if (ctrl && e.shiftKey && e.key === 'E') { e.preventDefault(); exportAsMarkdown(); }
            
            // Ctrl+Shift+J - Export as JSON
            if (ctrl && e.shiftKey && e.key === 'J') { e.preventDefault(); exportAsJSON(); }

            // Alt navigation - latest prompt, latest answer, current stream
            if (e.altKey && !ctrl && !e.shiftKey && e.key.toLowerCase() === 'u') { e.preventDefault(); jumpToLatestMessage('user'); }
            if (e.altKey && !ctrl && !e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); jumpToLatestMessage('assistant'); }
            if (e.altKey && !ctrl && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); jumpToStreamingMessage(); }
        });

        // Restore slider values from state
        restoreSettingsUI();
    }

    function restoreSettingsUI() {
        updateProviderUI();
        el.tempSlider.value = state.settings.temperature;
        el.tempValue.textContent = state.settings.temperature.toFixed(1);
        el.maxTokensSlider.value = state.settings.maxTokens;
        el.maxTokensValue.textContent = state.settings.maxTokens.toLocaleString();
        el.topPSlider.value = state.settings.topP;
        el.topPValue.textContent = state.settings.topP.toFixed(2);
        el.topKSlider.value = state.settings.topK;
        el.topKValue.textContent = state.settings.topK;
        el.freqPenaltySlider.value = state.settings.frequencyPenalty;
        el.freqPenaltyValue.textContent = state.settings.frequencyPenalty.toFixed(1);
        el.presPenaltySlider.value = state.settings.presencePenalty;
        el.presPenaltyValue.textContent = state.settings.presencePenalty.toFixed(1);
    }

    function resetSettings() {
        state.settings = { temperature: 0.7, maxTokens: 8192, topP: 1.0, topK: 0, frequencyPenalty: 0, presencePenalty: 0 };
        restoreSettingsUI();
        saveSettings();
        showToast('Settings reset to defaults', 'success');
    }

    // ============================================
