# Architect's Domain Desktop

Architect's Domain now has a minimal Tauri v2 desktop shell around the existing HTML, CSS, and vanilla JavaScript app.

## Commands

```powershell
npm install
npm run dev
npm run tauri dev
npm run build
```

`npm run dev` and `npm run tauri dev` both launch the Tauri app. Tauri starts the existing `server.js` static/MCP bridge server at `http://localhost:3000` during development.

For browser-only development, use:

```powershell
npm run serve
```

## Prerequisites

Tauri requires the Rust toolchain and platform WebView dependencies. On Windows, install:

- Rust via `rustup`
- Microsoft Visual Studio Build Tools with the C++ workload
- Microsoft Edge WebView2 Runtime

After installing Rust, restart the terminal and confirm:

```powershell
rustc --version
cargo --version
```

## Architecture Notes

- The frontend remains `index.html` plus the existing `styles/`, `scripts/`, and `assets/` folders.
- No React, Vite app, or bundler has been introduced.
- Local app data continues to use browser `localStorage` and IndexedDB inside the Tauri WebView.
- Development mode uses the existing Node server so `/mcp` and `/bridge` continue to work.
- Production bundles a generated `.tauri-dist` static frontend containing only `index.html`, `styles/`, `scripts/`, and `assets/`. Local MCP bridge endpoints may need a future native sidecar or Tauri command layer.

## Future Native Upgrades

- Move API keys into secure OS storage via a Tauri plugin.
- Add file import/export through native dialogs.
- Add a local database layer for larger chat and memory stores.
- Add native menu, tray, drag/drop, and auto-update support.
- Replace the development-only Node bridge with a bundled sidecar or native Rust commands.
