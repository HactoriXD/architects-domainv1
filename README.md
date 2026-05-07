## Architect's Domain

**Local-first • Multi-model • BYOAK AI Workstation for Power Users**

![Architect's Domain](assets/main-ui.png)

> A privacy-first, hackable AI cockpit that lets you switch between frontier models instantly, maintain persistent memory across chats, and experiment freely — all while keeping your API keys and data under your control.

**Status:** Public Beta • Actively evolving

---

## ✨ Why Architect's Domain?

Most AI chat tools force you into one ecosystem. Architect's Domain is different:

- **True local-first** — runs anywhere (GitHub Pages, Netlify, localhost, even offline with local models)
- **BYOAK (Bring Your Own API Keys)** — zero backend, zero secrets in the repo
- **Multi-provider freedom** — OpenRouter, Venice.ai, DeepSeek, and soon Ollama / LM Studio
- **Persistent contextual memory** — pin important context that follows you across every model and conversation
- **Built for power users** — prompt engineers, roleplay creators, researchers, and tinkerers

No accounts. No tracking. No vendor lock-in.

---

## 🚀 Quick Start

### Web Version (Easiest)
1. Visit the live demo (coming soon)
2. Add your API keys in Settings
3. Start chatting with pinned memory enabled

### Run Locally
```bash
git clone https://github.com/HactoriXD/architects-domain.git
cd architects-domain
node server.js
# Open http://localhost:3000
```

### Desktop App (New in v0.2)
```bash
# Install Tauri CLI
npm install -g @tauri-apps/cli

# Run in development
npm run tauri:dev

# Build production app
npm run tauri:build
```

The desktop app will be available as `.exe`, `.dmg`, `.AppImage`, and `.deb`.

---

## ✨ Core Features

### Smart Router (v0.2)
- Automatically recommends the best model for your prompt
- Shows real-time cost estimate and context window
- One-click apply
- Works with cloud + local models

### Local Model Support (v0.2)
- Native Ollama support (localhost:11434)
- Native LM Studio support (localhost:1234)
- Automatic detection

### Multi-Provider Support
- OpenRouter
- Venice.ai
- DeepSeek
- Local (Ollama / LM Studio)

### BYOAK Architecture
- API keys stored only in your browser (localStorage)
- Keys never leave your device except to the provider you choose

### Intelligent Memory System
- Per-chat **pinned memory** that is silently injected into every request
- Works across all providers and models

### Streaming & UX
- Smooth buffered SSE streaming
- Safe chat switching mid-generation
- Advanced markdown with syntax highlighting

### Cockpit Workflow
- Multi-chat navigation
- Keyboard shortcuts everywhere
- Export / import conversations

---

## 🗺️ Roadmap

### v0.3 (Coming Soon)
- Conversation branching / tree view
- Semantic memory search
- Theming system + Focus Mode
- Full Tauri desktop polish

### v1.0
- Plugin system
- Public release + community features

---

## 🛠️ Development

### Tech Stack
- **Frontend**: Vanilla HTML + CSS + JavaScript
- **Desktop**: Tauri (Rust)
- **Architecture**: Modular, local-first

### Project Structure
```
architects-domain/
├── index.html
├── server.js
├── package.json
├── src-tauri/          # Desktop app (Rust + Tauri)
├── scripts/            # JS modules
├── styles/
└── README.md
```

### Local Development
```bash
node server.js
```

### Building Desktop App
```bash
# Install dependencies
npm install

# Development mode
npm run tauri:dev

# Production build
npm run tauri:build
```

---

## 🔒 Security & Privacy
- **Strict BYOAK** — your keys never touch our servers
- Keys live only in browser localStorage
- All communication goes directly from your browser to the AI provider
- No analytics, no telemetry, no accounts
- Open source — audit everything

---

## 📜 License

MIT License

---

**Built with ❤️ for power users who refuse to be locked in.**

*Last updated: May 2026*