import { convert as htmlToText } from 'html-to-text';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';

const HTML_MARKUP_PATTERN = /(?:<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[a-z][^>]*>)/i;
const HTML_ENTITY_PATTERN = /&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i;
const MARKDOWN_FENCED_CODE_PATTERN = /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm;
const MARKDOWN_INLINE_CODE_PATTERN = /(`+)[^\n]*?\1/g;
const MARKDOWN_INDENTED_CODE_PATTERN = /^(?: {4}|\t).*$/gm;
const MARKDOWN_AUTOLINK_PATTERN = /<(?:https?:\/\/|mailto:)[^>\s]+>/gi;
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

function containsHtml(value: string): boolean {
  const contentOutsideMarkdownCode = value
    .replace(MARKDOWN_FENCED_CODE_PATTERN, '')
    .replace(MARKDOWN_INLINE_CODE_PATTERN, '')
    .replace(MARKDOWN_INDENTED_CODE_PATTERN, '')
    .replace(MARKDOWN_AUTOLINK_PATTERN, '');
  return (
    HTML_MARKUP_PATTERN.test(contentOutsideMarkdownCode) ||
    HTML_ENTITY_PATTERN.test(contentOutsideMarkdownCode)
  );
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePlainText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function convertLegacyEventDescription(value: string | null): string | null {
  if (value === null || !containsHtml(value)) {
    return value;
  }

  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**',
  });
  turndown.remove(['iframe', 'noscript', 'object', 'script', 'style']);

  return normalizeMarkdown(turndown.turndown(value));
}

export function cleanLegacyEventShortDescription(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const contentWithoutHtml = containsHtml(value)
    ? htmlToText(value, {
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
        ],
        wordwrap: false,
      })
    : value;

  return normalizePlainText(
    htmlToText(markdown.render(contentWithoutHtml), {
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'li', format: 'block' },
        { selector: 'ol', format: 'block' },
        { selector: 'ul', format: 'block' },
      ],
      wordwrap: false,
    }),
  );
}
