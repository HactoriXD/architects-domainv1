// MCP Registry
    // ============================================
    const MCP_PRESETS = [
        {
            type: 'filesystem',
            label: 'Filesystem MCP',
            description: 'Local files through an HTTP MCP bridge.',
            defaultName: 'Filesystem',
            requiresBridge: true
        },
        {
            type: 'markdown-vault',
            label: 'Markdown Vault MCP',
            description: 'Notes and vault search through an HTTP MCP bridge.',
            defaultName: 'Markdown Vault',
            requiresBridge: true
        },
        {
            type: 'github',
            label: 'GitHub MCP',
            description: 'Repository and issue tools exposed over HTTP MCP.',
            defaultName: 'GitHub',
            requiresBridge: true
        },
        {
            type: 'web-fetch',
            label: 'Web Fetch MCP',
            description: 'Transparent user-triggered web fetch tools.',
            defaultName: 'Web Fetch',
            requiresBridge: false
        },
        {
            type: 'custom',
            label: 'Custom HTTP MCP',
            description: 'Any browser-reachable MCP HTTP endpoint.',
            defaultName: 'Custom MCP',
            requiresBridge: false
        }
    ];

    function getMcpPreset(type) {
        return MCP_PRESETS.find(preset => preset.type === type) || MCP_PRESETS[MCP_PRESETS.length - 1];
    }

    function initMcpRegistry() {
        state.mcpRegistry = MCP_PRESETS;
    }
