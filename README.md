## Preview

![Architect's Domain UI](assets/main-ui.png)

# Architect's Domain

Architect's Domain is a local first multi-model AI workstation built for power users, prompt engineers, roleplay creators, and AI explorers.

The project started as a single experimental HTML file and evolved into a modular AI cockpit with persistent memory, streaming chat, provider switching, markdown rendering, and BYOAK architecture.

## Features

* Multi-provider support

  * OpenRouter
  * Venice.ai
  * DeepSeek

* BYOAK architecture

  * Users bring their own API keys
  * No backend secrets required
  * Keys stay inside browser localStorage

* Persistent pinned memory

  * Per-chat contextual memory
  * Injected silently into requests
  * Works across providers and models

* Streaming chat system

  * Buffered SSE streaming
  * Stable stream ownership
  * Safe chat switching during generation
  * Preserved partial outputs on stop

* Advanced markdown rendering

  * Fenced code blocks
  * Syntax highlighting
  * Inline formatting
  * Better whitespace preservation

* Daily cockpit UX

  * Conversation navigation shortcuts
  * Pinned context controls
  * Export/import support
  * Multi-chat workflow

* Local-first architecture

  * Static host compatible
  * No required database
  * No required authentication
  * Portable and hackable

## Philosophy

Architect's Domain is designed as an AI workstation instead of a minimal chatbot.

The goal is to create a flexible environment where users can:

* switch between providers instantly
* preserve context and memory
* experiment with prompts
* build characters and systems
* use frontier models without platform lock-in

## Tech Stack

Frontend:

* HTML
* CSS
* Vanilla JavaScript

Architecture:

* Modular file structure
* Static-host compatible
* BYOAK provider flow

Providers:

* OpenRouter
* Venice.ai
* DeepSeek

## Project Structure

```text
/styles
/scripts
index.html
server.js
package.json
```

## Hosting

Architect's Domain can be hosted on:

* GitHub Pages
* Netlify
* Cloudflare Pages
* Vercel static hosting
* Any static web server

## Security Model

This project uses a strict BYOAK model.

Users provide their own API keys locally. Keys are stored in browser localStorage and sent directly to the selected provider.

The repository does not contain provider secrets.

## Status

Public beta.

The project is actively evolving and focused on experimentation, usability, and AI workflow design.

## License

No license yet.
