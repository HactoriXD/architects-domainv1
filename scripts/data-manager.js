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
        'architects_domain_welcomed'
    ];
}

function getStorageSnapshot() {
    const keys = getManagedStorageKeys();
    const values = {};
    keys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) values[key] = value;
    });
    return values;
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

function updateDataStorageUi() {
    const info = getStorageQuotaInfo();
    const percent = Math.min(100, Math.round(info.ratio * 100));
    const label = `${formatFileSize(info.usage)} used`;
    if (el.storageUsageValue) el.storageUsageValue.textContent = label;
    if (el.dataStorageUsage) el.dataStorageUsage.textContent = `${label} of ~${formatFileSize(info.quota)} practical localStorage budget`;
    if (el.dataStoragePercent) el.dataStoragePercent.textContent = `${percent}%`;
    if (el.dataStorageBar) {
        el.dataStorageBar.style.width = `${Math.min(100, percent)}%`;
        el.dataStorageBar.dataset.level = info.ratio >= STORAGE_DANGER_RATIO ? 'danger' : info.ratio >= STORAGE_WARNING_RATIO ? 'warning' : 'ok';
    }
    if (el.dataStorageHint) {
        el.dataStorageHint.textContent = info.ratio >= STORAGE_WARNING_RATIO
            ? 'Storage is high. Large images, imported files, and long chats can fill localStorage quickly.'
            : 'Browser quota varies by browser and disk space. Export backups before clearing data.';
    }
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
        showToast('Local data imported. Reloading...', 'success');
        setTimeout(() => location.reload(), 600);
    } catch (error) {
        console.error('Local data import failed:', error.message || error);
        showToast('Could not import local data backup', 'error');
    }
}

function clearLocalDataGroup(group) {
    const labels = {
        chats: 'all chats',
        memories: 'all memories',
        apiKeys: 'all local API keys'
    };
    if (!confirm(`Clear ${labels[group]} from this browser?`)) return;
    if (group === 'chats') {
        state.chats = {};
        saveChats();
        createNewChat();
    }
    if (group === 'memories') {
        state.memories = [];
        saveMemories();
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

function fullLocalReset() {
    if (!confirm('Full local reset removes chats, memories, workspaces, MCP servers, settings, and API keys from this browser. Continue?')) return;
    getManagedStorageKeys().forEach(key => localStorage.removeItem(key));
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
    updateDataStorageUi();
    setTimeout(showPrivacyNoticeIfNeeded, 350);
}
