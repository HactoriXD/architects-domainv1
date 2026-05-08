// Workspace UI
// ============================================
function renderWorkspaceUi() {
    renderWorkspaceSwitcher();
    renderWorkspaceManager();
    renderWorkspaceContextTools();
}

function renderWorkspaceSwitcher() {
    const workspace = getActiveWorkspace();
    if (!workspace || !el.workspaceName) return;
    el.workspaceAvatar.textContent = workspace.icon || 'AD';
    el.workspaceAvatar.style.background = `linear-gradient(135deg, ${workspace.color || '#8b5cf6'}, rgba(109, 40, 217, 0.92))`;
    el.workspaceName.textContent = workspace.name;
    el.workspaceKind.textContent = workspace.kind;
    const visible = Object.values(state.workspaces).filter(item => !item.archived || item.id === workspace.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    el.workspaceSwitcherMenu.innerHTML = visible.map(item => `
        <button class="workspace-menu-item ${item.id === workspace.id ? 'active' : ''}" type="button" data-workspace-switch="${item.id}">
            <span class="workspace-menu-avatar" style="background:${escapeHtml(item.color || '#8b5cf6')}">${escapeHtml(item.icon || 'AD')}</span>
            <span><strong>${escapeHtml(item.name)}</strong><small>${item.archived ? 'Archived' : 'Workspace'}</small></span>
        </button>
    `).join('') + '<button class="workspace-menu-manage" type="button" data-workspace-open-manager>Manage workspaces</button>';
}

function renderWorkspaceManager() {
    if (!el.workspaceList) return;
    const active = getActiveWorkspace();
    const workspaces = Object.values(state.workspaces)
        .filter(workspace => state.workspaceManagerFilterArchived || !workspace.archived)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    el.workspaceList.innerHTML = workspaces.map(workspace => `
        <div class="workspace-card ${workspace.id === state.activeWorkspaceId ? 'active' : ''} ${workspace.archived ? 'archived' : ''}" data-workspace-id="${workspace.id}">
            <div class="workspace-card-top">
                <span class="workspace-card-avatar" style="background:${escapeHtml(workspace.color || '#8b5cf6')}">${escapeHtml(workspace.icon || 'AD')}</span>
                <div>
                    <strong>${escapeHtml(workspace.name)}</strong>
                    <small>${getWorkspaceChats(workspace.id).length} chats / ${getWorkspaceMemories(workspace.id).length} memories</small>
                </div>
                <button class="workspace-card-menu-btn" type="button" aria-label="Workspace actions" data-workspace-menu>...</button>
                <div class="workspace-card-menu">
                    <button type="button" data-workspace-action="switch">Switch</button>
                    <button type="button" data-workspace-action="duplicate">Duplicate</button>
                    <button type="button" data-workspace-action="archive">${workspace.archived ? 'Unarchive' : 'Archive'}</button>
                </div>
            </div>
        </div>
    `).join('') || '<div class="workspace-empty">No workspaces visible.</div>';
    if (active) {
        el.workspaceNameInput.value = active.name;
        el.workspaceKindInput.value = active.kind;
        el.workspaceIconInput.value = active.icon;
        el.workspaceColorInput.value = active.color || '#8b5cf6';
        el.workspaceNotesInput.value = active.workspaceNotes || '';
    }
}

function renderWorkspaceContextTools() {
    const workspace = getActiveWorkspace();
    if (!workspace || !el.lorebookList) return;
    el.lorebookList.innerHTML = workspace.lorebooks.map(entry => `
        <div class="workspace-context-item ${entry.enabled ? '' : 'disabled'}" data-lorebook-id="${entry.id}">
            <div class="workspace-context-item-head">
                <input class="workspace-inline-title" value="${escapeHtml(entry.title)}" data-lorebook-field="title">
                <span>${entry.pinned ? 'Pinned' : 'Lore'}</span>
            </div>
            <textarea class="workspace-inline-content" data-lorebook-field="content">${escapeHtml(entry.content)}</textarea>
            <div class="workspace-card-actions">
                <button class="btn" type="button" data-lorebook-action="toggle">${entry.enabled ? 'Disable' : 'Enable'}</button>
                <button class="btn" type="button" data-lorebook-action="pin">${entry.pinned ? 'Unpin' : 'Pin'}</button>
                <button class="btn" type="button" data-lorebook-action="save">Save</button>
                <button class="btn danger" type="button" data-lorebook-action="delete">Delete</button>
            </div>
        </div>
    `).join('') || '<div class="workspace-empty">No lorebook entries yet.</div>';
    el.importedFileList.innerHTML = workspace.importedFiles.map(file => `
        <div class="workspace-file-item ${file.enabled ? '' : 'disabled'}" data-imported-file-id="${file.id}">
            <div><strong>${escapeHtml(file.name)}</strong><small>${formatFileSize(file.size)} / .${escapeHtml(file.extension)}</small></div>
            <div class="workspace-card-actions">
                <button class="btn" type="button" data-file-action="toggle">${file.enabled ? 'Disable' : 'Enable'}</button>
                <button class="btn" type="button" data-file-action="pin">${file.pinned ? 'Unpin' : 'Pin'}</button>
                <button class="btn danger" type="button" data-file-action="delete">Delete</button>
            </div>
        </div>
    `).join('') || '<div class="workspace-empty">No imported files yet.</div>';
}

function openWorkspaceManager() {
    el.workspaceModal.classList.add('open');
    renderWorkspaceUi();
}

function closeWorkspaceManager() {
    el.workspaceModal.classList.remove('open');
}

function updateActiveWorkspaceFromForm() {
    const workspace = getActiveWorkspace();
    if (!workspace) return;
    workspace.name = el.workspaceNameInput.value.trim() || workspace.name;
    workspace.kind = el.workspaceKindInput.value || 'workspace';
    workspace.icon = el.workspaceIconInput.value.trim().slice(0, 4) || workspace.icon;
    workspace.color = el.workspaceColorInput.value || workspace.color;
    workspace.workspaceNotes = el.workspaceNotesInput.value.trim();
    touchWorkspace(workspace.id);
    renderWorkspaceSwitcher();
    updateContextInspector();
}

function handleWorkspaceListClick(event) {
    const menuButton = event.target.closest('[data-workspace-menu]');
    if (menuButton) {
        const card = menuButton.closest('[data-workspace-id]');
        const wasOpen = card?.classList.contains('menu-open');
        el.workspaceList.querySelectorAll('.workspace-card.menu-open').forEach(item => item.classList.remove('menu-open'));
        if (card && !wasOpen) card.classList.add('menu-open');
        return;
    }
    const button = event.target.closest('[data-workspace-action]');
    const card = event.target.closest('[data-workspace-id]');
    if (!card) return;
    const id = card.dataset.workspaceId;
    if (!button) {
        el.workspaceList.querySelectorAll('.workspace-card.menu-open').forEach(item => item.classList.remove('menu-open'));
        switchWorkspace(id);
        renderWorkspaceUi();
        return;
    }
    const workspace = getWorkspaceById(id);
    if (!workspace) return;
    const action = button.dataset.workspaceAction;
    if (action === 'switch') switchWorkspace(id);
    if (action === 'duplicate') {
        const copy = duplicateWorkspace(id);
        if (copy) showToast('Workspace duplicated', 'success');
    }
    if (action === 'archive') {
        if (workspace.id === state.activeWorkspaceId && !workspace.archived) {
            showToast('Switch before archiving the active workspace', 'info');
            el.workspaceList.querySelectorAll('.workspace-card.menu-open').forEach(item => item.classList.remove('menu-open'));
            return;
        }
        workspace.archived = !workspace.archived;
        touchWorkspace(workspace.id);
    }
    renderWorkspaceUi();
}

function addLorebookEntry() {
    const workspace = getActiveWorkspace();
    if (!workspace) return;
    workspace.lorebooks.unshift(normalizeLorebookEntry({ title: 'New lore entry', content: '' }));
    touchWorkspace(workspace.id);
    renderWorkspaceContextTools();
    updateContextInspector();
}

function handleLorebookAction(event) {
    const button = event.target.closest('[data-lorebook-action]');
    if (!button) return;
    const workspace = getActiveWorkspace();
    const item = button.closest('[data-lorebook-id]');
    const entry = workspace?.lorebooks.find(record => record.id === item?.dataset.lorebookId);
    if (!entry) return;
    const action = button.dataset.lorebookAction;
    if (action === 'toggle') entry.enabled = !entry.enabled;
    if (action === 'pin') entry.pinned = !entry.pinned;
    if (action === 'save') {
        entry.title = item.querySelector('[data-lorebook-field="title"]')?.value.trim() || entry.title;
        entry.content = item.querySelector('[data-lorebook-field="content"]')?.value.trim() || entry.content;
    }
    if (action === 'delete') workspace.lorebooks = workspace.lorebooks.filter(record => record.id !== entry.id);
    entry.updatedAt = Date.now();
    touchWorkspace(workspace.id);
    renderWorkspaceContextTools();
    updateContextInspector();
}

async function importWorkspaceFiles(files) {
    const workspace = getActiveWorkspace();
    if (!workspace) return;
    for (const file of files) {
        const extension = (file.name.split('.').pop() || '').toLowerCase();
        if (!WORKSPACE_ALLOWED_EXTENSIONS.has(extension)) {
            showToast(`${file.name} is not a supported workspace text file`, 'error');
            continue;
        }
        if (file.size > WORKSPACE_FILE_LIMIT) {
            showToast(`${file.name} is too large for local workspace context`, 'error');
            continue;
        }
        const content = await file.text();
        workspace.importedFiles.unshift(normalizeImportedFile({ name: file.name, extension, size: file.size, content }));
    }
    touchWorkspace(workspace.id);
    renderWorkspaceContextTools();
    updateContextInspector();
}

function handleImportedFileAction(event) {
    const button = event.target.closest('[data-file-action]');
    if (!button) return;
    const workspace = getActiveWorkspace();
    const id = button.closest('[data-imported-file-id]')?.dataset.importedFileId;
    const file = workspace?.importedFiles.find(item => item.id === id);
    if (!file) return;
    if (button.dataset.fileAction === 'toggle') file.enabled = !file.enabled;
    if (button.dataset.fileAction === 'pin') file.pinned = !file.pinned;
    if (button.dataset.fileAction === 'delete') workspace.importedFiles = workspace.importedFiles.filter(item => item.id !== id);
    file.updatedAt = Date.now();
    touchWorkspace(workspace.id);
    renderWorkspaceContextTools();
    updateContextInspector();
}

function initWorkspacesUi() {
    renderWorkspaceUi();
    el.workspaceSwitcherBtn.addEventListener('click', () => el.workspaceSwitcherMenu.classList.toggle('open'));
    el.workspaceSwitcherMenu.addEventListener('click', (event) => {
        const switcher = event.target.closest('[data-workspace-switch]');
        if (switcher) switchWorkspace(switcher.dataset.workspaceSwitch);
        if (event.target.closest('[data-workspace-open-manager]')) openWorkspaceManager();
        el.workspaceSwitcherMenu.classList.remove('open');
    });
    el.workspaceManageBtn.addEventListener('click', openWorkspaceManager);
    el.workspaceCloseBtn.addEventListener('click', closeWorkspaceManager);
    el.workspaceModal.addEventListener('click', (event) => {
        if (event.target === el.workspaceModal) closeWorkspaceManager();
    });
    el.workspaceCreateBtn.addEventListener('click', () => {
        const workspace = createWorkspace({ name: 'New Workspace', icon: 'NW' });
        switchWorkspace(workspace.id);
        openWorkspaceManager();
    });
    el.workspaceShowArchived.addEventListener('change', (event) => {
        state.workspaceManagerFilterArchived = event.target.checked;
        renderWorkspaceManager();
    });
    el.workspaceList.addEventListener('click', handleWorkspaceListClick);
    [el.workspaceNameInput, el.workspaceKindInput, el.workspaceIconInput, el.workspaceColorInput, el.workspaceNotesInput].forEach(input => {
        input.addEventListener('input', debounce(updateActiveWorkspaceFromForm, 160));
    });
    el.lorebookAddBtn.addEventListener('click', addLorebookEntry);
    el.lorebookList.addEventListener('click', handleLorebookAction);
    el.importedFileAddBtn.addEventListener('click', () => el.importedFileInput.click());
    el.importedFileInput.addEventListener('change', async (event) => {
        await importWorkspaceFiles(Array.from(event.target.files || []));
        event.target.value = '';
    });
    el.importedFileList.addEventListener('click', handleImportedFileAction);
    el.workspaceExportBtn.addEventListener('click', () => {
        const workspace = getActiveWorkspace();
        const payload = serializeWorkspace(workspace.id);
        if (payload) downloadFile(JSON.stringify(payload, null, 2), `${workspace.name.replace(/[^\w-]+/g, '_')}_workspace.json`, 'application/json');
    });
    el.workspaceImportBtn.addEventListener('click', () => el.workspaceImportInput.click());
    el.workspaceImportInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const imported = importWorkspacePayload(JSON.parse(await file.text()));
            await switchWorkspace(imported.id);
            showToast('Workspace imported', 'success');
        } catch (error) {
            showToast(error.message || 'Workspace import failed', 'error');
        }
        event.target.value = '';
    });
    document.addEventListener('click', (event) => {
        if (!el.workspaceSwitcherBtn.contains(event.target) && !el.workspaceSwitcherMenu.contains(event.target)) {
            el.workspaceSwitcherMenu.classList.remove('open');
        }
        if (el.workspaceList && !el.workspaceList.contains(event.target)) {
            el.workspaceList.querySelectorAll('.workspace-card.menu-open').forEach(item => item.classList.remove('menu-open'));
        }
    });
}
