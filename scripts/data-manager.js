// Data Manager
// ============================================
const DATA_BACKUP_FORMAT = 'architects-domain-local-data';
const DATA_BACKUP_VERSION = 1;
const PRIVACY_NOTICE_KEY = 'architects_domain_privacy_notice_v1';
const STORAGE_WARNING_RATIO = 0.82;
const STORAGE_DANGER_RATIO = 0.94;
let lastStorageWarningAt = 0;
let lastStorageDangerAt = 0;

function getManagedStorageKeys() {
    return [
        CONFIG.STORAGE_KEY,
        CONFIG.MEMORIES_KEY,
        CONFIG.MCP_SERVERS_KEY,
        CONFIG.SETTINGS_KEY,
        CONFIG.WORKSPACES_KEY,
        CONFIG.ACTIVE_WORKSPACE_KEY,
        PRIVACY_NOTICE_KEY,
        'architects_domain_welcomed',
        'idb_migrated'
    ];
}

function getStorageSnapshot() {
    const keys = getManagedStorageKeys();
    const values = {};
    keys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) values[key] = value;
    });
    redactProviderKeysFromPlainStorageSnapshot(values);
    return values;
}

function redactProviderKeysFromPlainStorageSnapshot(values) {
    const rawSettings = values[CONFIG.SETTINGS_KEY];
    if (!rawSettings) return;
    try {
        const settings = JSON.parse(rawSettings);
        if (settings?.apiKeys?.groq || settings?.apiKeys?.nanogpt || settings?.nanogptApiKey) {
            settings.apiKeys = { ...settings.apiKeys };
            delete settings.apiKeys.groq;
            delete settings.apiKeys.nanogpt;
            delete settings.nanogptApiKey;
            values[CONFIG.SETTINGS_KEY] = JSON.stringify(settings);
        }
    } catch (e) {
        // Leave malformed settings untouched so backup/import behavior stays predictable.
    }
}

function getLocalDataBackupPayload() {
    return {
        format: DATA_BACKUP_FORMAT,
        version: DATA_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        origin: location.origin,
        app: CONFIG.SITE_NAME,
        storage: getStorageSnapshot()
    };
}

function estimateStorageUsageBytes(extraText = '', replaceKey = '') {
    let chars = extraText.length;
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (replaceKey && key === replaceKey) continue;
        chars += key.length + (localStorage.getItem(key) || '').length;
    }
    return chars * 2;
}

function getStorageQuotaInfo(extraText = '', replaceKey = '') {
    const usage = estimateStorageUsageBytes(extraText, replaceKey);
    const quota = 5 * 1024 * 1024;
    const ratio = usage / quota;
    return { usage, quota, ratio };
}

function shouldShowStorageToast(type) {
    const now = Date.now();
    const last = type === 'danger' ? lastStorageDangerAt : lastStorageWarningAt;
    if (now - last < 30000) return false;
    if (type === 'danger') lastStorageDangerAt = now;
    else lastStorageWarningAt = now;
    return true;
}

function hasStorageHeadroom(extraText = '', label = 'This data', replaceKey = '') {
    const info = getStorageQuotaInfo(extraText, replaceKey);
    if (info.ratio >= STORAGE_DANGER_RATIO) {
        if (shouldShowStorageToast('danger')) {
            showToast(`${label} may exceed browser storage. Export or clear local data first.`, 'error');
        }
        updateDataStorageUi();
        return false;
    }
    if (info.ratio >= STORAGE_WARNING_RATIO) {
        if (shouldShowStorageToast('warning')) {
            showToast('Local storage is getting full. Consider exporting a backup soon.', 'info');
        }
    }
    updateDataStorageUi();
    return true;
}

async function updateDataStorageUi() {
    const lsInfo = getStorageQuotaInfo();
    const lsPercent = Math.min(100, Math.round(lsInfo.ratio * 100));
    const lsLabel = `${formatFileSize(lsInfo.usage)} used`;

    // IndexedDB usage
    let idbBytes = 0;
    let idbPercent = 0;
    let idbLabel = 'calculating...';
    try {
        idbBytes = typeof estimateIDBStorageUsageBytes === 'function' ? await estimateIDBStorageUsageBytes() : 0;
        idbLabel = `${formatFileSize(idbBytes)} used`;
        const idbQuota = typeof getIDBStorageQuota === 'function' ? await getIDBStorageQuota() : (200 * 1024 * 1024);
        idbPercent = Math.min(100, idbQuota > 0 ? Math.round((idbBytes / idbQuota) * 100) : 0);
    } catch (e) { idbLabel = 'unknown'; }

    // localStorage bar (Settings Storage)
    if (el.dataStorageUsage) el.dataStorageUsage.textContent = `Settings Storage: ${lsLabel} of ~${formatFileSize(lsInfo.quota)}`;
    if (el.dataStoragePercent) el.dataStoragePercent.textContent = `${lsPercent}%`;
    if (el.dataStorageBar) {
        el.dataStorageBar.style.width = `${Math.min(100, lsPercent)}%`;
        el.dataStorageBar.dataset.level = lsInfo.ratio >= STORAGE_DANGER_RATIO ? 'danger' : lsInfo.ratio >= STORAGE_WARNING_RATIO ? 'warning' : 'ok';
    }
    // IndexedDB bar (Chat Storage)
    if (el.idbStorageUsage) el.idbStorageUsage.textContent = `Chat Storage (IndexedDB): ${idbLabel}`;
    if (el.idbStoragePercent) el.idbStoragePercent.textContent = `${idbPercent}%`;
    if (el.idbStorageBar) {
        el.idbStorageBar.style.width = `${Math.min(100, idbPercent)}%`;
        el.idbStorageBar.dataset.level = 'ok';
    }
    if (el.storageUsageValue) el.storageUsageValue.textContent = lsLabel;
    if (el.dataStorageHint) {
        el.dataStorageHint.textContent = lsInfo.ratio >= STORAGE_WARNING_RATIO
            ? 'Storage is high. Chats are stored in IndexedDB; settings and keys in localStorage.'
            : 'Chats, workspaces, memories, and MCP servers are stored in IndexedDB. Settings and API keys remain in localStorage.';
    }

    // Storage Details
    await updateStorageDetails();
}

async function updateStorageDetails() {
    if (!el.storageDetailChats) return;
    try {
        const stats = await db.getStats();
        el.storageDetailChats.textContent = stats.chatCount;
        el.storageDetailMessages.textContent = stats.totalMessages;
        el.storageDetailOldest.textContent = stats.oldestChatDate;
        el.storageDetailLargest.textContent = stats.largestChat;
    } catch (e) {
        el.storageDetailChats.textContent = '-';
        el.storageDetailMessages.textContent = '-';
        el.storageDetailOldest.textContent = '-';
        el.storageDetailLargest.textContent = '-';
    }
}

function toggleStorageDetails() {
    const body = el.storageDetailsBody;
    const toggle = el.storageDetailsToggle;
    const open = !body.hidden;
    body.hidden = open;
    if (open) toggle.classList.remove('open');
    else toggle.classList.add('open');
}

function openDataManager() {
    updateDataStorageUi();
    el.dataManagerModal.classList.add('open');
}

function closeDataManager() {
    el.dataManagerModal.classList.remove('open');
}

function showPrivacyNoticeIfNeeded() {
    if (localStorage.getItem(PRIVACY_NOTICE_KEY)) return;
    el.privacyModal.classList.add('open');
}

function acceptPrivacyNotice() {
    localStorage.setItem(PRIVACY_NOTICE_KEY, new Date().toISOString());
    el.privacyModal.classList.remove('open');
    updateDataStorageUi();
}

function exportAllLocalData() {
    const payload = getLocalDataBackupPayload();
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadFile(JSON.stringify(payload, null, 2), `architects_domain_local_backup_${date}.json`, 'application/json');
    updateDataStorageUi();
}

async function importAllLocalData(file) {
    if (!file) return;
    try {
        const payload = JSON.parse(await file.text());
        if (payload?.format !== DATA_BACKUP_FORMAT || payload.version !== DATA_BACKUP_VERSION || !payload.storage) {
            throw new Error('Invalid Architect\'s Domain backup');
        }
        const serialized = JSON.stringify(payload.storage);
        if (!hasStorageHeadroom(serialized, 'This backup')) return;
        if (!confirm('Importing this backup will replace local Architect\'s Domain data in this browser. Continue?')) return;
        getManagedStorageKeys().forEach(key => localStorage.removeItem(key));
        Object.entries(payload.storage).forEach(([key, value]) => {
            if (getManagedStorageKeys().includes(key)) localStorage.setItem(key, String(value));
        });
        // Clear IDB and re-run migration
        localStorage.removeItem('idb_migrated');
        showToast('Local data imported. Reloading...', 'success');
        setTimeout(() => location.reload(), 600);
    } catch (error) {
        console.error('Local data import failed:', error.message || error);
        showToast('Could not import local data backup', 'error');
    }
}

async function clearLocalDataGroup(group) {
    const labels = {
        chats: 'all chats and messages',
        memories: 'all memories and MCP memory data',
        apiKeys: 'all local API keys'
    };
    if (!confirm(`Clear ${labels[group]} from this browser?`)) return;
    if (group === 'chats') {
        state.chats = {};
        try {
            const dbInst = await db.open();
            const tx = dbInst.transaction(['chats', 'messages', 'contexts'], 'readwrite');
            tx.objectStore('chats').clear();
            tx.objectStore('messages').clear();
            tx.objectStore('contexts').clear();
            await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
        } catch (e) { /* IDB unavailable */ }
        createNewChat();
    }
    if (group === 'memories') {
        state.memories = [];
        try {
            const dbInst = await db.open();
            const tx = dbInst.transaction(['memories', 'contexts'], 'readwrite');
            tx.objectStore('memories').clear();
            tx.objectStore('contexts').clear();
            await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
        } catch (e) {}
        saveMemories();
        // Also clear server-side mcp-memory.json via bridge
        try {
            await mcpSystemRequest('/system/reset', { method: 'POST', body: {} });
        } catch (e) { /* bridge offline */ }
        renderMemoryManager();
        updateContextInspector();
    }
    if (group === 'apiKeys') {
        state.apiKeys = {};
        state.providerStatus = {};
        saveSettings();
        restoreSettingsUI();
        updateProviderUI();
        updateSendButton();
    }
    updateDataStorageUi();
    showToast(`${labels[group]} cleared`, 'success');
}

async function fullLocalReset() {
    if (!confirm('Full local reset removes all chats, memories, workspaces, MCP servers, settings, and API keys. This includes bridge data on the server. Continue?')) return;
    // Clear server-side data first
    try {
        await mcpSystemRequest('/system/reset', { method: 'POST', body: {} });
    } catch (e) { /* bridge offline — clear local anyway */ }
    // Clear localStorage
    getManagedStorageKeys().forEach(key => localStorage.removeItem(key));
    // Clear all IndexedDB stores
    try {
        const dbInst = await db.open();
        const stores = ['chats', 'messages', 'contexts', 'workspaces', 'memories', 'mcpServers', 'mcpLogs', 'mcpChatState'].filter(name => dbInst.objectStoreNames.contains(name));
        const tx = dbInst.transaction(stores, 'readwrite');
        tx.objectStore('chats').clear();
        tx.objectStore('messages').clear();
        tx.objectStore('contexts').clear();
        tx.objectStore('workspaces').clear();
        tx.objectStore('memories').clear();
        if (stores.includes('mcpServers')) tx.objectStore('mcpServers').clear();
        if (stores.includes('mcpLogs')) tx.objectStore('mcpLogs').clear();
        if (stores.includes('mcpChatState')) tx.objectStore('mcpChatState').clear();
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    } catch (e) { /* IDB may not be available */ }
    localStorage.removeItem('idb_migrated');
    showToast('Local data reset. Reloading...', 'success');
    setTimeout(() => location.reload(), 600);
}

function initDataManager() {
    if (!el.dataManagerBtn) return;
    el.dataManagerBtn.addEventListener('click', openDataManager);
    el.dataManagerCloseBtn.addEventListener('click', closeDataManager);
    el.dataManagerModal.addEventListener('click', event => {
        if (event.target === el.dataManagerModal) closeDataManager();
    });
    el.privacyAcceptBtn.addEventListener('click', acceptPrivacyNotice);
    el.privacyOpenDataBtn.addEventListener('click', () => {
        acceptPrivacyNotice();
        openDataManager();
    });
    el.exportAllDataBtn.addEventListener('click', exportAllLocalData);
    el.importAllDataBtn.addEventListener('click', () => el.dataImportInput.click());
    el.dataImportInput.addEventListener('change', async event => {
        await importAllLocalData(event.target.files?.[0]);
        event.target.value = '';
    });
    el.clearChatsBtn.addEventListener('click', () => clearLocalDataGroup('chats'));
    el.clearMemoriesBtn.addEventListener('click', () => clearLocalDataGroup('memories'));
    el.clearApiKeysDataBtn.addEventListener('click', () => clearLocalDataGroup('apiKeys'));
    el.fullResetBtn.addEventListener('click', fullLocalReset);
    // Storage details toggle
    if (el.storageDetailsToggle) {
        el.storageDetailsToggle.addEventListener('click', toggleStorageDetails);
    }
    updateDataStorageUi();
    setTimeout(showPrivacyNoticeIfNeeded, 350);
}
