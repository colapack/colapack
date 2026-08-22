/**
 * prettify.js
 * A dependency-free HTML pretty-printer.
 *
 * Usage:
 *   import { prettifyHtml } from './prettify.js';
 *   const out = prettifyHtml(html, { indentSize: 2, maxLineLength: 80 });
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// Content inside these must be preserved byte-for-byte (not re-indented)
const PRESERVE_TAGS = new Set(['pre', 'script', 'style', 'textarea']);

// Tags whose own line is never indented, even though their children still are
const NO_INDENT_TAGS = new Set(['head', 'body']);

const TOKEN_REGEX = /<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|<\/?[a-zA-Z][\w:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^<>])*?)?\/?>|[^<]+/gi;

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

// Resolves the indentation depth actually used for a tag's own line.
// NO_INDENT_TAGS always render flush (depth 0) regardless of real nesting depth.
function displayDepth(depth, tagName) {
  return NO_INDENT_TAGS.has(tagName) ? 0 : depth;
}

// Formats an opening tag on a single line — attributes are never wrapped.
function formatTag(tag, depth, indentChar, maxLineLength) {
  const indent = indentChar.repeat(depth);
  return indent + tag.trim();
}

// Preserves a single leading/trailing space (if the original text had
// whitespace there) so words don't get jammed together against tag boundaries
// when text is folded into a single-line collapse.
function textWithSpacing(raw) {
  const lead = /^\s/.test(raw) ? ' ' : '';
  const trail = /\s$/.test(raw) ? ' ' : '';
  return lead + raw.trim() + trail;
}

// Recursively attempts to collapse an element (starting at an opening tag)
// and everything inside it onto a single string — but only when the element
// has direct text content (e.g. "<p>text <a>link</a> more</p>"). Container
// elements whose children are only other elements with no direct text
// (e.g. <ul><li>...</li></ul>, <head>...</head>) are refused so each child
// still gets its own line. Returns { str, next } on success, or null.
function tryCollapse(tokens, i) {
  const raw = tokens[i];
  const tagName = getTagName(raw);

  if (isSelfClosing(raw)) {
    return { str: raw.trim(), next: i + 1 };
  }
  if (PRESERVE_TAGS.has(tagName)) {
    return null; // let preserve-tag handling own these
  }

  let combined = raw.trim();
  let j = i + 1;
  let hasDirectText = false;
  let hasElementChild = false;

  while (j < tokens.length) {
    const next = tokens[j];

    if (isComment(next) || isDoctype(next)) return null;

    if (!/^</.test(next)) {
      if (next.trim()) hasDirectText = true;
      combined += textWithSpacing(next);
      j++;
      continue;
    }

    const nextTagName = getTagName(next);
    if (isClosingTag(next) && nextTagName === tagName) {
      if (hasElementChild && !hasDirectText) return null; // element-only container — keep multi-line
      combined += next.trim();
      return { str: combined, next: j + 1 };
    }
    if (isClosingTag(next)) {
      return null; // mismatched close — malformed input, bail to block handling
    }

    hasElementChild = true;
    const nested = tryCollapse(tokens, j);
    if (!nested) return null;
    combined += nested.str;
    j = nested.next;
  }

  return null; // ran out of tokens without finding the matching close tag
}

/**
 * Pretty-print an HTML string with indentation.
 * @param {string} html
 * @param {object} [options]
 * @param {number} [options.indentSize=2]
 * @param {number} [options.maxLineLength=80] - line length threshold for wrapping attributes / inlining tags
 * @param {boolean} [options.normalizeDoctype=false] - collapse internal whitespace in <!DOCTYPE ...>
 * @returns {string}
 */

export function pretty(html, options = {}) {
  const indentSize = options.indentSize ?? 2;
  const maxLineLength = options.maxLineLength ?? 80;
  const normalizeDoctype = options.normalizeDoctype ?? false;
  const indentChar = ' '.repeat(indentSize);

  TOKEN_REGEX.lastIndex = 0;
  const tokens = html.match(TOKEN_REGEX) || [];

  const output = [];
  let depth = 0;
  let i = 0;

  // preserve-tag state (pre/script/style/textarea)
  let preserveActive = false;
  let preserveTagName = '';
  let preserveBuffer = '';
  let preserveDepthAtOpen = 0;

  while (i < tokens.length) {
    const raw = tokens[i];

    if (preserveActive) {
      preserveBuffer += raw;
      if (isClosingTag(raw) && getTagName(raw) === preserveTagName) {
        const openLine = output.pop(); // the opening tag line already pushed
        const closeTagText = raw.trim();
        const contentOnly = preserveBuffer.slice(0, -closeTagText.length);
        output.push(openLine);
        if (contentOnly.trim()) {
          output.push(indentChar.repeat(preserveDepthAtOpen + 1) + contentOnly.trim());
        }
        output.push(indentChar.repeat(displayDepth(preserveDepthAtOpen, preserveTagName)) + closeTagText);
        preserveActive = false;
        preserveBuffer = '';
        depth = preserveDepthAtOpen;
      }
      i++;
      continue;
    }

    if (isDoctype(raw)) {
      output.push(normalizeDoctype ? raw.replace(/\s+/g, ' ').trim() : raw.trim());
      i++;
      continue;
    }

    if (isComment(raw)) {
      output.push(indentChar.repeat(depth) + raw.trim());
      i++;
      continue;
    }

    if (!/^</.test(raw)) {
      const text = raw.trim();
      if (text) output.push(indentChar.repeat(depth) + text);
      i++;
      continue;
    }

    const tagName = getTagName(raw);

    if (isClosingTag(raw)) {
      depth = Math.max(depth - 1, 0);
      output.push(indentChar.repeat(displayDepth(depth, tagName)) + raw.trim());
      i++;
      continue;
    }

    // --- Try to combine this tag + everything inside it onto one line ---
    // Recursively collapses nested elements too (e.g. text with an inline
    // <a> in the middle), and never wraps regardless of length.
    // NO_INDENT_TAGS (head/body) are excluded — they always block-format so
    // their content lands on its own indented line, never fused onto the
    // same line as the tag itself.
    if (!isSelfClosing(raw) && !PRESERVE_TAGS.has(tagName) && !NO_INDENT_TAGS.has(tagName)) {
      const collapsed = tryCollapse(tokens, i);
      if (collapsed) {
        output.push(indentChar.repeat(displayDepth(depth, tagName)) + collapsed.str);
        i = collapsed.next;
        continue;
      }
      // fall through to block handling if it couldn't be collapsed
    }

    // Opening tag (block-level, or inline tag too long/complex to inline)
    output.push(formatTag(raw, displayDepth(depth, tagName), indentChar, maxLineLength));

    if (isSelfClosing(raw)) {
      i++;
      continue;
    }

    if (PRESERVE_TAGS.has(tagName)) {
      preserveActive = true;
      preserveTagName = tagName;
      preserveBuffer = '';
      preserveDepthAtOpen = depth;
      depth++;
      i++;
      continue;
    }

    depth++;
    i++;
  }

  return output.join('\n');
}

export default pretty;
