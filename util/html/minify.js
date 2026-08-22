/**
 * minify.js
 * A dependency-free HTML minifier.
 *
 * Usage:
 *   import { minifyHtml } from './minify.js';
 *   const out = minifyHtml(html, { removeComments: true });
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// Content inside these must be preserved byte-for-byte
const PRESERVE_TAGS = new Set(['pre', 'script', 'style', 'textarea']);

// Boolean attributes that can be collapsed: disabled="disabled" -> disabled
const BOOLEAN_ATTRS = new Set([
  'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple',
  'autofocus', 'autoplay', 'controls', 'default', 'defer', 'hidden',
  'loop', 'open', 'async', 'novalidate', 'ismap', 'reversed'
]);

// Tags where a boundary space is visually significant (e.g. "<span>a</span>
// <span>b</span>" must keep that space, or the words would visually merge).
// Whitespace touching any other tag (block-level, or none) is safe to drop
// entirely rather than just collapsing it to a single space.
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn',
  'em', 'i', 'img', 'input', 'kbd', 'label', 'mark', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'select', 'small', 'span', 'strong', 'sub', 'sup',
  'textarea', 'time', 'u', 'var', 'button'
]);

const TOKEN_REGEX = /<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|<\/?[a-zA-Z][\w:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^<>])*?)?\/?>|[^<]+/gi;

const ATTR_REGEX = /([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

function getTagName(t) {
  const m = t.match(/^<\/?([a-zA-Z][\w:-]*)/);
  return m ? m[1].toLowerCase() : '';
}

function isClosingTag(t) { return /^<\//.test(t); }
function isComment(t) { return /^<!--/.test(t); }
function isDoctype(t) { return /^<!doctype/i.test(t); }
function isSelfClosing(t) {
  return /\/>\s*$/.test(t) || VOID_TAGS.has(getTagName(t));
}
function isInlineTag(t) {
  return t != null && t.startsWith('<') && INLINE_TAGS.has(getTagName(t));
}

function minifyTag(tag, options) {
  const { removeAttributeQuotes, collapseBooleanAttributes } = options;

  const selfClose = /\/>\s*$/.test(tag);
  const closing = isClosingTag(tag);
  const inner = tag.replace(/^<\/?/, '').replace(/\/?>$/, '');

  if (closing) return `</${inner.trim()}>`;

  const spaceIdx = inner.search(/\s/);
  if (spaceIdx === -1) {
    return `<${inner}${selfClose ? '/' : ''}>`;
  }

  const tagName = inner.slice(0, spaceIdx);
  const attrString = inner.slice(spaceIdx + 1).trim();

  const attrs = [];
  let m;
  ATTR_REGEX.lastIndex = 0;
  while ((m = ATTR_REGEX.exec(attrString))) {
    let [, name, value] = m;
    name = name.toLowerCase();

    if (value === undefined) {
      attrs.push(name);
      continue;
    }

    // Strip surrounding quotes to inspect the raw value
    const rawValue = /^["']/.test(value) ? value.slice(1, -1) : value;

    if (collapseBooleanAttributes && BOOLEAN_ATTRS.has(name) && rawValue.toLowerCase() === name) {
      attrs.push(name);
      continue;
    }

    if (removeAttributeQuotes && /^[\w-]+$/.test(rawValue)) {
      // safe to drop quotes only if the value has no spaces/special chars
      attrs.push(`${name}=${rawValue}`);
    } else {
      const quote = /^'/.test(value) ? "'" : '"';
      attrs.push(`${name}=${quote}${rawValue}${quote}`);
    }
  }

  return `<${tagName}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose ? '/' : ''}>`;
}

export function minify(html, options = {}) {
  const opts = {
    removeComments: true,
    collapseWhitespace: true,
    removeAttributeQuotes: false,
    collapseBooleanAttributes: true,
    normalizeDoctype: false,
    ...options
  };

  TOKEN_REGEX.lastIndex = 0;
  const tokens = html.match(TOKEN_REGEX) || [];

  let out = '';
  let preserveActive = false;
  let preserveTagName = '';

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];

    if (preserveActive) {
      if (isClosingTag(raw) && getTagName(raw) === preserveTagName) {
        out += minifyTag(raw, opts);
        preserveActive = false;
      } else {
        out += raw; // untouched, byte-for-byte (JS/CSS/pre content)
      }
      continue;
    }

    if (isDoctype(raw)) {
      out += opts.normalizeDoctype ? raw.replace(/\s+/g, ' ').trim() : raw.trim();
      continue;
    }

    if (isComment(raw)) {
      if (!opts.removeComments) out += raw;
      continue;
    }

    if (!/^</.test(raw)) {
      // text node
      if (opts.collapseWhitespace) {
        let text = raw.replace(/\s+/g, ' '); // collapse internal runs to a single space

        // Only keep a boundary space when the adjacent side is an inline
        // tag — that space is what keeps neighboring inline content (or
        // words) from visually merging. Any other boundary (block tag,
        // comment, doctype, or start/end of document) can drop it entirely.
        const prevToken = tokens[i - 1];
        const nextToken = tokens[i + 1];
        if (/^\s/.test(text) && !isInlineTag(prevToken)) text = text.replace(/^\s+/, '');
        if (/\s$/.test(text) && !isInlineTag(nextToken)) text = text.replace(/\s+$/, '');

        out += text;
      } else {
        out += raw;
      }
      continue;
    }

    const tagName = getTagName(raw);
    out += minifyTag(raw, opts);

    if (!isClosingTag(raw) && !isSelfClosing(raw) && PRESERVE_TAGS.has(tagName)) {
      preserveActive = true;
      preserveTagName = tagName;
    }
  }

  return opts.collapseWhitespace ? out.trim() : out;
}

export default minify;
