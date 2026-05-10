# Architect's Domain

**Architect's Domain** is a local-first, multi-provider AI workstation for people who want more control than a standard chatbot gives them.

It combines streaming chat, bring-your-own API keys, persistent user-approved memory, image previews, real MCP tool execution through an optional local bridge, and visible context inspection inside a restrained dark workstation interface.

> Local-first means chats, settings, keys, memories, and context assembly stay in the browser. Model inference still uses external providers such as OpenRouter, DeepSeek, or Venice through your own API keys.

## Demo

Watch the current walkthrough:

[Architect's Domain demo video](assets/demo/architects-domain-demo.mp4)

> If GitHub does not show the MP4 inline, open the link directly from the repository.

## Preview

![Architect's Domain UI](assets/main-ui.png)

## Why It Exists

Most AI chat interfaces hide too much. Architect's Domain is built around the opposite idea: the user should see and control the model, context, memory, provider, and stored data.

The project is designed as a personal AI cockpit rather than a generic chatbot clone. It is meant for prompt engineers, roleplay creators, builders, researchers, and power users who want a transparent local workspace.

## Core Features

- **Multi-provider chat**
  - OpenRouter
  - Groq
  - DeepSeek
  - Venice.ai

- **Bring-your-own API key**
  - No backend secrets
  - Keys are stored locally in browser storage
  - Requests go directly from the browser to the selected provider

- **Streaming chat**
  - Buffered SSE streaming
  - Stable stream ownership
  - Safe chat switching during generation
  - Preserved partial output when stopping generation

- **Persistent memory**
  - Local memory notes
  - Suggested memories require user approval
  - Accept, reject, edit, pin, disable, and delete controls
  - Strict filtering to avoid low-value generic memories

- **Context visibility**
  - Context Sources inspector
  - Shows system prompt, pinned notes, enabled memories, and MCP capabilities
  - No silent memory saves
  - No hidden tool execution

- **Workspaces**
  - Workspace switcher and manager
  - Workspace-scoped chats, memories, MCP configs, notes, lorebooks, and imported text files
  - Workspace export/import for portable local project context

- **Data Manager**
  - First-run local-first privacy notice
  - Storage usage meter
  - Export/import full local backups
  - Clear chats, memories, API keys, or reset all local app data
  - Storage warnings for oversized local files and images

- **MCP foundation**
  - Browser HTTP/SSE MCP server support
  - Optional local Node bridge for practical filesystem, markdown vault, GitHub, and web fetch tools
  - Tool discovery, execution cards, status badges, resources, and context inspector visibility
  - Read-only tools can run visibly; destructive or mutating tools require approval

- **Image handling**
  - Image attachments in chat
  - Clickable previews
  - Lightbox viewer with zoom, fit, original size, ESC close, and backdrop close

- **Markdown and code rendering**
  - Fenced code blocks
  - Preserved indentation
  - Inline formatting
  - Streaming-safe final markdown rendering

- **Model cost awareness**
  - Per-model pricing display where available
  - Estimated message cost
  - DeepSeek thinking mode toggle

## Local-First Security Model

Architect's Domain does not require a database, account system, or hosted backend.

Stored locally:

- API keys
- chats
- memory notes
- settings
- pinned context
- MCP server configuration
- workspaces, lorebooks, and imported text files

Sent externally only when you choose to chat:

- selected model request
- current conversation context
- approved memories that are enabled
- attached files/images included in that message

The app is transparent by design: the Context Sources inspector shows what durable context is entering the model.

Use **Data Manager** before sharing a machine, publishing screenshots, or switching browsers. Full local backups can include API keys, so store exported backup files privately.

## MCP Runtime

MCP works in two modes:

- Direct `index.html` mode keeps chat, memory, settings, and custom browser-reachable HTTP/SSE MCP configuration available, but local bridge execution is disabled.
- `npm start` mode enables the built-in bridge at `/bridge`, which can safely expose approved local tools to the browser.

Built-in bridge presets:

- Filesystem: list, read, and search text-like files inside one configured root folder.
- Markdown Vault: the same local folder engine tuned for notes and vaults.
- GitHub: read repository metadata, files, issues, and commits through the GitHub API, with an optional local token.
- Web Fetch: fetch public HTTP/HTTPS pages through the local bridge.

MCP tool calls are visible in the interface. Tool results are injected into the current model turn and shown as tool cards in the chat. Failed MCP calls degrade gracefully and should not break normal chat.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- LocalStorage
- Static Node server for local development

No React, Vue, Tailwind, bundler, Electron, or framework rewrite.

## Project Structure

```text
assets/
bridge/
scripts/
  mcp/
  workspaces/
styles/
index.html
server.js
package.json
README.md
```

## Run Locally

Architect's Domain can be opened directly by double-clicking `index.html`. For the most consistent local behavior, use the tiny static server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Run checks before publishing changes:

```bash
npm run check
npm test
```

## Configuration

1. Open settings.
2. Select a provider.
3. Add your local API key.
4. Pick a model.
5. Start chatting.

Supported providers:

- OpenRouter
- Groq
- DeepSeek
- Venice.ai

### GroqCloud

Groq support uses GroqCloud's OpenAI-compatible API:

- Base URL: `https://api.groq.com/openai/v1`
- Chat endpoint: `/chat/completions`
- Auth: `Authorization: Bearer <GROQ_API_KEY>`

Add a Groq API key in Settings after creating one in the GroqCloud console. The key is stored locally in browser storage, just like the other provider keys. The Groq model list is curated from Groq's public model documentation and can change as Groq updates model availability; pricing is shown only when exact local metadata is present, otherwise the UI points to provider pricing.

## Hosting

Architect's Domain is static-host compatible.

It can be hosted on:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel static hosting
- Any static web server

Provider calls are made from the browser, so CORS support depends on the selected provider.

## Publishing Checklist

Before uploading screenshots, videos, or demo data:

- Clear or hide private chats and memory notes.
- Do not show provider API keys or account pages.
- Review imported files and workspace notes.
- Use Data Manager to export a private backup before clearing local data.
- Confirm `.env` is not committed. Only `.env.example` should be public.

## Status

Public beta.

The app is actively evolving toward a transparent, local-first AI workspace with stronger memory controls, better MCP integrations, and a more polished daily workflow.

## License

MIT
