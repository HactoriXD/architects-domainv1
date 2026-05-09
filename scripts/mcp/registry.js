// MCP Registry
    // ============================================
    const MCP_PRESETS = [
        {
            type: 'github',
            label: 'GitHub MCP',
            description: 'Read your public GitHub repo files, issues, and commits.',
            defaultName: 'GitHub',
            requiresBridge: true,
            recommended: true,
            icon: 'GH',
            setupHint: 'No token needed for public repos. Private repos can use a local token later.',
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ owner: 'HactoriXD', repo: 'architects-domainv1', token: '' })
        },
        {
            type: 'filesystem',
            label: 'Filesystem MCP',
            description: 'Browse, read, search, and confirm writes inside approved local folders.',
            defaultName: 'Filesystem',
            requiresBridge: true,
            recommended: true,
            icon: 'FS',
            setupHint: 'Uses the MCP Control Center allowlist.',
            transport: 'mcp-system',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/mcp`,
            defaultConfig: () => ({})
        },
        {
            type: 'browser',
            label: 'Puppeteer Browser MCP',
            description: 'Navigate, search, extract text, click, type, and capture screenshots through local Chromium.',
            defaultName: 'Puppeteer Browser',
            requiresBridge: true,
            recommended: true,
            icon: 'BR',
            setupHint: 'Persistent headless browser session with a 10 minute idle timeout.',
            transport: 'mcp-system',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/mcp`,
            defaultConfig: () => ({})
        },
        {
            type: 'memory',
            label: 'Memory MCP',
            description: 'Store and recall workspace memories from a local bridge-owned memory file.',
            defaultName: 'Memory',
            requiresBridge: true,
            recommended: true,
            icon: 'MM',
            setupHint: 'Relevant memories are recalled silently before each chat turn.',
            transport: 'mcp-system',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/mcp`,
            defaultConfig: () => ({})
        },
        {
            type: 'markdown-vault',
            label: 'Markdown Vault MCP',
            description: 'Browse and search a markdown vault folder through the built-in bridge.',
            defaultName: 'Markdown Vault',
            requiresBridge: true,
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ root: 'C:\\Users\\USER\\Documents' })
        },
        {
            type: 'git',
            label: 'Git MCP',
            description: 'Inspect local git status, branches, commits, and diffs.',
            defaultName: 'Local Git',
            requiresBridge: true,
            recommended: true,
            icon: 'GT',
            setupHint: 'Read-only access to this project’s local git repository.',
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ root: 'C:\\Users\\USER\\Desktop\\architects-domain' })
        },
        {
            type: 'app-inspector',
            label: 'App Self-Inspector',
            description: 'Inspect app health, package scripts, runtime files, and project structure.',
            defaultName: 'App Inspector',
            requiresBridge: true,
            recommended: true,
            icon: 'AD',
            setupHint: 'Read-only diagnostics for Architect’s Domain itself.',
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ root: 'C:\\Users\\USER\\Desktop\\architects-domain' })
        },
        {
            type: 'bridge-health',
            label: 'Bridge Health MCP',
            description: 'Check local bridge status, port, Node version, and runtime environment.',
            defaultName: 'Bridge Health',
            requiresBridge: true,
            recommended: true,
            icon: 'BH',
            setupHint: 'Useful when MCP is not responding or a port dies.',
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ root: 'C:\\Users\\USER\\Desktop\\architects-domain' })
        },
        {
            type: 'web-fetch-plus',
            label: 'Web Fetch Plus MCP',
            description: 'Fetch pages and extract readable title, text, links, and metadata.',
            defaultName: 'Web Fetch Plus',
            requiresBridge: true,
            recommended: true,
            icon: 'WF',
            setupHint: 'Network tool. You approve calls before fetching external pages.',
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({})
        },
        {
            type: 'notes-vault',
            label: 'Notes Vault MCP',
            description: 'Search and read local markdown notes in your Documents vault.',
            defaultName: 'Notes Vault',
            requiresBridge: true,
            recommended: true,
            icon: 'NV',
            setupHint: 'Creates/uses a local notes folder, but this pass only reads notes.',
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ root: 'C:\\Users\\USER\\Documents\\Architects Domain Notes' })
        },
        {
            type: 'web-fetch',
            label: 'Web Fetch MCP',
            description: 'Fetch public HTTP/HTTPS pages through the local bridge.',
            defaultName: 'Web Fetch',
            requiresBridge: true,
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({})
        },
        {
            type: 'custom',
            label: 'Custom HTTP MCP',
            description: 'Any browser-reachable MCP HTTP endpoint.',
            defaultName: 'Custom MCP',
            requiresBridge: false,
            transport: 'http',
            defaultEndpoint: '',
            defaultConfig: () => ({})
        }
    ];

    function getMcpPreset(type) {
        return MCP_PRESETS.find(preset => preset.type === type) || MCP_PRESETS[MCP_PRESETS.length - 1];
    }

    function initMcpRegistry() {
        state.mcpRegistry = MCP_PRESETS;
    }
