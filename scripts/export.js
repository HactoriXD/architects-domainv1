// Export Functions
    // ============================================
    function toggleExportPanel() { el.exportPanel.classList.toggle('open'); }
    function closeExportPanel() { el.exportPanel.classList.remove('open'); }

    function getExportFilename(ext) {
        const chat = state.chats[state.currentChatId];
        const title = chat?.title || 'chat';
        const safe = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const date = new Date().toISOString().split('T')[0];
        return `${safe}_${date}.${ext}`;
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Exported as ${filename}`, 'success');
        closeExportPanel();
    }

    window.exportAsMarkdown = function() {
        if (state.messages.length === 0) { showToast('No messages to export', 'error'); return; }
        const chat = state.chats[state.currentChatId];
        let md = `# ${chat?.title || 'Chat Export'}\n\n`;
        md += `*Exported on ${new Date().toLocaleString()}*\n\n`;
        if (state.savedSystemPrompt) md += `## System Prompt\n\n${state.savedSystemPrompt}\n\n`;
        if (state.pinnedNotes) md += `## Pinned Context\n\n${state.pinnedNotes}\n\n`;
        md += `## Conversation\n\n`;
        state.messages.forEach(msg => {
            const role = msg.role === 'user' ? '**You**' : `**${CONFIG.ASSISTANT_NAME}**`;
            const time = new Date(msg.timestamp).toLocaleString();
            md += `### ${role} *(${time})*\n\n${msg.content}\n\n`;
        });
        downloadFile(md, getExportFilename('md'), 'text/markdown');
    };

    window.exportAsJSON = function() {
        if (state.messages.length === 0) { showToast('No messages to export', 'error'); return; }
        const chat = state.chats[state.currentChatId];
        const data = {
            title: chat?.title || 'Chat Export',
            exportedAt: new Date().toISOString(),
            systemPrompt: state.savedSystemPrompt || null,
            pinnedNotes: state.pinnedNotes || null,
            model: state.selectedModel?.id || null,
            messages: state.messages.map(m => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
                attachments: m.attachments?.map(a => ({ name: a.name, type: a.type, size: a.size })) || []
            }))
        };
        downloadFile(JSON.stringify(data, null, 2), getExportFilename('json'), 'application/json');
    };

    window.exportAsText = function() {
        if (state.messages.length === 0) { showToast('No messages to export', 'error'); return; }
        const chat = state.chats[state.currentChatId];
        let txt = `${chat?.title || 'Chat Export'}\n${'='.repeat(50)}\n\n`;
        txt += `Exported: ${new Date().toLocaleString()}\n\n`;
        if (state.savedSystemPrompt) txt += `System Prompt:\n${state.savedSystemPrompt}\n\n${'-'.repeat(50)}\n\n`;
        if (state.pinnedNotes) txt += `Pinned Context:\n${state.pinnedNotes}\n\n${'-'.repeat(50)}\n\n`;
        state.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : CONFIG.ASSISTANT_NAME;
            const time = new Date(msg.timestamp).toLocaleString();
            txt += `[${role}] (${time})\n${msg.content}\n\n`;
        });
        downloadFile(txt, getExportFilename('txt'), 'text/plain');
    };

    window.exportAsHTML = function() {
        if (state.messages.length === 0) { showToast('No messages to export', 'error'); return; }
        const chat = state.chats[state.currentChatId];
        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${chat?.title || 'Chat Export'}</title>
        <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#0a0a0a;color:#f5f5f5}
        h1{color:#a78bfa}.message{margin:20px 0;padding:16px;border-radius:12px;background:#161616}
        .user{border-left:4px solid #8b5cf6}.assistant{border-left:4px solid #6d28d9}
        .role{font-weight:600;margin-bottom:8px;color:#a78bfa}.time{color:#666;font-size:0.875rem}
        pre{background:#050505;padding:12px;border-radius:8px;overflow-x:auto}code{font-family:monospace}</style></head>
        <body><h1>${chat?.title || 'Chat Export'}</h1><p style="color:#666">Exported: ${new Date().toLocaleString()}</p>`;
        if (state.savedSystemPrompt) html += `<div style="background:#1a1a1a;padding:16px;border-radius:8px;margin:20px 0"><strong>System Prompt:</strong><p>${escapeHtml(state.savedSystemPrompt)}</p></div>`;
        if (state.pinnedNotes) html += `<div style="background:#102018;padding:16px;border-radius:8px;margin:20px 0"><strong>Pinned Context:</strong><p>${escapeHtml(state.pinnedNotes)}</p></div>`;
        state.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : CONFIG.ASSISTANT_NAME;
            const time = new Date(msg.timestamp).toLocaleString();
            const content = escapeHtml(msg.content).replace(/\n/g, '<br>');
            html += `<div class="message ${msg.role}"><div class="role">${role} <span class="time">${time}</span></div><div>${content}</div></div>`;
        });
        html += '</body></html>';
        downloadFile(html, getExportFilename('html'), 'text/html');
    };

    // ============================================
