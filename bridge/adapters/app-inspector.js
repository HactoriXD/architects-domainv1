const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const APP_INSPECTOR_PRESETS = ['filesystem', 'markdown-vault', 'github', 'web-fetch', 'git', 'app-inspector', 'bridge-health', 'web-fetch-plus', 'notes-vault'];
const CONSOLE_LIMIT = 200;
const session = { browser: null, page: null, url: '', consoleEntries: [], pageErrors: [] };

function schemaString(description, extra = {}) {
  return { type: 'string', description, ...extra };
}

function schemaBoolean(description, defaultValue = false) {
  return { type: 'boolean', description, default: defaultValue };
}

function schemaNumber(description) {
  return { type: 'number', description };
}

function tool(name, description, safety, properties = {}, required = []) {
  return {
    name,
    description,
    safety,
    inputSchema: { type: 'object', properties, required }
  };
}

function getAppInspectorAdapter() {
  return {
    type: 'app-inspector',
    label: 'App Inspector',
    description: 'Inspect Architect\'s Domain health, UI state, layout, console output, and product surfaces.',
    tools: [
      tool('app.health', 'Inspect app files, package metadata, and bridge health.', 'read'),
      tool('app.project_structure', 'List top-level project structure.', 'read'),
      tool('app.read_package', 'Read package.json scripts and metadata.', 'read'),
      tool('app_get_screen_summary', 'Summarize the current Architect\'s Domain screen, open modals/panels, visible controls, and obvious empty/error states.', 'read', {
        url: schemaString('Optional app URL. Defaults to the local Architect\'s Domain server.'),
        includeButtons: schemaBoolean('Include visible button labels.', true)
      }),
      tool('app_get_interactive_elements', 'List visible buttons, links, inputs, and selects with stable selectors, state, and region grouping.', 'read', {
        url: schemaString('Optional app URL. Defaults to the current inspector page or local app.'),
        includeHidden: schemaBoolean('Include hidden controls in the report.', false)
      }),
      tool('app_click_by_text', 'Click a visible button or link by exact or approximate label. Destructive actions are blocked unless approved.', 'write', {
        text: schemaString('Visible text, title, aria-label, placeholder, or approximate label to click.'),
        exact: schemaBoolean('Require an exact normalized label match.', false),
        approved: schemaBoolean('Set true only after explicit user approval for destructive actions.', false),
        url: schemaString('Optional app URL. Defaults to the current inspector page or local app.')
      }, ['text']),
      tool('app_check_layout_issues', 'Detect common visible layout problems: overlap, overflow, offscreen elements, clipped modals, small controls, and tiny previews.', 'read', {
        url: schemaString('Optional app URL. Defaults to the current inspector page or local app.'),
        maxIssues: schemaNumber('Maximum issues to return.')
      }),
      tool('app_run_smoke_tour', 'Safely open and close major Architect\'s Domain product surfaces and return a structured QA report.', 'write', {
        url: schemaString('Optional app URL. Defaults to the local Architect\'s Domain server.')
      }),
      tool('app_get_console_errors', 'Return console warnings/errors and page errors captured by the inspector session.', 'read', {
        url: schemaString('Optional app URL. Defaults to the current inspector page or local app.'),
        includeWarnings: schemaBoolean('Include warnings as well as errors.', true)
      }),
      tool('app_screenshot_region', 'Capture a PNG screenshot of the viewport, full page, current modal, selected element, or square crop.', 'read', {
        mode: schemaString('Screenshot mode.', { enum: ['viewport', 'modal', 'element', 'square', 'fullPage'], default: 'viewport' }),
        selector: schemaString('CSS selector for element mode, or optional crop anchor.'),
        url: schemaString('Optional app URL. Defaults to the current inspector page or local app.')
      })
    ],
    resources: []
  };
}

async function testAppInspector(config = {}) {
  const root = resolveRoot(config);
  await fs.promises.access(path.join(root, 'index.html'));
  return {
    ok: true,
    label: root,
    tools: getAppInspectorAdapter().tools,
    resources: [{ uri: `app://${root}`, name: 'Architect\'s Domain', description: 'Local app project' }]
  };
}

async function callAppInspectorTool(config = {}, toolName, args = {}) {
  const root = resolveRoot(config);
  if (toolName === 'app.health') return appHealth(root);
  if (toolName === 'app.project_structure') return projectStructure(root);
  if (toolName === 'app.read_package') return readPackage(root);
  if (toolName === 'app_get_screen_summary') return withPage(config, args, page => getScreenSummary(page, args));
  if (toolName === 'app_get_interactive_elements') return withPage(config, args, page => getInteractiveElements(page, args));
  if (toolName === 'app_click_by_text') return withPage(config, args, page => clickByText(page, args));
  if (toolName === 'app_check_layout_issues') return withPage(config, args, page => checkLayoutIssues(page, args));
  if (toolName === 'app_run_smoke_tour') return withPage(config, args, page => runSmokeTour(page));
  if (toolName === 'app_get_console_errors') return withPage(config, args, page => getConsoleErrors(page, args));
  if (toolName === 'app_screenshot_region') return withPage(config, args, page => screenshotRegion(page, args));
  throw new Error(`Unknown app inspector tool: ${toolName}`);
}

async function listAppInspectorResources(config = {}) {
  const root = resolveRoot(config);
  return [{ uri: `app://${root}`, name: 'Architect\'s Domain', description: 'Local app project' }];
}

async function readAppInspectorResource(config = {}, uri) {
  if (!String(uri || '').startsWith('app://')) throw new Error('Unsupported app resource URI');
  return appHealth(resolveRoot(config));
}

async function withPage(config = {}, args = {}, callback) {
  const page = await getInspectorPage(config, args);
  const result = await callback(page);
  const privacyMode = await getPrivacyMode(page);
  return privacyMode ? redactPrivateData(result) : result;
}

async function getInspectorPage(config = {}, args = {}) {
  const targetUrl = resolveTargetUrl(config, args);
  if (!session.browser) {
    session.browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  if (!session.page || session.page.isClosed()) {
    session.page = await session.browser.newPage();
    wireConsole(session.page);
  }
  if (!session.url || session.url !== targetUrl || !session.page.url().startsWith(targetUrl.split('#')[0])) {
    await session.page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await session.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await session.page.waitForSelector('#messageInput, #emptyState, #messagesList', { timeout: 10000 }).catch(() => {});
    await wait(500);
    session.url = targetUrl;
  }
  return session.page;
}

function wireConsole(page) {
  page.on('console', message => {
    const entry = {
      timestamp: new Date().toISOString(),
      type: message.type(),
      text: message.text(),
      location: message.location()
    };
    session.consoleEntries.push(entry);
    session.consoleEntries = session.consoleEntries.slice(-CONSOLE_LIMIT);
  });
  page.on('pageerror', error => {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'pageerror',
      text: error.message || String(error),
      stack: error.stack || ''
    };
    session.pageErrors.push(entry);
    session.pageErrors = session.pageErrors.slice(-CONSOLE_LIMIT);
  });
}

async function appHealth(root) {
  const pkg = await readPackage(root);
  const required = ['index.html', 'server.js', 'scripts', 'styles', 'bridge'];
  const files = await Promise.all(required.map(async item => ({
    name: item,
    exists: fs.existsSync(path.join(root, item))
  })));
  return {
    root,
    node: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    package: pkg,
    requiredFiles: files,
    bridge: { ok: true, presets: APP_INSPECTOR_PRESETS }
  };
}

async function projectStructure(root) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  return {
    root,
    entries: entries
      .filter(entry => !['node_modules', '.git'].includes(entry.name))
      .map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
  };
}

async function readPackage(root) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf8'));
  return {
    name: pkg.name,
    version: pkg.version,
    private: pkg.private,
    type: pkg.type,
    scripts: pkg.scripts || {},
    engines: pkg.engines || {}
  };
}

async function getScreenSummary(page, args = {}) {
  return page.evaluate(({ includeButtons }) => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const text = element => element ? (element.innerText || element.textContent || element.getAttribute('aria-label') || element.title || '').replace(/\s+/g, ' ').trim() : '';
    const bySelector = selector => Array.from(document.querySelectorAll(selector)).filter(visible);
    const openModals = bySelector('.modal-overlay.open, dialog[open]').map(modal => ({
      id: modal.id || '',
      title: text(modal.querySelector('.modal-title, h1, h2, h3') || modal).slice(0, 120),
      selector: stableSelector(modal)
    }));
    const visiblePanels = bySelector('.settings-panel.open, .model-dropdown.open, .context-inspector-panel.open, .export-panel.open, .system-prompt-container:not(.collapsed), .pinned-context-container:not(.collapsed), .memory-suggestions:not([hidden])')
      .map(panel => ({ id: panel.id || '', label: text(panel.querySelector('h1,h2,h3,.settings-title,[class$="-title"]') || panel).slice(0, 120), selector: stableSelector(panel) }));
    const buttons = includeButtons ? bySelector('button,a,[role="button"]').map(button => ({
      text: controlLabel(button),
      selector: stableSelector(button),
      disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true')
    })).filter(item => item.text).slice(0, 80) : [];
    const inputs = bySelector('input,textarea,select').map(input => ({
      label: controlLabel(input),
      selector: stableSelector(input),
      type: input.tagName.toLowerCase() === 'select' ? 'select' : (input.type || input.tagName.toLowerCase()),
      disabled: Boolean(input.disabled)
    })).slice(0, 80);
    const errors = bySelector('.error,.toast.error,[role="alert"],.mcp-card-error').map(error => text(error).slice(0, 200)).filter(Boolean);
    const emptyStates = bySelector('.empty-state,.memory-empty,.context-source-empty,.mcp-control-empty,.chat-empty').map(empty => text(empty).slice(0, 200)).filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      route: location.hash || location.pathname || '/',
      screen: openModals[0]?.title || (document.querySelector('.empty-state-title') ? 'Chat empty state' : 'Chat workspace'),
      openModals,
      visiblePanels,
      visibleButtons: buttons,
      visibleInputs: inputs,
      activeChat: text(document.querySelector('.chat-item.active, .conversation-title')).slice(0, 120),
      activeModel: text(document.querySelector('#selectedModelName')).slice(0, 120),
      activeProvider: text(document.querySelector('#selectedProviderName')).slice(0, 80),
      activeWorkspace: text(document.querySelector('#workspaceName')).slice(0, 120),
      emptyStates,
      errorStates: errors,
      viewport: { width: innerWidth, height: innerHeight }
    };

    function controlLabel(element) {
      return (element.getAttribute('aria-label') || element.title || element.placeholder || element.innerText || element.value || '').replace(/\s+/g, ' ').trim();
    }
    function stableSelector(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      for (const attr of ['data-memory-action', 'data-mcp-action', 'data-mcp-test-tool', 'data-mcp-run-tool', 'data-preset']) {
        const value = element.getAttribute(attr);
        if (value) return `[${attr}="${CSS.escape(value)}"]`;
      }
      const tag = element.tagName.toLowerCase();
      const parent = element.parentElement;
      if (!parent) return tag;
      const index = Array.from(parent.children).filter(child => child.tagName === element.tagName).indexOf(element) + 1;
      return `${stableSelector(parent)} > ${tag}:nth-of-type(${index})`;
    }
  }, { includeButtons: args.includeButtons !== false });
}

async function getInteractiveElements(page, args = {}) {
  return page.evaluate(({ includeHidden }) => {
    const elements = Array.from(document.querySelectorAll('button,a[href],input,textarea,select,[role="button"],[tabindex]:not([tabindex="-1"])'));
    const rows = elements.map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      if (!includeHidden && !visible) return null;
      return {
        text: controlLabel(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || implicitRole(element),
        selector: stableSelector(element),
        region: regionFor(element),
        visible,
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        bounds: rectPayload(rect)
      };
    }).filter(Boolean);
    return {
      url: location.href,
      count: rows.length,
      groups: rows.reduce((groups, row) => {
        const group = groups.find(item => item.region === row.region);
        if (group) group.elements.push(row);
        else groups.push({ region: row.region, elements: [row] });
        return groups;
      }, [])
    };

    function controlLabel(element) {
      const label = element.labels && element.labels[0] ? element.labels[0].innerText : '';
      return (element.getAttribute('aria-label') || element.title || element.placeholder || label || element.innerText || element.value || '').replace(/\s+/g, ' ').trim();
    }
    function implicitRole(element) {
      const tag = element.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'select') return 'select';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') return element.type || 'input';
      return '';
    }
    function regionFor(element) {
      const region = element.closest('.modal-overlay.open,.sidebar,.top-header,.composer,.settings-panel,.model-dropdown,.main-container,.context-inspector-panel');
      if (!region) return 'page';
      return region.id || Array.from(region.classList).find(Boolean) || region.tagName.toLowerCase();
    }
    function rectPayload(rect) {
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    function stableSelector(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      for (const attr of ['data-memory-action', 'data-mcp-action', 'data-mcp-test-tool', 'data-mcp-run-tool', 'data-preset']) {
        const value = element.getAttribute(attr);
        if (value) return `[${attr}="${CSS.escape(value)}"]`;
      }
      const tag = element.tagName.toLowerCase();
      const parent = element.parentElement;
      if (!parent) return tag;
      const index = Array.from(parent.children).filter(child => child.tagName === element.tagName).indexOf(element) + 1;
      return `${stableSelector(parent)} > ${tag}:nth-of-type(${index})`;
    }
  }, { includeHidden: Boolean(args.includeHidden) });
}

async function clickByText(page, args = {}) {
  const requestedText = String(args.text || '').trim();
  if (!requestedText) throw new Error('app_click_by_text requires text');
  const matchReport = await page.evaluate(({ requestedText, exact }) => {
    const needle = normalize(requestedText);
    const candidates = Array.from(document.querySelectorAll('button,a[href],[role="button"]')).map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      const label = (element.getAttribute('aria-label') || element.title || element.innerText || element.value || '').replace(/\s+/g, ' ').trim();
      const normalized = normalize(label);
      const score = normalized === needle ? 100 : normalized.includes(needle) ? 80 : fuzzyScore(normalized, needle);
      return {
        label,
        normalized,
        selector: stableSelector(element),
        visible,
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        destructive: isDestructive(label),
        score
      };
    }).filter(item => item.visible && !item.disabled && item.label && (exact ? item.normalized === needle : item.score >= 50))
      .sort((a, b) => b.score - a.score || a.label.length - b.label.length);
    return { requestedText, candidates };

    function normalize(value) {
      return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }
    function fuzzyScore(label, needle) {
      if (!label || !needle) return 0;
      const words = needle.split(/\s+/).filter(Boolean);
      const hits = words.filter(word => label.includes(word)).length;
      return hits ? Math.round((hits / words.length) * 70) : 0;
    }
    function isDestructive(label) {
      return /\b(delete|clear|reset|remove|disable|revoke|overwrite|import|full reset)\b/i.test(label);
    }
    function stableSelector(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      for (const attr of ['data-memory-action', 'data-mcp-action', 'data-mcp-test-tool', 'data-mcp-run-tool', 'data-preset']) {
        const value = element.getAttribute(attr);
        if (value) return `[${attr}="${CSS.escape(value)}"]`;
      }
      const tag = element.tagName.toLowerCase();
      const parent = element.parentElement;
      if (!parent) return tag;
      const index = Array.from(parent.children).filter(child => child.tagName === element.tagName).indexOf(element) + 1;
      return `${stableSelector(parent)} > ${tag}:nth-of-type(${index})`;
    }
  }, { requestedText, exact: Boolean(args.exact) });

  if (!matchReport.candidates.length) {
    return { clicked: false, reason: 'no_match', requestedText, suggestions: await getClickSuggestions(page, requestedText) };
  }
  const bestScore = matchReport.candidates[0].score;
  const closeMatches = matchReport.candidates.filter(item => item.score === bestScore);
  if (closeMatches.length > 1) {
    return { clicked: false, reason: 'multiple_matches', requestedText, matches: closeMatches.slice(0, 8) };
  }
  const match = matchReport.candidates[0];
  if (match.destructive && !args.approved) {
    return { clicked: false, requiresApproval: true, reason: 'destructive_action_blocked', requestedText, match };
  }
  await page.click(match.selector);
  await wait(250);
  return { clicked: true, requestedText, match, screen: await getScreenSummary(page, { includeButtons: false }) };
}

async function getClickSuggestions(page, requestedText) {
  const elements = await getInteractiveElements(page, {});
  const flat = elements.groups.flatMap(group => group.elements).filter(item => ['button', 'link'].includes(item.role));
  return flat
    .map(item => ({ text: item.text, selector: item.selector, region: item.region }))
    .filter(item => item.text)
    .slice(0, 12);
}

async function checkLayoutIssues(page, args = {}) {
  const maxIssues = Number(args.maxIssues) > 0 ? Number(args.maxIssues) : 80;
  return page.evaluate(({ maxIssues }) => {
    const viewport = { width: innerWidth, height: innerHeight };
    const candidates = Array.from(document.querySelectorAll('body *')).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).slice(0, 900);
    const issues = [];
    const bodyOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (bodyOverflow > 2) issues.push(issue('horizontal_overflow', 'Page has horizontal overflow.', document.documentElement, { overflowPx: Math.round(bodyOverflow) }));

    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.right > viewport.width + 2 || rect.left < -2 || rect.bottom < -2 || rect.top > viewport.height + 2) {
        issues.push(issue('outside_viewport', 'Visible element extends outside the viewport.', element));
      }
      if (element.scrollWidth > element.clientWidth + 2 && hasText(element)) {
        issues.push(issue('text_overflow', 'Text or content overflows horizontally.', element, { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      }
      if (element.scrollHeight > element.clientHeight + 8 && hasText(element) && !isScrollable(element)) {
        issues.push(issue('content_clipped', 'Content appears clipped without scroll.', element, { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
      }
      if (isInteractive(element) && (rect.width < 32 || rect.height < 28)) {
        issues.push(issue('small_control', 'Interactive control is smaller than recommended touch target.', element));
      }
      if (/screenshot|preview|thumbnail|image/i.test(element.className || '') && (rect.width < 80 || rect.height < 50)) {
        issues.push(issue('tiny_preview', 'Preview or screenshot appears tiny.', element));
      }
    }

    const visible = candidates.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 8 && rect.height >= 8 && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
    });
    for (let i = 0; i < visible.length; i += 1) {
      const a = visible[i];
      const ar = a.getBoundingClientRect();
      if (!isMeaningfulBox(a)) continue;
      for (let j = i + 1; j < Math.min(visible.length, i + 80); j += 1) {
        const b = visible[j];
        if (a.contains(b) || b.contains(a) || !isMeaningfulBox(b)) continue;
        const br = b.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left)) * Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
        if (overlap > 1600 && overlap / Math.min(ar.width * ar.height, br.width * br.height) > 0.35) {
          issues.push({ type: 'overlap', severity: 'medium', message: 'Visible elements appear to overlap.', selectors: [stableSelector(a), stableSelector(b)], bounds: [rectPayload(ar), rectPayload(br)] });
        }
      }
    }

    for (const modal of document.querySelectorAll('.modal-overlay.open .modal')) {
      const rect = modal.getBoundingClientRect();
      if (rect.bottom > viewport.height + 2 || rect.top < -2) issues.push(issue('modal_content_clipped', 'Open modal content is clipped by viewport.', modal));
    }

    return {
      url: location.href,
      viewport,
      issueCount: issues.length,
      issues: issues.slice(0, maxIssues)
    };

    function issue(type, message, element, details = {}) {
      return { type, severity: severityFor(type), message, selector: stableSelector(element), text: label(element).slice(0, 120), bounds: rectPayload(element.getBoundingClientRect()), details };
    }
    function severityFor(type) {
      return ['horizontal_overflow', 'modal_content_clipped', 'overlap'].includes(type) ? 'high' : 'medium';
    }
    function hasText(element) {
      return (element.innerText || element.textContent || '').trim().length > 0;
    }
    function isScrollable(element) {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
    }
    function isInteractive(element) {
      return element.matches('button,a,input,textarea,select,[role="button"]');
    }
    function isMeaningfulBox(element) {
      return element.matches('button,a,input,textarea,select,.modal,.panel,.card,.message-bubble,.settings-panel,.model-dropdown,.memory-item,.mcp-tool-card');
    }
    function label(element) {
      return (element.getAttribute('aria-label') || element.title || element.innerText || '').replace(/\s+/g, ' ').trim();
    }
    function rectPayload(rect) {
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    function stableSelector(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const tag = element.tagName.toLowerCase();
      const parent = element.parentElement;
      if (!parent) return tag;
      const index = Array.from(parent.children).filter(child => child.tagName === element.tagName).indexOf(element) + 1;
      return `${stableSelector(parent)} > ${tag}:nth-of-type(${index})`;
    }
  }, { maxIssues });
}

async function runSmokeTour(page) {
  const startedAt = new Date().toISOString();
  const consoleStart = session.consoleEntries.length + session.pageErrors.length;
  const surfaces = [
    { name: 'model picker', open: '#modelSelectorBtn', verify: '#modelDropdown.open', close: '#modelSelectorBtn' },
    { name: 'system prompt', open: '#systemPromptHeader', verify: '#systemPromptContainer:not(.collapsed)', close: '#systemPromptHeader' },
    { name: 'pinned context', open: '#pinnedContextHeader', verify: '#pinnedContextContainer:not(.collapsed)', close: '#pinnedContextHeader' },
    { name: 'MCP Operations Center', open: '#mcpControlCenterBtn', verify: '#mcpControlCenterModal.open', close: '#mcpControlCloseBtn' },
    { name: 'Memory Manager', open: '#memoryManagerBtn', verify: '#memoryModal.open', close: '#memoryCloseBtn' },
    { name: 'Workspace Manager', open: '#workspaceManageBtn', verify: '#workspaceModal.open', close: '#workspaceCloseBtn' },
    { name: 'settings panel', open: '#settingsBtn', verify: '#settingsPanel.open', close: '#settingsBtn' },
    { name: 'Data Manager', open: '#settingsBtn', verifyOpenFirst: '#settingsPanel.open', secondary: '#dataManagerBtn', verify: '#dataManagerModal.open', close: '#dataManagerCloseBtn' }
  ];
  const results = [];
  await closeTransientSurfaces(page);
  for (const surface of surfaces) {
    const item = { name: surface.name, opened: false, rendered: false, closed: false, errors: [] };
    try {
      if (surface.verifyOpenFirst) {
        await clickSelector(page, surface.open);
        await page.waitForSelector(surface.verifyOpenFirst, { timeout: 2000 });
        await clickSelector(page, surface.secondary);
      } else {
        await clickSelector(page, surface.open);
      }
      await page.waitForSelector(surface.verify, { timeout: 3000 });
      item.opened = true;
      item.rendered = await page.$eval(surface.verify, element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (surface.close) await clickSelector(page, surface.close);
      else if (surface.closeKey) await page.keyboard.press(surface.closeKey);
      await wait(250);
      item.closed = !(await page.$(surface.verify));
      if (!item.closed) await closeTransientSurfaces(page);
    } catch (error) {
      item.errors.push(error.message || String(error));
      await closeTransientSurfaces(page);
    }
    results.push(item);
  }
  const consoleAfter = session.consoleEntries.concat(session.pageErrors).slice(consoleStart);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: results.every(item => item.opened && item.rendered && item.closed) && consoleAfter.filter(item => ['error', 'pageerror'].includes(item.type)).length === 0,
    surfaces: results,
    consoleIssues: consoleAfter.filter(item => ['error', 'warning', 'pageerror'].includes(item.type))
  };
}

async function getConsoleErrors(page, args = {}) {
  await page.evaluate(() => location.href);
  const includeWarnings = args.includeWarnings !== false;
  const entries = session.consoleEntries.concat(session.pageErrors)
    .filter(entry => ['error', 'pageerror'].includes(entry.type) || (includeWarnings && entry.type === 'warning'))
    .slice(-CONSOLE_LIMIT);
  return { url: page.url(), count: entries.length, consoleEntries: entries };
}

async function screenshotRegion(page, args = {}) {
  const mode = args.mode || 'viewport';
  let options = { encoding: 'base64', fullPage: false };
  let selector = args.selector || '';
  if (mode === 'fullPage') options = { encoding: 'base64', fullPage: true };
  if (mode === 'modal') selector = selector || '.modal-overlay.open .modal, .modal-overlay.open';
  if (mode === 'square') {
    const viewport = page.viewport() || { width: 1000, height: 1000 };
    const size = Math.min(viewport.width, viewport.height);
    options.clip = { x: Math.round((viewport.width - size) / 2), y: Math.round((viewport.height - size) / 2), width: size, height: size };
  }
  if (mode === 'element' || mode === 'modal') {
    const handle = await page.$(selector);
    if (!handle) throw new Error(`No visible element found for selector: ${selector}`);
    const box = await handle.boundingBox();
    if (!box) throw new Error(`Element has no screenshot bounds: ${selector}`);
    options.clip = {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.max(1, Math.ceil(box.width)),
      height: Math.max(1, Math.ceil(box.height))
    };
  }
  const screenshotBase64 = await page.screenshot(options);
  return { url: page.url(), mode, selector, screenshotBase64 };
}

async function closeTransientSurfaces(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await wait(150);
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay.open').forEach(element => element.classList.remove('open'));
    document.querySelectorAll('.settings-panel.open,.model-dropdown.open,.context-inspector-panel.open,.export-panel.open').forEach(element => element.classList.remove('open'));
  });
}

async function clickSelector(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 3000 });
  await page.click(selector);
  await wait(250);
}

async function getPrivacyMode(page) {
  try {
    return await page.evaluate(() => {
      try {
        const settings = JSON.parse(localStorage.getItem('architects_domain_settings') || '{}');
        return Boolean(settings?.mcpControl?.privacyMode || localStorage.getItem('architects_domain_mcp_privacy_mode') === 'true');
      } catch (_) {
        return localStorage.getItem('architects_domain_mcp_privacy_mode') === 'true';
      }
    });
  } catch (_) {
    return false;
  }
}

function redactPrivateData(value) {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactPrivateData);
  if (typeof value === 'object') {
    const redacted = {};
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = /api.?key|token|secret|path|root|cwd/i.test(key) ? redactString(String(item || '')) : redactPrivateData(item);
    }
    return redacted;
  }
  return value;
}

function redactString(value) {
  return String(value || '')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '[local path]')
    .replace(/\/(?:Users|home)\/[^\s"']+/g, '[local path]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{32,})\b/g, '[secret]');
}

function resolveTargetUrl(config = {}, args = {}) {
  const configured = args.url || config.targetUrl || process.env.APP_INSPECTOR_URL;
  if (configured) return String(configured);
  const port = process.env.PORT || config.port || 3000;
  return `http://127.0.0.1:${port}`;
}

function resolveRoot(config = {}) {
  return path.resolve(String(config.root || process.cwd()));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('exit', () => {
  if (session.browser) session.browser.close().catch(() => {});
});

module.exports = { getAppInspectorAdapter, testAppInspector, callAppInspectorTool, listAppInspectorResources, readAppInspectorResource };
