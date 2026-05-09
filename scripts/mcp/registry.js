// MCP Registry
    // ============================================
    const MCP_PRESETS = [
        {
            type: 'filesystem',
            label: 'Filesystem MCP',
            description: 'Browse, read, and search a local folder through the built-in bridge.',
            defaultName: 'Filesystem',
            requiresBridge: true,
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ root: 'C:\\Users\\USER\\Desktop\\architects-domain' })
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
            type: 'github',
            label: 'GitHub MCP',
            description: 'Read repositories, files, issues, and commits through GitHub.',
            defaultName: 'GitHub',
            requiresBridge: true,
            transport: 'bridge',
            defaultEndpoint: location.protocol === 'file:' ? '' : `${location.origin}/bridge`,
            defaultConfig: () => ({ owner: '', repo: '', token: '' })
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
