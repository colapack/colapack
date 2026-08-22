/**
 * validate.js
 * A dependency-free HTML structural validator.
 *
 * Usage:
 *   import { validate } from './validate.js';
 *   const issues = validate(html, { requireAlt: true });
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// Content inside these is opaque — we don't tokenize/validate what's inside
const RAW_TEXT_TAGS = new Set(['script', 'style']);

// Elements that must only ever appear once in a document
const SINGLETON_TAGS = new Set(['html', 'head', 'body', 'title']);

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

// Precomputes line-start offsets so index -> {line, col} lookups are a
// binary search instead of an O(n) scan per lookup.
function makeLocator(str) {
  const lineStarts = [0];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') lineStarts.push(i + 1);
  }
  return (index) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: index - lineStarts[lo] + 1 };
  };
}

function parseAttrs(attrString) {
  const attrs = [];
  let consumed = 0;
  let m;
  ATTR_REGEX.lastIndex = 0;
  while ((m = ATTR_REGEX.exec(attrString))) {
    // record any gap between attrs that the regex couldn't account for
    const gap = attrString.slice(consumed, m.index);
    attrs.push({ name: m[1].toLowerCase(), value: m[2], gapBefore: gap });
    consumed = ATTR_REGEX.lastIndex;
  }
  const trailingGap = attrString.slice(consumed);
  return { attrs, trailingGap };
}

// Matches a full <script>...</script> or <style>...</style> block, including
// attributes on the opening tag. Content inside is never treated as markup.
const RAW_TEXT_BLOCK_REGEX = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

// Real parsers treat script/style content as opaque raw text — it's only
// terminated by the literal matching close tag, and things like `a < b`
// inside a script are not markup. Blank out that content (preserving length
// and newlines, so line/col reporting stays accurate) before tokenizing, so
// the tokenizer never has to interpret JS/CSS as HTML.
function maskRawTextBlocks(html) {
  return html.replace(RAW_TEXT_BLOCK_REGEX, (block) => {
    const openEnd = block.indexOf('>') + 1;
    const closeStart = block.lastIndexOf('<');
    const open = block.slice(0, openEnd);
    const close = block.slice(closeStart);
    const masked = block.slice(openEnd, closeStart).replace(/[^\n]/g, ' ');
    return open + masked + close;
  });
}

export function validate(html, options = {}) {
  const opts = {
    requireAlt: true,       // <img> should have an alt attribute
    requireHtmlLang: true,  // <html> should have a lang attribute
    requireDoctype: true,   // document should start with <!DOCTYPE html>
    ...options
  };

  const issues = [];
  const locate = makeLocator(html);
  const add = (severity, message, index) => {
    const { line, col } = locate(index);
    issues.push({ severity, message, line, col });
  };

  const workingHtml = maskRawTextBlocks(html);

  // --- Tokenize, and catch anything the tokenizer couldn't parse at all ---
  const matches = [...workingHtml.matchAll(TOKEN_REGEX)];
  let cursor = 0;
  for (const m of matches) {
    if (m.index > cursor) {
      add('error', `Unparsable markup (likely an unclosed quote or a stray "<"): ${JSON.stringify(workingHtml.slice(cursor, m.index).slice(0, 40))}`, cursor);
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < workingHtml.length) {
    add('error', `Unparsable markup at end of document: ${JSON.stringify(workingHtml.slice(cursor).slice(0, 40))}`, cursor);
  }

  // --- Structural + attribute checks ---
  const stack = []; // { tagName, index }
  const ids = new Map(); // id -> first index seen
  const seenSingleton = new Map(); // tagName -> first index seen
  let sawDoctype = false;
  let sawRealContentBeforeDoctype = false;
  let rawTextActive = null; // tagName currently swallowing raw content (script/style)

  for (const m of matches) {
    const raw = m[0];
    const index = m.index;

    if (rawTextActive) {
      if (isClosingTag(raw) && getTagName(raw) === rawTextActive) {
        rawTextActive = null;
      } else {
        continue; // ignore everything until the matching close tag
      }
    }

    if (isDoctype(raw)) {
      sawDoctype = true;
      if (sawRealContentBeforeDoctype) {
        add('error', '<!DOCTYPE> must be the first thing in the document', index);
      }
      continue;
    }
    if (isComment(raw)) continue;

    if (!/^</.test(raw)) {
      if (raw.trim()) sawRealContentBeforeDoctype = true;
      continue;
    }

    sawRealContentBeforeDoctype = true;
    const tagName = getTagName(raw);
    const closing = isClosingTag(raw);

    if (!tagName) {
      add('error', `Malformed tag: ${JSON.stringify(raw)}`, index);
      continue;
    }

    if (closing) {
      if (VOID_TAGS.has(tagName)) {
        add('warning', `</${tagName}> — void elements cannot have a closing tag`, index);
        continue;
      }
      const stackPos = stack.map(s => s.tagName).lastIndexOf(tagName);
      if (stackPos === -1) {
        add('error', `Unexpected closing tag </${tagName}> — no matching open tag`, index);
        continue;
      }
      if (stackPos !== stack.length - 1) {
        // everything above stackPos got skipped over — those are unclosed
        for (let k = stack.length - 1; k > stackPos; k--) {
          add('error', `Unclosed tag <${stack[k].tagName}> (opened here, never closed before </${tagName}> appeared)`, stack[k].index);
        }
      }
      stack.length = stackPos; // pop through and including the match
      continue;
    }

    // --- opening tag ---
    const inner = raw.replace(/^<\/?/, '').replace(/\/?>$/, '');
    const spaceIdx = inner.search(/\s/);
    const attrString = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1).trim();

    if (attrString) {
      const { attrs, trailingGap } = parseAttrs(attrString);
      if (trailingGap.trim()) {
        add('error', `Malformed attribute syntax in <${tagName}>: ${JSON.stringify(trailingGap.trim())}`, index);
      }

      const seenAttrNames = new Set();
      for (const attr of attrs) {
        if (attr.gapBefore.trim()) {
          add('error', `Malformed attribute syntax in <${tagName}> near ${JSON.stringify(attr.gapBefore.trim())}`, index);
        }

        if (seenAttrNames.has(attr.name)) {
          add('error', `Duplicate attribute "${attr.name}" on <${tagName}>`, index);
        }
        seenAttrNames.add(attr.name);

        if (attr.value && !/^["']/.test(attr.value) && /[\s"'<>=`]/.test(attr.value)) {
          add('error', `Unquoted attribute value looks unsafe: ${attr.name}=${attr.value} on <${tagName}>`, index);
        }

        if (attr.name === 'id') {
          const idValue = attr.value ? attr.value.replace(/^["']|["']$/g, '') : '';
          if (idValue) {
            if (ids.has(idValue)) {
              add('error', `Duplicate id "${idValue}" (first used at line ${locate(ids.get(idValue)).line})`, index);
            } else {
              ids.set(idValue, index);
            }
          }
        }
      }

      if (opts.requireAlt && tagName === 'img' && !seenAttrNames.has('alt')) {
        add('warning', '<img> is missing an alt attribute', index);
      }
      if (opts.requireHtmlLang && tagName === 'html' && !seenAttrNames.has('lang')) {
        add('warning', '<html> is missing a lang attribute', index);
      }
    } else {
      if (opts.requireAlt && tagName === 'img') {
        add('warning', '<img> is missing an alt attribute', index);
      }
      if (opts.requireHtmlLang && tagName === 'html') {
        add('warning', '<html> is missing a lang attribute', index);
      }
    }

    if (SINGLETON_TAGS.has(tagName)) {
      if (seenSingleton.has(tagName)) {
        add('error', `<${tagName}> should only appear once (first seen at line ${locate(seenSingleton.get(tagName)).line})`, index);
      } else {
        seenSingleton.set(tagName, index);
      }
    }

    const selfClosed = /\/>\s*$/.test(raw);
    const isVoid = VOID_TAGS.has(tagName);

    if (selfClosed && !isVoid) {
      add('warning', `<${tagName}/> — self-closing syntax on a non-void element is ignored by HTML parsers; it will be treated as an unclosed <${tagName}>`, index);
    }

    if (isVoid || selfClosed) continue; // never pushed onto the stack

    if (RAW_TEXT_TAGS.has(tagName)) {
      rawTextActive = tagName;
    }

    stack.push({ tagName, index });
  }

  for (const s of stack) {
    add('error', `Unclosed tag <${s.tagName}>`, s.index);
  }

  if (opts.requireDoctype && !sawDoctype) {
    add('warning', 'Missing <!DOCTYPE html>', 0);
  }

  return issues.sort((a, b) => a.line - b.line || a.col - b.col);
}

export default validate;