# Architect's Domain

**Architect's Domain** is a local-first, multi-provider AI workstation for people who want more control than a standard chatbot gives them.

It combines streaming chat, bring-your-own API keys, persistent user-approved memory, image previews, MCP server foundations, and visible context inspection inside a restrained dark workstation interface.

> Local-first means chats, settings, keys, memories, and context assembly stay in the browser. Model inference still uses external providers such as OpenRouter, DeepSeek, or Venice through your own API keys.

## Demo

> OBS capture slot: replace this placeholder with your demo GIF or video preview.

```text
assets/demo/architects-domain-demo.gif
```

Recommended capture:

- 20 to 45 seconds
- 1280x720 or 1920x1080
- Show model selection, a short streaming reply, memory review, context sources, and the image lightbox
- Keep API keys hidden

## Preview

![Architect's Domain UI](assets/main-ui.png)

## Why It Exists

Most AI chat interfaces hide too much. Architect's Domain is built around the opposite idea: the user should see and control the model, context, memory, provider, and stored data.

The project is designed as a personal AI cockpit rather than a generic chatbot clone. It is meant for prompt engineers, roleplay creators, builders, researchers, and power users who want a transparent local workspace.

## Core Features

- **Multi-provider chat**
  - OpenRouter
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

- **MCP foundation**
  - Browser HTTP/SSE MCP server configuration
  - Add, remove, enable, disable, and test server connections
  - Capability listing for configured servers
  - Designed for user-driven tool access, not autonomous workflows

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

Sent externally only when you choose to chat:

- selected model request
- current conversation context
- approved memories that are enabled
- attached files/images included in that message

The app is transparent by design: the Context Sources inspector shows what durable context is entering the model.

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
scripts/
  mcp/
styles/
index.html
server.js
package.json
README.md
```

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Configuration

1. Open settings.
2. Select a provider.
3. Add your local API key.
4. Pick a model.
5. Start chatting.

Supported providers:

- OpenRouter
- DeepSeek
- Venice.ai

## Hosting

Architect's Domain is static-host compatible.

It can be hosted on:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel static hosting
- Any static web server

Provider calls are made from the browser, so CORS support depends on the selected provider.

## Status

Public beta.

The app is actively evolving toward a transparent, local-first AI workspace with stronger memory controls, better MCP integrations, and a more polished daily workflow.

## License

MIT
