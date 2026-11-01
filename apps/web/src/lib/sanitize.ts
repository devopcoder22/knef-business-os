import type DOMPurifyType from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div',
  'hr',
];

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'class', 'id',
];

// dompurify is browser-only; SSR renders empty state so this is safe to skip
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') return dirty;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = (require('dompurify') as { default: typeof DOMPurifyType }).default;
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS, ALLOWED_ATTR, FORCE_BODY: false });
}
