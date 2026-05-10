// Syntax Highlighting (lightweight)
    // ============================================
    const syntaxPatterns = {
        comment: { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|<!--[\s\S]*?-->)/gm, class: 'hljs-comment' },
        string: { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, class: 'hljs-string' },
        keyword: { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|static|get|set|typeof|instanceof|in|of|void|delete|yield|public|private|protected|interface|type|enum|implements|abstract|readonly|declare|namespace|module|require|def|self|lambda|elif|except|raise|pass|with|as|global|nonlocal|assert|True|False|None|and|or|not|is|fn|let|mut|impl|trait|pub|use|mod|crate|where|loop|match|move|ref|struct|dyn|Box|Vec|Option|Result|Some|Ok|Err|println|print|fmt|func|package|import|defer|go|chan|select|fallthrough|range|map|make|append|cap|len|copy|close|panic|recover|nil|true|false|iota|int|string|bool|float|interface|error|byte|rune|uintptr)\b/g, class: 'hljs-keyword' },
        function: { pattern: /\b([a-zA-Z_]\w*)\s*(?=\()/g, class: 'hljs-function' },
        number: { pattern: /\b(\d+\.?\d*([eE][+-]?\d+)?|0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+)\b/g, class: 'hljs-number' },
        type: { pattern: /\b([A-Z][a-zA-Z0-9_]*)\b/g, class: 'hljs-type' },
        property: { pattern: /\.([a-zA-Z_]\w*)/g, class: 'hljs-property' },
        punctuation: { pattern: /([{}[\]();,.:?]|=>|->|::|\|\||&&|[+\-*/%=<>!&|^~]+)/g, class: 'hljs-punctuation' }
    };

    function highlightCode(code, lang) {
        let highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const tokens = [];
        
        // Extract strings and comments first (preserve them)
        highlighted = highlighted.replace(syntaxPatterns.string.pattern, (match) => {
            const id = `__TOKEN_${tokens.length}__`;
            tokens.push(`<span class="${syntaxPatterns.string.class}">${match}</span>`);
            return id;
        });
        highlighted = highlighted.replace(syntaxPatterns.comment.pattern, (match) => {
            const id = `__TOKEN_${tokens.length}__`;
            tokens.push(`<span class="${syntaxPatterns.comment.class}">${match}</span>`);
            return id;
        });
        
        // Apply other patterns
        highlighted = highlighted.replace(syntaxPatterns.keyword.pattern, '<span class="hljs-keyword">$1</span>');
        highlighted = highlighted.replace(syntaxPatterns.function.pattern, '<span class="hljs-function">$1</span>(');
        highlighted = highlighted.replace(syntaxPatterns.number.pattern, '<span class="hljs-number">$1</span>');
        highlighted = highlighted.replace(syntaxPatterns.type.pattern, '<span class="hljs-type">$1</span>');
        
        // Restore tokens
        tokens.forEach((token, i) => {
            highlighted = highlighted.replace(`__TOKEN_${i}__`, token);
        });
        
        return highlighted;
    }

    function normalizeStreamingMarkdown(content) {
        const text = String(content ?? '');
        const fenceMatches = text.match(/```/g);
        if (!fenceMatches || fenceMatches.length % 2 === 0) return text;

        const lastFenceStart = text.lastIndexOf('```');
        const afterFence = text.slice(lastFenceStart + 3);
        if (!afterFence.includes('\n')) return text;

        return text + (text.endsWith('\n') ? '' : '\n') + '```';
    }

    function sanitizeMarkdownUrl(url) {
        const trimmed = String(url || '').trim().replace(/&amp;/g, '&');
        if (/^(https?:|mailto:)/i.test(trimmed) || /^[./#][^\s]*$/.test(trimmed)) {
            return trimmed.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
        }
        return '#';
    }

    function decodeSafeMarkdownEntities(text) {
        const entities = {
            amp: '&', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', nbsp: ' ',
            alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4', epsilon: '\u03b5',
            zeta: '\u03b6', eta: '\u03b7', theta: '\u03b8', lambda: '\u03bb', mu: '\u03bc',
            pi: '\u03c0', sigma: '\u03c3', tau: '\u03c4', phi: '\u03c6', omega: '\u03c9'
        };
        return String(text || '').replace(/&amp;(#[0-9]+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
            const key = entity.toLowerCase();
            if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16) || 0);
            if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10) || 0);
            return Object.prototype.hasOwnProperty.call(entities, key) ? entities[key] : match;
        });
    }

    function allowSafeEscapedHtmlTags(text) {
        return String(text || '')
            .replace(/&lt;(u|sup|sub)(?:\s+[^&]*?)?&gt;/gi, '<$1>')
            .replace(/&lt;\/(u|sup|sub)&gt;/gi, '</$1>')
            .replace(/&lt;br(?:\s+[^&]*?)?\s*\/?&gt;/gi, '<br>');
    }

    function sanitizeMarkdownImageUrl(url) {
        const sanitized = sanitizeMarkdownUrl(url);
        return sanitized === '#' ? '' : sanitized;
    }

    function cleanupOrphanEmphasisMarkers(text) {
        return String(text || '')
            .replace(/(\S)\*\*(?=(?:\s|<|$))/g, '$1')
            .replace(/(^|[\s>])\*\*(?=(?:\s|<|$))/g, '$1')
            .replace(/([:;,.!?])\*\*(?=\S)/g, '$1 ')
            .replace(/([:;,.!?])\*(?=\S)/g, '$1 ');
    }

    function formatInlineMarkdownFragment(fragment) {
        const inlineCode = [];
        let text = String(fragment || '').replace(/`([^`\n]+)`/g, (match, code) => {
            const placeholder = `@@IC${inlineCode.length}@@`;
            inlineCode.push(`<code>${decodeSafeMarkdownEntities(code)}</code>`);
            return placeholder;
        });

        text = decodeSafeMarkdownEntities(text)
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
                const safeUrl = sanitizeMarkdownImageUrl(url);
                return safeUrl
                    ? `<img class="md-image" src="${safeUrl}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy">`
                    : `!&#91;${alt}&#93;(${url})`;
            })
            .replace(/\*\*\*([^\n*](?:[^\n]*?[^\n*])?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*([^\n*](?:[^\n]*?[^\n*])?)\*\*/g, '<strong>$1</strong>')
            .replace(/~~([^\n~](?:[^\n]*?[^\n~])?)~~/g, '<del>$1</del>')
            .replace(/(?<!\*)\*([^\n*\s](?:[^\n*]*?[^\n*\s])?)\*(?!\*)/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => `<a href="${sanitizeMarkdownUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);

        text = cleanupOrphanEmphasisMarkers(text);
        inlineCode.forEach((code, index) => {
            text = text.replace(`@@IC${index}@@`, code);
        });
        return text;
    }

    function splitMarkdownTableRow(line) {
        const trimmed = String(line || '').trim();
        const body = trimmed.startsWith('|') ? trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined) : trimmed;
        return body.split('|').map(cell => cell.trim());
    }

    function isMarkdownTableSeparator(line) {
        const cells = splitMarkdownTableRow(line);
        return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
    }

    function renderMarkdownTables(text) {
        const lines = String(text || '').split('\n');
        const out = [];
        for (let i = 0; i < lines.length; i += 1) {
            if (i + 1 >= lines.length || !lines[i].includes('|') || !isMarkdownTableSeparator(lines[i + 1])) {
                out.push(lines[i]);
                continue;
            }
            const headers = splitMarkdownTableRow(lines[i]);
            const rows = [];
            i += 2;
            while (i < lines.length && lines[i].includes('|') && splitMarkdownTableRow(lines[i]).length >= 2) {
                rows.push(splitMarkdownTableRow(lines[i]));
                i += 1;
            }
            i -= 1;
            const head = headers.map(cell => `<th>${formatInlineMarkdownFragment(cell)}</th>`).join('');
            const body = rows.map(row => `<tr>${headers.map((_, index) => `<td>${formatInlineMarkdownFragment(row[index] || '')}</td>`).join('')}</tr>`).join('');
            out.push(`<table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
        }
        return out.join('\n');
    }

    function renderMarkdownLists(text) {
        const lines = String(text || '').split('\n');
        const out = [];
        const stack = [];
        const closeTo = (level = 0) => {
            while (stack.length > level) out.push(`</li></${stack.pop().type}>`);
        };
        const openList = (type) => {
            out.push(`<${type}>`);
            stack.push({ type, hasOpenItem: false });
        };

        for (const line of lines) {
            const match = line.match(/^(\s*)(?:(\d+)\.|[-*])\s+(\[[ xX]\]\s+)?(.+)$/);
            if (!match) {
                closeTo(0);
                out.push(line);
                continue;
            }

            const indent = Math.floor(match[1].replace(/\t/g, '    ').length / 3);
            const type = match[2] ? 'ol' : 'ul';
            const task = match[3] || '';
            const checked = /\[[xX]\]/.test(task);
            const itemText = formatInlineMarkdownFragment(match[4]);
            closeTo(indent + 1);
            while (stack.length <= indent || stack[stack.length - 1].type !== type) openList(type);
            const current = stack[stack.length - 1];
            if (current.hasOpenItem) out.push('</li>');
            current.hasOpenItem = true;
            const taskHtml = task
                ? `<input type="checkbox" disabled${checked ? ' checked' : ''}> `
                : '';
            out.push(`<li${task ? ' class="task-list-item"' : ''}>${taskHtml}${itemText}`);
        }
        closeTo(0);
        return out.join('\n');
    }

    function formatMessageContent(content, forEdit = false, isStreaming = false) {
        if (forEdit) return content;

        let formatted = isStreaming ? normalizeStreamingMarkdown(content) : String(content ?? '');

        // 1. Extract code blocks FIRST (before any text processing)
        const codeBlocks = [];
        formatted = formatted.replace(/```([a-zA-Z0-9_+#-]*)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || '';
            const rawCode = code.replace(/\n$/, '');
            const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
            const placeholder = `@@CB${codeBlocks.length}@@`;
            const langEsc = language.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            codeBlocks.push(`<div class="code-block" data-code-id="${codeId}">
                <div class="code-block-header">
                    <span class="code-block-lang">${langEsc || 'code'}</span>
                    <button class="code-copy-btn" onclick="copyCode('${codeId}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>Copy</span>
                    </button>
                </div>
                <pre><code data-raw="${encodeURIComponent(rawCode)}">${highlightCode(rawCode, language)}</code></pre>
            </div>`);
            return placeholder;
        });

        // 2. Sanitize citation artifacts on NON-CODE text only
        formatted = formatted
            .replace(/\[\^?\d+\]/g, '')
            .replace(/\^\d+/g, '')
            .trim();

        // 3. Escape HTML in remaining text (code blocks already protected as placeholders)
        formatted = formatted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        formatted = allowSafeEscapedHtmlTags(formatted);
        formatted = decodeSafeMarkdownEntities(formatted);
        formatted = renderMarkdownTables(formatted);

        // 4. Block-level markdown
        formatted = formatted
            .replace(/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '<hr>')
            .replace(/^ {0,3}([*_])\s*$/gm, '<p class="md-literal-marker">$1</p>')
            .replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>')
            .replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
            .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

        // 5. Inline formatting (bold, italic, strikethrough, inline code, links)
        formatted = formatInlineMarkdownFragment(formatted);

        // 6. Lists
        formatted = renderMarkdownLists(formatted);

        // 7. Paragraphs: split on double-newline, wrap each in <p>
        const paragraphs = formatted.split(/\n\n+/);
        formatted = paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            if (/^<(h[1-4]|p|ul|ol|li|table|blockquote|hr|div|pre)|^@@CB\d+@@/.test(trimmed)) return trimmed;
            return '<p>' + trimmed.replace(/\n/g, '<br>').replace(/\s{2,}/g, ' ') + '</p>';
        }).join('');

        // 8. Restore code blocks (with wrapped <p> cleanup)
        codeBlocks.forEach((block, i) => {
            const ph = `@@CB${i}@@`;
            formatted = formatted.replace('<p>' + ph + '</p>', block);
            formatted = formatted.replace(ph, block);
        });

        // 9. Cleanup empty paragraphs
        formatted = formatted.replace(/<p>\s*<\/p>/g, '');

        return formatted;
    }
