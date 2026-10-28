import type { ReportFormat } from './types.js';
export const REPORT_FORMATS: readonly ReportFormat[] = ['markdown', 'html'];
export function isReportFormat(value: unknown): value is ReportFormat {
  return typeof value === 'string' && (REPORT_FORMATS as readonly string[]).includes(value);
}
export function htmlPath(report: string): string {
  return report.endsWith('.md') ? `${report.slice(0, -3)}.html` : `${report}.html`;
}

// Tags whose presence loads resources, runs code, or submits data.
const FORBIDDEN_TAGS = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
  'applet',
  'base',
  'button',
  'embed',
  'fencedframe',
  'form',
  'frame',
  'frameset',
  'iframe',
  'input',
  'isindex',
  'keygen',
  'link',
  'noscript',
  'object',
  'plaintext',
  'portal',
  'script',
  'select',
  'set',
  'textarea',
]);
// Elements whose content browsers read as text in HTML but as elements inside <svg>.
// Their content may not contain "<", so both readings agree and the text can be skipped.
const RAW_TEXT_TAGS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
]);
// Attributes that reference other documents or resources and are never needed in a report.
const FORBIDDEN_ATTRIBUTES = new Set([
  'action',
  'background',
  'cite',
  'codebase',
  'data',
  'formaction',
  'longdesc',
  'manifest',
  'ping',
  'poster',
  'srcdoc',
  'srcset',
  'usemap',
]);
// Named references are case-sensitive in HTML; only these exact spellings decode.
const NAMED_ENTITIES: Record<string, string> = {
  AMP: '&',
  amp: '&',
  apos: "'",
  colon: ':',
  GT: '>',
  gt: '>',
  LT: '<',
  lt: '<',
  NewLine: '\n',
  nbsp: '\u00A0',
  num: '#',
  QUOT: '"',
  quot: '"',
  sol: '/',
  Tab: '\t',
};
// Numeric references decode with or without the optional semicolon, as browsers do.
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+;?|#\d+;?|[a-z]+;)/gi, (whole, body: string) => {
    const reference = body.endsWith(';') ? body.slice(0, -1) : body;
    let codePoint: number;
    if (reference.startsWith('#x') || reference.startsWith('#X'))
      codePoint = Number.parseInt(reference.slice(2), 16);
    else if (reference.startsWith('#')) codePoint = Number.parseInt(reference.slice(1), 10);
    else return NAMED_ENTITIES[reference] ?? whole;
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\uFFFD';
  });
}
// HTML tokenization treats only these five characters as whitespace; U+00A0 and other
// Unicode spaces are ordinary characters there, so the tokenizer must not use \s.
const ASCII_SPACE = new Set([' ', '\t', '\n', '\f', '\r']);
function isSpace(character: string | undefined): boolean {
  return character !== undefined && ASCII_SPACE.has(character);
}
const CSS_FUNCTIONS =
  /(?<![\w-])(?:-[a-z]+-)?(?:image-set|image|cross-fade|src|element|paint)\s*\(/i;
// CSS whitespace is ASCII only; U+00A0 and other Unicode spaces are part of a URL.
function trimCssSpace(value: string): string {
  return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
}
function isControl(character: string): boolean {
  const code = character.codePointAt(0)!;
  return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
}
function hasControls(value: string): boolean {
  return [...value].some(isControl);
}
// The URL parser drops tabs and newlines anywhere and spaces only at the ends; other
// characters, including embedded spaces, stay significant. The caller must have decoded
// character references first when the value came from an attribute.
function normalizeUrl(value: string): string | null {
  if (hasControls(value)) return null;
  return [...value]
    .filter((c) => c !== '\t' && c !== '\n' && c !== '\r')
    .join('')
    .replace(/^ +| +$/g, '')
    .toLowerCase();
}
// A named reference this table does not know (or a legacy one without its semicolon)
// may still decode in a browser, so a value that keeps one cannot be judged safely.
// "&b=2" inside a query string is not a reference, because browsers skip legacy names
// that are followed by "=".
function hasUnresolvedReference(decoded: string): boolean {
  return /&[a-zA-Z][a-zA-Z0-9]*(?![a-zA-Z0-9=])/.test(decoded);
}
// Returns the URL scheme, null for relative URLs, or undefined when an unresolved
// character reference sits where a scheme could still form.
function scheme(url: string): string | null | undefined {
  const match = /^([a-z][a-z0-9+.-]*):/.exec(url);
  if (match) return match[1]!;
  return /^[a-z0-9+.-]*&/.test(url) ? undefined : null;
}
// Attribute values are decoded before the browser reads them as CSS; the content of a
// <style> element is raw text and is checked exactly as written.
function checkCss(css: string, where: string, problems: string[], decode: boolean): void {
  const text = (decode ? decodeEntities(css) : css).toLowerCase();
  if (decode && hasUnresolvedReference(text))
    problems.push(`${where}: CSSの実体参照を解釈できません`);
  if (hasControls(text)) problems.push(`${where}: CSSに制御文字は使えません`);
  if (text.includes('\\')) problems.push(`${where}: CSSのエスケープは使えません`);
  if (/@import\b/.test(text)) problems.push(`${where}: @import は使えません`);
  if (/expression\s*\(|(?<![\w-])behavior\s*:|-moz-binding/.test(text))
    problems.push(`${where}: スクリプトを呼ぶCSSは使えません`);
  if (CSS_FUNCTIONS.test(text))
    problems.push(`${where}: 外部リソースを読み込めるCSS関数は使えません`);
  for (const literal of text.matchAll(/"([^"]*)"|'([^']*)'/g)) {
    const value = literal[1] ?? literal[2] ?? '';
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\/|:\/\//.test(value))
      problems.push(`${where}: URLを表すCSSの文字列は使えません`);
  }
  for (const target of cssUrls(text)) {
    // Same-document fragments (SVG markers, filters) and inline images load nothing external.
    // CSS keeps every character of a url() argument, so nothing is stripped before comparing.
    if (target === null || !(target.startsWith('#') || target.startsWith('data:image/')))
      problems.push(`${where}: 外部リソースを読み込む url() は使えません`);
  }
}
// Collects every url() argument; null stands for an argument that cannot be read fully.
function cssUrls(text: string): (string | null)[] {
  const targets: (string | null)[] = [];
  const opener = /(?<![\w-])url\s*\(/g;
  for (const match of text.matchAll(opener)) {
    let cursor = match.index + match[0].length;
    while (cursor < text.length && isSpace(text[cursor])) cursor++;
    const quote = text[cursor];
    let end: number;
    if (quote === '"' || quote === "'") {
      end = text.indexOf(quote, cursor + 1);
      if (end < 0) {
        targets.push(null);
        continue;
      }
      targets.push(text.slice(cursor + 1, end));
      const close = text.indexOf(')', end + 1);
      if (close < 0 || trimCssSpace(text.slice(end + 1, close))) targets.push(null);
      continue;
    }
    end = text.indexOf(')', cursor);
    if (end < 0) {
      targets.push(null);
      continue;
    }
    const raw = trimCssSpace(text.slice(cursor, end));
    targets.push(/["'(\s]/.test(raw) ? null : raw);
  }
  return targets;
}
function checkAttributes(
  tag: string,
  attributes: Map<string, string>,
  where: string,
  problems: string[],
): void {
  for (const [name, raw] of attributes) {
    if (name.startsWith('on')) {
      problems.push(`${where}: イベント属性 ${name} は使えません`);
      continue;
    }
    if (FORBIDDEN_ATTRIBUTES.has(name)) {
      problems.push(`${where}: 属性 ${name} は使えません`);
      continue;
    }
    const decoded = decodeEntities(raw);
    if (hasUnresolvedReference(decoded)) {
      problems.push(`${where}: 属性 ${name} の実体参照を解釈できません`);
      continue;
    }
    // A backslash could spell a CSS function or escape past the checks below.
    if (decoded.includes('\\')) {
      problems.push(`${where}: 属性 ${name} の値にバックスラッシュは使えません`);
      continue;
    }
    // Any attribute other than a URL attribute may be read as CSS (style, and SVG
    // presentation attributes such as fill, mask, cursor or filter), so all are checked.
    if (name !== 'href' && name !== 'src' && name !== 'xlink:href') {
      checkCss(raw, where, problems, true);
      continue;
    }
    if (name === 'href' || name === 'src' || name === 'xlink:href') {
      const url = normalizeUrl(decodeEntities(raw));
      if (url === null) {
        problems.push(`${where}: 属性 ${name} の値に制御文字は使えません`);
        continue;
      }
      const protocol = scheme(url);
      if (protocol === undefined) {
        problems.push(`${where}: 属性 ${name} の実体参照を解釈できません`);
        continue;
      }
      if (url.startsWith('#') && name !== 'src') continue;
      if (name === 'href' && (tag === 'a' || tag === 'area')) {
        if (protocol !== null && protocol !== 'http' && protocol !== 'https')
          problems.push(`${where}: リンク先のスキーム ${protocol}: は使えません`);
        continue;
      }
      if (!url.startsWith('data:image/'))
        problems.push(`${where}: ${name} に指定できるのはインライン画像（data:image/）だけです`);
    }
  }
}

// Reports are rendered by whoever opens them, so the checker fails closed: anything that
// could run code, load a remote resource, or submit data is rejected even if harmless.
const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*/;
const ATTRIBUTE_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*/;
// Only an unambiguous subset of the tag syntax is accepted: names made of letters,
// digits and hyphens, quoted attribute values, "/" only as "/>", and closing tags
// without attributes. Browsers recover from anything else in ways this checker does
// not try to reproduce, so every irregular construct is rejected instead.
function parseTag(
  text: string,
  open: number,
): { tag: string; attributes: Map<string, string>; end: number } | string {
  const name = TAG_NAME.exec(text.slice(open + 1, open + 65));
  if (!name) return 'タグ名が不正です';
  let cursor = open + 1 + name[0].length;
  const attributes = new Map<string, string>();
  for (;;) {
    const spaced = isSpace(text[cursor]);
    while (isSpace(text[cursor])) cursor++;
    if (cursor >= text.length) return 'タグが閉じていません';
    if (text[cursor] === '>') return { tag: name[0].toLowerCase(), attributes, end: cursor + 1 };
    if (text.startsWith('/>', cursor))
      return { tag: name[0].toLowerCase(), attributes, end: cursor + 2 };
    if (!spaced) return '属性の前に空白が必要です';
    const attribute = ATTRIBUTE_NAME.exec(text.slice(cursor, cursor + 256));
    if (!attribute) return '属性の書き方が不正です';
    const key = attribute[0].toLowerCase();
    cursor += attribute[0].length;
    let value = '';
    let after = cursor;
    while (isSpace(text[after])) after++;
    if (text[after] === '=') {
      cursor = after + 1;
      while (isSpace(text[cursor])) cursor++;
      const quote = text[cursor];
      if (quote !== '"' && quote !== "'") return `属性 ${key} の値は引用符で囲んでください`;
      const close = text.indexOf(quote, cursor + 1);
      if (close < 0) return '属性の引用符が閉じていません';
      value = text.slice(cursor + 1, close);
      cursor = close + 1;
    }
    if (cursor >= text.length) return 'タグが閉じていません';
    if (!isSpace(text[cursor]) && text[cursor] !== '>' && !text.startsWith('/>', cursor))
      return `属性 ${key} の後ろの書き方が不正です`;
    if (attributes.has(key)) return `属性 ${key} が重複しています`;
    attributes.set(key, value);
  }
}

export function inspectHtml(text: string): string[] {
  const problems: string[] = [];
  if (!text.trim()) return ['HTML版が空です'];
  if (!/^\uFEFF?\s*<!doctype\s+html\s*>/i.test(text))
    problems.push('1行目: <!doctype html> で始めてください');
  let charset = false;
  const lineOf = (index: number): string => `${text.slice(0, index).split('\n').length}行目`;
  let position = 0;
  while (position < text.length) {
    const open = text.indexOf('<', position);
    if (open < 0) break;
    const where = lineOf(open);
    const next = text[open + 1];
    if (next === '!' || next === '?') {
      // Only the leading doctype is accepted. Comments, CDATA sections and bogus
      // comments end at different places depending on the parser state.
      const doctype = /^<!doctype\s+html\s*>/i.exec(text.slice(open, open + 32));
      if (!doctype || !/^\uFEFF?\s*$/.test(text.slice(0, open))) {
        problems.push(`${where}: 先頭の <!doctype html> 以外の宣言やコメントは使えません`);
        return problems;
      }
      position = open + doctype[0].length;
      continue;
    }
    if (next === '/') {
      const closing = /^<\/([a-zA-Z][a-zA-Z0-9-]*)[\t\n\f\r ]*>/.exec(text.slice(open, open + 80));
      if (!closing) {
        problems.push(`${where}: 終了タグの書き方が不正です`);
        return problems;
      }
      position = open + closing[0].length;
      continue;
    }
    if (next === undefined || !/[a-zA-Z]/.test(next)) {
      position = open + 1;
      continue;
    }
    const parsed = parseTag(text, open);
    if (typeof parsed === 'string') {
      problems.push(`${where}: ${parsed}`);
      return problems;
    }
    const { tag, attributes } = parsed;
    let cursor = parsed.end;
    if (FORBIDDEN_TAGS.has(tag)) problems.push(`${where}: <${tag}> は使えません`);
    if (tag === 'meta') {
      if (attributes.has('http-equiv')) problems.push(`${where}: <meta http-equiv> は使えません`);
      if (attributes.has('charset')) {
        if (/^utf-?8$/i.test(attributes.get('charset')!.trim())) charset = true;
        else problems.push(`${where}: 文字コードは utf-8 だけが使えます`);
      }
    }
    checkAttributes(tag, attributes, where, problems);
    if (RAW_TEXT_TAGS.has(tag)) {
      const rest = text.slice(cursor);
      const end = rest.search(new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'i'));
      const content = end < 0 ? rest : rest.slice(0, end);
      if (end < 0) problems.push(`${where}: <${tag}> が閉じていません`);
      if (content.includes('<')) problems.push(`${where}: <${tag}> の中に < は書けません`);
      if (tag === 'style') {
        // HTML reads style content as raw text, but inside <svg> the same content has its
        // character references decoded first, so both readings must pass.
        checkCss(content, where, problems, false);
        if (content.includes('&')) checkCss(content, where, problems, true);
      }
      cursor += content.length;
    }
    position = cursor;
  }
  if (!charset) problems.push('<meta charset="utf-8"> を <head> に置いてください');
  return [...new Set(problems)];
}
