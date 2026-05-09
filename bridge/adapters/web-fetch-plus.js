function getWebFetchPlusAdapter() {
  return {
    type: 'web-fetch-plus',
    label: 'Web Fetch Plus',
    description: 'Fetch web pages and extract readable title, text, links, and metadata.',
    tools: [{
      name: 'web.fetch_readable',
      description: 'Fetch an HTTP/HTTPS page and extract readable text, title, links, and metadata.',
      safety: 'network',
      inputSchema: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string' }, maxLength: { type: 'number' } }
      }
    }],
    resources: []
  };
}

async function testWebFetchPlus() {
  return { ok: true, label: 'Readable web fetch ready', tools: getWebFetchPlusAdapter().tools, resources: [] };
}

async function callWebFetchPlusTool(config = {}, toolName, args = {}) {
  if (toolName !== 'web.fetch_readable') throw new Error(`Unknown web fetch plus tool: ${toolName}`);
  const target = new URL(String(args.url || ''));
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(target, { signal: controller.signal, headers: { Accept: 'text/html,text/plain,application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.text();
    const html = raw.slice(0, 800000);
    const title = extractTag(html, 'title') || target.href;
    const description = extractMeta(html, 'description');
    const links = extractLinks(html, target).slice(0, 40);
    const text = htmlToReadableText(html).slice(0, Math.min(Math.max(Number(args.maxLength) || 20000, 1000), 80000));
    return {
      url: target.href,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      title,
      description,
      links,
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function listWebFetchPlusResources() {
  return [];
}

async function readWebFetchPlusResource() {
  throw new Error('Web fetch plus resources are not browsable');
}

function extractTag(html, tag) {
  const match = String(html || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeHtml(match[1]).trim() : '';
}

function extractMeta(html, name) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["'](?:${name}|og:${name})["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const match = String(html || '').match(pattern);
  return match ? decodeHtml(match[1]).trim() : '';
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const href = new URL(match[1], baseUrl).href;
      const label = htmlToReadableText(match[2]).slice(0, 120);
      links.push({ href, label });
    } catch (error) {
      continue;
    }
  }
  return links;
}

function htmlToReadableText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

module.exports = { getWebFetchPlusAdapter, testWebFetchPlus, callWebFetchPlusTool, listWebFetchPlusResources, readWebFetchPlusResource };
