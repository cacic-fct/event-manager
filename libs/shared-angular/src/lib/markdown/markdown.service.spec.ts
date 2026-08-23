import '@angular/compiler';
import { WindowLike } from 'dompurify';
import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from './markdown.service';

describe('MarkdownService', () => {
  it('renders common Markdown and KaTeX content', () => {
    const html = renderMarkdown('# Título\n\n**Destaque** e $x^2$.', window as unknown as WindowLike);

    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>Destaque</strong>');
    expect(html).toContain('class="katex"');
  });

  it('sanitizes unsafe HTML and link protocols', () => {
    const html = renderMarkdown(
      '<img src=x onerror=alert(1)> [perigoso](javascript:alert(1))',
      window as unknown as WindowLike,
    );

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('href=');
  });

  it('keeps useful document structure and safe automatic links', () => {
    const html = renderMarkdown(
      '- Primeiro item\n- Segundo item\n\nhttps://eventos.cacic.com.br/app/',
      window as unknown as WindowLike,
    );

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Primeiro item</li>');
    expect(html).toContain('href="https://eventos.cacic.com.br/app/"');
  });

  it('renders single line breaks as HTML line breaks', () => {
    const html = renderMarkdown('Primeira linha\nSegunda linha', window as unknown as WindowLike);

    expect(html).toContain('Primeira linha<br>');
    expect(html).toContain('Segunda linha');
  });

  it('highlights explicitly tagged fenced code without loading every language', () => {
    const html = renderMarkdown(
      '```typescript\nconst answer: number = 42;\n```',
      window as unknown as WindowLike,
    );

    expect(html).toContain('<pre class="markdown-code-block"><code class="hljs language-typescript">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-number">42</span>');
  });

  it('keeps unknown and untagged code blocks escaped', () => {
    const html = renderMarkdown(
      '```unknown\n<script>alert(1)</script>\n```\n\n```\nconst value = 1;\n```',
      window as unknown as WindowLike,
    );

    expect(html).toContain('<pre><code class="language-unknown">&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<pre><code>const value = 1;');
    expect(html).not.toContain('class="markdown-code-block"');
    expect(html).not.toContain('class="hljs language-unknown"');
  });

  it('returns an empty document for missing descriptions', () => {
    expect(renderMarkdown(null, window as unknown as WindowLike)).toBe('');
    expect(renderMarkdown(undefined, window as unknown as WindowLike)).toBe('');
  });

  it('reuses the DOMPurify Trusted Types policy across renders', () => {
    let policyWasCreated = false;
    const createPolicy = vi.fn(() => {
      if (policyWasCreated) {
        throw new TypeError('Policy with name dompurify already exists.');
      }

      policyWasCreated = true;
      return {
        createHTML: (value: string) => value,
        createScriptURL: (value: string) => value,
      };
    });
    const windowWithTrustedTypes = Object.create(window) as WindowLike;

    Object.defineProperty(windowWithTrustedTypes, 'trustedTypes', {
      configurable: true,
      value: { createPolicy },
    });

    expect(renderMarkdown('**Primeira pré-visualização**', windowWithTrustedTypes)).toContain(
      '<strong>Primeira pré-visualização</strong>',
    );
    expect(renderMarkdown('**Segunda pré-visualização**', windowWithTrustedTypes)).toContain(
      '<strong>Segunda pré-visualização</strong>',
    );
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });
});
