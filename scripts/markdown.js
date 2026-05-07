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

        // 4. Headers
        formatted = formatted
            .replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
            .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

        // 5. Inline formatting (bold, italic, inline code, links)
        formatted = formatted
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 6. Lists
        formatted = formatted.replace(/((?:^|\n)\d+\.\s+.+(?:\n|$))+/gm, (match) => {
            const items = match.trim().split(/\n/).filter(l => /^\d+\.\s+/.test(l)).map(l => '<li>' + l.replace(/^\d+\.\s+/, '') + '</li>');
            return items.length ? '<ol>' + items.join('') + '</ol>' : match;
        });
        formatted = formatted.replace(/((?:^|\n)[\*\-]\s+.+(?:\n|$))+/gm, (match) => {
            const items = match.trim().split(/\n/).filter(l => /^[\*\-]\s+/.test(l)).map(l => '<li>' + l.replace(/^[\*\-]\s+/, '') + '</li>');
            return items.length ? '<ul>' + items.join('') + '</ul>' : match;
        });

        // 7. Paragraphs: split on double-newline, wrap each in <p>
        const paragraphs = formatted.split(/\n\n+/);
        formatted = paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            if (/^<(h[1-4]|ul|ol|div|pre)|^@@CB\d+@@/.test(trimmed)) return trimmed;
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
