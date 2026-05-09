// IndexedDB Wrapper for Architect's Domain
// ============================================
const IDB_NAME = 'architects_domain_db';
const IDB_VERSION = 2;
const IDB_MIGRATED_KEY = 'idb_migrated';

let _db = null;

function idbOpen() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('chats')) {
                db.createObjectStore('chats', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('messages')) {
                const store = db.createObjectStore('messages', { keyPath: 'key' });
                store.createIndex('chatId', 'chatId', { unique: false });
            }
            if (!db.objectStoreNames.contains('contexts')) {
                db.createObjectStore('contexts', { keyPath: 'chatId' });
            }
            if (!db.objectStoreNames.contains('workspaces')) {
                db.createObjectStore('workspaces', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('memories')) {
                db.createObjectStore('memories', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('mcpServers')) {
                db.createObjectStore('mcpServers', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('mcpLogs')) {
                const store = db.createObjectStore('mcpLogs', { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('serverId', 'serverId', { unique: false });
                store.createIndex('eventType', 'eventType', { unique: false });
            }
            if (!db.objectStoreNames.contains('mcpChatState')) {
                db.createObjectStore('mcpChatState', { keyPath: 'chatId' });
            }
        };
        request.onsuccess = (event) => {
            _db = event.target.result;
            resolve(_db);
        };
        request.onerror = () => reject(request.error);
    });
}

function idbTx(storeName, mode) {
    return idbOpen().then(db => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const promise = new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        });
        return { store, promise };
    });
}

// --- Chats ---
const dbChats = {
    async get(id) {
        const { store, promise } = await idbTx('chats', 'readonly');
        const request = store.get(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async set(id, data) {
        const { store, promise } = await idbTx('chats', 'readwrite');
        store.put({ ...data, id });
        await promise;
    },
    async delete(id) {
        const { store, promise } = await idbTx('chats', 'readwrite');
        store.delete(id);
        await promise;
    },
    async list() {
        const { store, promise } = await idbTx('chats', 'readonly');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { results.push(cursor.value); cursor.continue(); }
                else resolve(results);
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async saveAll(chatsObj) {
        const { store, promise } = await idbTx('chats', 'readwrite');
        store.clear();
        for (const [id, chat] of Object.entries(chatsObj)) {
            const { messages, pinnedNotes, systemPrompt, ...meta } = chat;
            store.put({ ...meta, id: id || chat.id, messageCount: Array.isArray(messages) ? messages.length : 0 });
        }
        await promise;
    }
};

// --- Messages ---
const dbMessages = {
    async getAll(chatId) {
        const { store, promise } = await idbTx('messages', 'readonly');
        const index = store.index('chatId');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = index.openCursor(IDBKeyRange.only(chatId));
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { results.push(cursor.value); cursor.continue(); }
                else { results.sort((a, b) => a.index - b.index); resolve(results.map(r => r.message)); }
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async append(chatId, message, index) {
        const { store, promise } = await idbTx('messages', 'readwrite');
        store.put({ key: `${chatId}_${index}`, chatId, index, message });
        await promise;
    },
    async clear(chatId) {
        const { store, promise } = await idbTx('messages', 'readwrite');
        const index = store.index('chatId');
        return new Promise((resolve, reject) => {
            const request = index.openKeyCursor(IDBKeyRange.only(chatId));
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); }
                else resolve();
            };
            request.onerror = () => reject(request.error);
        }).then(() => promise);
    },
    async saveAllForChats(chatsObj) {
        const { store, promise } = await idbTx('messages', 'readwrite');
        store.clear();
        for (const [id, chat] of Object.entries(chatsObj)) {
            const messages = Array.isArray(chat.messages) ? chat.messages : [];
            messages.forEach((message, idx) => {
                const cleanMsg = { ...message };
                if (cleanMsg.attachments) {
                    cleanMsg.attachments = cleanMsg.attachments.map(a => ({ ...a, data: a.type === 'image' ? a.data : null }));
                }
                store.put({ key: `${id}_${idx}`, chatId: id, index: idx, message: cleanMsg });
            });
        }
        await promise;
    }
};

// --- Contexts ---
const dbContexts = {
    async get(chatId) {
        const { store, promise } = await idbTx('contexts', 'readonly');
        const request = store.get(chatId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async set(chatId, data) {
        const { store, promise } = await idbTx('contexts', 'readwrite');
        store.put({ chatId, pinnedNotes: data.pinnedNotes || '', systemPrompt: data.systemPrompt || '' });
        await promise;
    },
    async delete(chatId) {
        const { store, promise } = await idbTx('contexts', 'readwrite');
        store.delete(chatId);
        await promise;
    },
    async saveAll(chatsObj) {
        const { store, promise } = await idbTx('contexts', 'readwrite');
        store.clear();
        for (const [id, chat] of Object.entries(chatsObj)) {
            store.put({
                chatId: id,
                pinnedNotes: chat.pinnedNotes || '',
                systemPrompt: chat.systemPrompt || ''
            });
        }
        await promise;
    }
};

// --- Workspaces ---
const dbWorkspaces = {
    async get(id) {
        const { store, promise } = await idbTx('workspaces', 'readonly');
        const request = store.get(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async set(id, data) {
        const { store, promise } = await idbTx('workspaces', 'readwrite');
        store.put({ ...data, id });
        await promise;
    },
    async list() {
        const { store, promise } = await idbTx('workspaces', 'readonly');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { results.push(cursor.value); cursor.continue(); }
                else resolve(results);
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async saveAll(workspacesObj) {
        const { store, promise } = await idbTx('workspaces', 'readwrite');
        store.clear();
        for (const [id, ws] of Object.entries(workspacesObj)) {
            store.put({ ...ws, id: id || ws.id });
        }
        await promise;
    }
};

// --- Memories ---
const dbMemories = {
    async list() {
        const { store, promise } = await idbTx('memories', 'readonly');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { results.push(cursor.value); cursor.continue(); }
                else resolve(results);
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async saveAll(memoriesArr) {
        const { store, promise } = await idbTx('memories', 'readwrite');
        store.clear();
        for (const memory of memoriesArr) {
            store.put(memory);
        }
        await promise;
    }
};

// --- MCP Servers ---
const dbMcpServers = {
    async list() {
        const { store, promise } = await idbTx('mcpServers', 'readonly');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { results.push(cursor.value); cursor.continue(); }
                else resolve(results);
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async saveAll(serversArr) {
        const { store, promise } = await idbTx('mcpServers', 'readwrite');
        store.clear();
        for (const server of serversArr) {
            store.put(server);
        }
        await promise;
    }
};

// --- MCP Logs ---
const dbMcpLogs = {
    async list(limit = 300) {
        const { store, promise } = await idbTx('mcpLogs', 'readonly');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = store.openCursor(null, 'prev');
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
                }
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async add(entry) {
        const { store, promise } = await idbTx('mcpLogs', 'readwrite');
        store.put(entry);
        await promise;
    },
    async clear() {
        const { store, promise } = await idbTx('mcpLogs', 'readwrite');
        store.clear();
        await promise;
    }
};

// --- Per-chat MCP activation state ---
const dbMcpChatState = {
    async get(chatId) {
        const { store, promise } = await idbTx('mcpChatState', 'readonly');
        const request = store.get(chatId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    },
    async set(chatId, data) {
        const { store, promise } = await idbTx('mcpChatState', 'readwrite');
        store.put({ ...data, chatId });
        await promise;
    },
    async list() {
        const { store, promise } = await idbTx('mcpChatState', 'readonly');
        return new Promise((resolve, reject) => {
            const results = [];
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { results.push(cursor.value); cursor.continue(); }
                else resolve(results);
            };
            request.onerror = () => reject(request.error);
        }).then(result => { promise.catch(() => {}); return result; });
    }
};

// Public API
const db = {
    chats: dbChats,
    messages: dbMessages,
    contexts: dbContexts,
    workspaces: dbWorkspaces,
    memories: dbMemories,
    mcpServers: dbMcpServers,
    mcpLogs: dbMcpLogs,
    mcpChatState: dbMcpChatState,
    open: idbOpen,
    getStats: getStorageStats
};

// --- One-time migration from localStorage ---
async function migrateLocalStorageToIDB() {
    if (localStorage.getItem(IDB_MIGRATED_KEY)) return;
    try {
        // Chats
        const chatsRaw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (chatsRaw) {
            const chatsObj = JSON.parse(chatsRaw);
            // Normalize each chat
            for (const chat of Object.values(chatsObj)) {
                if (!Array.isArray(chat.messages)) chat.messages = [];
                if (typeof chat.workspaceId !== 'string') chat.workspaceId = '';
                if (typeof chat.systemPrompt !== 'string') chat.systemPrompt = '';
                if (typeof chat.pinnedNotes !== 'string') chat.pinnedNotes = '';
                if (!chat.createdAt) chat.createdAt = Date.now();
                if (!chat.updatedAt) chat.updatedAt = chat.createdAt;
            }
            await dbChats.saveAll(chatsObj);
            await dbMessages.saveAllForChats(chatsObj);
            await dbContexts.saveAll(chatsObj);
            localStorage.removeItem(CONFIG.STORAGE_KEY);
        }

        // Memories
        const memoriesRaw = localStorage.getItem(CONFIG.MEMORIES_KEY);
        if (memoriesRaw) {
            const memoriesArr = JSON.parse(memoriesRaw);
            if (Array.isArray(memoriesArr)) {
                await dbMemories.saveAll(memoriesArr);
            }
            localStorage.removeItem(CONFIG.MEMORIES_KEY);
        }

        // MCP Servers
        const mcpRaw = localStorage.getItem(CONFIG.MCP_SERVERS_KEY);
        if (mcpRaw) {
            const mcpArr = JSON.parse(mcpRaw);
            if (Array.isArray(mcpArr)) {
                await dbMcpServers.saveAll(mcpArr);
            }
            localStorage.removeItem(CONFIG.MCP_SERVERS_KEY);
        }

        // Workspaces
        const wsRaw = localStorage.getItem(CONFIG.WORKSPACES_KEY);
        if (wsRaw) {
            const wsObj = JSON.parse(wsRaw);
            if (wsObj && typeof wsObj === 'object') {
                await dbWorkspaces.saveAll(wsObj);
            }
            localStorage.removeItem(CONFIG.WORKSPACES_KEY);
        }

        localStorage.setItem(IDB_MIGRATED_KEY, 'true');
        console.log('IDB migration complete');
    } catch (e) {
        console.error('IDB migration failed:', e);
        // Don't set flag so we retry next load
    }
}

// --- Storage statistics ---
async function getStorageStats() {
    try {
        const chatMetas = await dbChats.list();
        let totalMessages = 0;
        let oldestCreatedAt = Infinity;
        let largestMessageCount = 0;
        let largestChatTitle = '';
        for (const meta of chatMetas) {
            totalMessages += (meta.messageCount || 0);
            if (meta.createdAt && meta.createdAt < oldestCreatedAt) oldestCreatedAt = meta.createdAt;
            if ((meta.messageCount || 0) > largestMessageCount) {
                largestMessageCount = meta.messageCount || 0;
                largestChatTitle = meta.title || 'Untitled';
            }
        }
        return {
            chatCount: chatMetas.length,
            totalMessages,
            oldestChatDate: oldestCreatedAt !== Infinity ? new Date(oldestCreatedAt).toLocaleDateString() : 'N/A',
            largestChat: largestMessageCount > 0 ? `${largestChatTitle} (${largestMessageCount} msgs)` : 'N/A'
        };
    } catch (e) {
        return { chatCount: 0, totalMessages: 0, oldestChatDate: 'N/A', largestChat: 'N/A' };
    }
}

// --- IndexedDB storage size estimation ---
async function estimateIDBStorageUsageBytes() {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            const localStorageBytes = estimateLocalStorageBytes();
            return Math.max(0, (estimate.usage || 0) - localStorageBytes);
        } catch (e) { /* fall through */ }
    }
    return 0;
}

async function getIDBStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            const localStorageBytes = estimateLocalStorageBytes();
            return Math.max(10 * 1024 * 1024, (estimate.quota || 0) - localStorageBytes);
        } catch (e) { /* fall through */ }
    }
    return 200 * 1024 * 1024; // sensible default: 200 MB
}

function estimateLocalStorageBytes() {
    let chars = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        chars += key.length + (localStorage.getItem(key) || '').length;
    }
    return chars * 2;
}
