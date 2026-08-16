import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import markdownItKatex from '@vscode/markdown-it-katex';
import createDOMPurify, { WindowLike } from 'dompurify';
import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

const highlighter = hljs.newInstance();

const highlightLanguages: Record<string, LanguageFn> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown: markdownLanguage,
  php,
  plaintext,
  python,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [language, definition] of Object.entries(highlightLanguages)) {
  highlighter.registerLanguage(language, definition);
}

function getLanguageName(info: string): string {
  return info.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
}

function canHighlight(language: string): boolean {
  return language.length > 0 && highlighter.getLanguage(language) !== undefined;
}

function highlightCode(source: string, language: string): string {
  const languageName = getLanguageName(language);

  if (!canHighlight(languageName)) {
    return '';
  }

  try {
    return highlighter.highlight(source, { language: languageName, ignoreIllegals: true }).value;
  } catch {
    return '';
  }
}

const markdown = new MarkdownIt({
  breaks: false,
  highlight: highlightCode,
  html: false,
  linkify: true,
  typographer: true,
}).use(markdownItKatex, {
  enableFencedBlocks: true,
  throwOnError: false,
});

const defaultFenceRenderer = markdown.renderer.rules['fence'];
markdown.renderer.rules['fence'] = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const language = getLanguageName(token.info);

  if (!canHighlight(language)) {
    return defaultFenceRenderer(tokens, index, options, env, renderer);
  }

  token.attrJoin('class', 'hljs');

  return defaultFenceRenderer(tokens, index, options, env, renderer).replace(
    '<pre>',
    '<pre class="markdown-code-block">',
  );
};

export function renderMarkdown(markdownSource: string | null | undefined, windowLike: WindowLike): string {
  const purifier = createDOMPurify(windowLike);
  return purifier.sanitize(markdown.render(markdownSource ?? ''), {
    USE_PROFILES: { html: true },
  });
}

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly angularSanitizer = inject(DomSanitizer);
  private readonly windowLike = this.getWindowLike(inject(DOCUMENT));

  render(markdownSource: string | null | undefined): SafeHtml {
    const sanitized = renderMarkdown(markdownSource, this.windowLike);

    return this.angularSanitizer.bypassSecurityTrustHtml(sanitized);
  }

  private getWindowLike(document: Document): WindowLike {
    const windowLike = document.defaultView;
    if (!windowLike) {
      throw new Error('DOMPurify requires a document with an associated window.');
    }

    return windowLike as unknown as WindowLike;
  }
}
