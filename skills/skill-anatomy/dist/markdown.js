export function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([A-Za-z0-9_+.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
function isBlank(line) {
  return line === undefined || !line.trim();
}
function splitRow(line) {
  let text = line.trim();
  if (text.startsWith("|"))
    text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|"))
    text = text.slice(0, -1);
  const cells = [];
  let current = "";
  for (let i = 0;i < text.length; i++) {
    const character = text[i];
    if (character === "\\" && text[i + 1] === "|") {
      current += "|";
      i++;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else
      current += character;
  }
  cells.push(current.trim());
  return cells;
}
function closesFence(line, marker) {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return match !== null && match[1][0] === marker[0] && match[1].length >= marker.length;
}
const DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+"[^"]*")?\s*$/;
function parseBlocks(lines, offset, unsupported, definitions) {
  const blocks = [];
  let i = 0;
  const lineNumber = (index) => offset + index;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2];
      const fenceIndent = fence[1].length;
      const body = [];
      let j = i + 1;
      while (j < lines.length && !closesFence(lines[j], marker)) {
        const raw = lines[j++];
        const strip = Math.min(fenceIndent, raw.length - raw.trimStart().length);
        body.push(raw.slice(strip));
      }
      if (j >= lines.length)
        unsupported.push(`${lineNumber(i)}行目: コードブロックが閉じていません`);
      blocks.push({
        kind: "code",
        language: fence[3] ?? "",
        text: body.join(`
`),
        line: lineNumber(i)
      });
      i = j + 1;
      continue;
    }
    const definition = DEFINITION.exec(line);
    if (definition) {
      definitions.set(definition[1].toLowerCase(), normalizeDestination(definition[2]));
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2] ?? "",
        line: lineNumber(i)
      });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule", line: lineNumber(i) });
      i++;
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      const inner = [];
      let j = i;
      while (j < lines.length && lines[j].trimStart().startsWith(">")) {
        inner.push(lines[j].trimStart().slice(1).replace(/^ /, ""));
        j++;
      }
      blocks.push({
        kind: "quote",
        blocks: parseBlocks(inner, lineNumber(i), unsupported, definitions),
        line: lineNumber(i)
      });
      i = j;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && !isBlank(lines[j]) && lines[j].includes("|")) {
        const row = splitRow(lines[j]);
        while (row.length < header.length)
          row.push("");
        if (row.length > header.length)
          unsupported.push(`${lineNumber(j)}行目: 表の列数が見出し行と合いません`);
        rows.push(row.slice(0, header.length));
        j++;
      }
      blocks.push({ kind: "table", header, rows, line: lineNumber(i) });
      i = j;
      continue;
    }
    const bullet = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (bullet && bullet[1].length <= 3) {
      const ordered = /^\d/.test(bullet[2]);
      const items = [];
      let j = i;
      while (j < lines.length) {
        const item = (ordered ? NUMBERED : BULLET).exec(lines[j]);
        if (!item || item[1].length > 3)
          break;
        const content = [item[3] ?? ""];
        const width = lines[j].length - (item[3] ?? "").length;
        let k = j + 1;
        while (k < lines.length) {
          const next = lines[k];
          if (isBlank(next)) {
            if (k + 1 < lines.length && /^\s{2,}\S/.test(lines[k + 1])) {
              content.push("");
              k++;
              continue;
            }
            break;
          }
          const indent = next.length - next.trimStart().length;
          if (indent < width && (BULLET.test(next) || NUMBERED.test(next)))
            break;
          if (/^\s{2,}\S/.test(next)) {
            content.push(next.slice(Math.min(indent, width)));
            k++;
            continue;
          }
          if (BULLET.test(next) || NUMBERED.test(next))
            break;
          if (HEADING.test(next) || FENCE.test(next) || RULE.test(next) || next.trimStart().startsWith(">") || next.includes("|") && k + 1 < lines.length && TABLE_SEPARATOR.test(lines[k + 1]))
            break;
          content.push(keepHardBreak(next));
          k++;
        }
        items.push(parseBlocks(content, lineNumber(j), unsupported, definitions));
        let after = k;
        while (after < lines.length && isBlank(lines[after]))
          after++;
        const sibling = after < lines.length ? (ordered ? NUMBERED : BULLET).exec(lines[after]) : null;
        j = sibling && sibling[1].length === (item[1] ?? "").length ? after : k;
      }
      blocks.push({
        kind: "list",
        ordered,
        start: ordered ? Number(bullet[2]) : 1,
        items,
        line: lineNumber(i)
      });
      i = j;
      continue;
    }
    if (/^\s{4,}\S/.test(line)) {
      unsupported.push(`${lineNumber(i)}行目: 字下げによるコードブロックは使えません`);
    }
    const text = [keepHardBreak(line)];
    let j = i + 1;
    while (j < lines.length && !isBlank(lines[j]) && !FENCE.test(lines[j]) && !HEADING.test(lines[j]) && !RULE.test(lines[j]) && !lines[j].trimStart().startsWith(">") && !BULLET.test(lines[j]) && !NUMBERED.test(lines[j]) && !(lines[j].includes("|") && j + 1 < lines.length && TABLE_SEPARATOR.test(lines[j + 1])))
      text.push(keepHardBreak(lines[j++]));
    blocks.push({ kind: "paragraph", text: text.join(`
`), line: lineNumber(i) });
    i = j;
  }
  return blocks;
}
export function parseMarkdown(markdown) {
  const unsupported = [];
  const definitions = new Map;
  const lines = markdown.replace(/\r\n?/g, `
`).split(`
`);
  const blocks = parseBlocks(lines, 1, unsupported, definitions);
  return { blocks, unsupported, definitions };
}
function hasControls(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
}
export function safeLinkTarget(url) {
  const trimmed = url.trim();
  if (!trimmed || /[\s<>"]/.test(trimmed) || hasControls(trimmed))
    return null;
  if (/^(https?):\/\//i.test(trimmed))
    return trimmed;
  if (trimmed.startsWith("#"))
    return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//"))
    return null;
  return trimmed;
}
export function safeImageSource(url) {
  const trimmed = url.trim();
  if (/[\s<>"]/.test(trimmed) || hasControls(trimmed))
    return null;
  return /^data:image\//i.test(trimmed) ? trimmed : null;
}
const INLINE_CODE = /^(`+)([\s\S]*?[^`])\1(?!`)/;
function matchEmphasis(rest, delimiter) {
  if (!rest.startsWith(delimiter))
    return null;
  const open = delimiter.length;
  if (open >= rest.length || /\s/.test(rest[open]) || rest.startsWith(delimiter, open))
    return null;
  let i = open;
  while (i < rest.length) {
    const character = rest[i];
    if (character === "\\") {
      i += 2;
      continue;
    }
    if (character === "`") {
      const code = INLINE_CODE.exec(rest.slice(i));
      i += code ? code[0].length : 1;
      continue;
    }
    if (character === "[" || character === "!" && rest[i + 1] === "[") {
      const link = matchLink(rest.slice(character === "!" ? i + 1 : i));
      if (link) {
        i += link.length + (character === "!" ? 1 : 0);
        continue;
      }
    }
    if (character === "<") {
      const autolink = /^<https?:\/\/[^\s<>]+>/.exec(rest.slice(i));
      if (autolink) {
        i += autolink[0].length;
        continue;
      }
    }
    if (character === delimiter[0]) {
      let runEnd = i;
      while (rest[runEnd] === delimiter[0])
        runEnd++;
      const run = runEnd - i;
      const after = rest[runEnd];
      const closes = i > open && !/\s/.test(rest[i - 1]) && run >= delimiter.length && !(delimiter[0] === "_" && after !== undefined && /[A-Za-z0-9]/.test(after)) && !(delimiter.length === 1 && run >= 2);
      if (!closes) {
        i = runEnd;
        continue;
      }
      const close = delimiter.length === 2 && run === 3 ? i + 1 : i;
      return { inner: rest.slice(open, close), length: close + delimiter.length };
    }
    i++;
  }
  return null;
}
function matchLink(rest) {
  if (!rest.startsWith("["))
    return null;
  let i = 1;
  let depth = 0;
  while (i < rest.length) {
    const character = rest[i];
    if (character === "\\") {
      i += 2;
      continue;
    }
    if (character === "`") {
      const code = INLINE_CODE.exec(rest.slice(i));
      i += code ? code[0].length : 1;
      continue;
    }
    if (character === "[")
      depth++;
    else if (character === "]") {
      if (depth === 0)
        break;
      depth--;
    }
    i++;
  }
  if (i >= rest.length)
    return null;
  const label = rest.slice(1, i);
  const after = rest[i + 1];
  if (after === "(") {
    let j = i + 2;
    let parens = 0;
    let quoted = false;
    while (j < rest.length) {
      const character = rest[j];
      if (character === "\\")
        j += 2;
      else if (character === '"') {
        quoted = !quoted;
        j++;
      } else if (quoted)
        j++;
      else if (character === "(") {
        parens++;
        j++;
      } else if (character === ")") {
        if (parens === 0)
          break;
        parens--;
        j++;
      } else
        j++;
    }
    if (j >= rest.length)
      return null;
    const inside = rest.slice(i + 2, j).trim();
    const match = /^<([^<>]*)>(?:\s+"[^"]*")?$/.exec(inside) ?? /^(\S+)(?:\s+"[^"]*")?$/.exec(inside);
    if (!match || !label)
      return null;
    return { label, target: normalizeDestination(match[1]), reference: null, length: j + 1 };
  }
  if (after === "[") {
    const close = rest.indexOf("]", i + 2);
    if (close < 0 || !label)
      return null;
    return { label, target: null, reference: rest.slice(i + 2, close), length: close + 1 };
  }
  return null;
}
const NAMED_REFERENCES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  hellip: "…",
  mdash: "—",
  ndash: "–"
};
export function decodeReferences(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED_REFERENCES, body) ? NAMED_REFERENCES[body] : whole;
  });
}
function keepHardBreak(line) {
  const stripped = line.trimStart();
  return /[ \t]{2,}$/.test(stripped) ? `${stripped.trimEnd()}  ` : stripped.trimEnd();
}
function normalizeDestination(target) {
  return decodeReferences(target).replace(/\\([\\`*_[\]()#+\-.!|>&<"'])/g, "$1");
}
export function renderInline(text, line, unsupported, definitions = new Map) {
  let out = "";
  let i = 0;
  const flushText = (value) => {
    out += escapeHtml(decodeReferences(value)).replace(/ {2,}\n/g, `<br>
`);
  };
  const warn = (message) => {
    if (!unsupported.includes(message))
      unsupported.push(message);
  };
  while (i < text.length) {
    const rest = text.slice(i);
    const code = INLINE_CODE.exec(rest);
    if (code) {
      let span = code[2].replaceAll(`
`, " ");
      if (span.length >= 2 && span.startsWith(" ") && span.endsWith(" ") && span.trim() !== "")
        span = span.slice(1, -1);
      out += `<code>${escapeHtml(span)}</code>`;
      i += code[0].length;
      continue;
    }
    if (rest.startsWith("\\") && rest[1] === `
`) {
      out += `<br>
`;
      i += 2;
      continue;
    }
    if (rest.startsWith("\\") && rest.length > 1 && /[\\`*_[\]()#+\-.!|>]/.test(rest[1])) {
      flushText(rest[1]);
      i += 2;
      continue;
    }
    const image = rest.startsWith("![") ? matchLink(rest.slice(1)) : null;
    if (image) {
      const source = image.target === null ? null : safeImageSource(image.target);
      if (image.target !== null && source)
        out += `<img src="${escapeHtml(source)}" alt="${escapeHtml(image.label)}">`;
      else {
        warn(`${line}行目: 画像はインライン画像（data:image/）だけ使えます`);
        flushText(image.label);
      }
      i += image.length + 1;
      continue;
    }
    const link = rest.startsWith("[") ? matchLink(rest) : null;
    if (link && link.target !== null) {
      const target = safeLinkTarget(link.target);
      const label = renderInline(link.label, line, unsupported, definitions);
      if (target)
        out += `<a href="${escapeHtml(target)}">${label}</a>`;
      else {
        warn(`${line}行目: リンク先に使えないURLです: ${link.target}`);
        out += label;
      }
      i += link.length;
      continue;
    }
    if (link && link.reference !== null) {
      const name = (link.reference || link.label).toLowerCase();
      const defined = definitions.get(name);
      const target = defined === undefined ? null : safeLinkTarget(defined);
      const label = renderInline(link.label, line, unsupported, definitions);
      const whole = rest.slice(0, link.length);
      if (defined === undefined) {
        warn(`${line}行目: 参照形式のリンクの定義がありません: ${whole}`);
        flushText(whole);
      } else if (target)
        out += `<a href="${escapeHtml(target)}">${label}</a>`;
      else {
        warn(`${line}行目: リンク先に使えないURLです: ${defined}`);
        out += label;
      }
      i += link.length;
      continue;
    }
    const autolink = /^<(https?:\/\/[^\s<>]+)>/.exec(rest);
    if (autolink) {
      out += `<a href="${escapeHtml(autolink[1])}">${escapeHtml(autolink[1])}</a>`;
      i += autolink[0].length;
      continue;
    }
    if (rest[0] === "_" && i > 0 && /[A-Za-z0-9]/.test(text[i - 1])) {
      let run = 1;
      while (rest[run] === "_")
        run++;
      flushText(rest.slice(0, run));
      i += run;
      continue;
    }
    const strong = matchEmphasis(rest, "**") ?? matchEmphasis(rest, "__");
    if (strong) {
      out += `<strong>${renderInline(strong.inner, line, unsupported, definitions)}</strong>`;
      i += strong.length;
      continue;
    }
    const emphasis = matchEmphasis(rest, "*") ?? matchEmphasis(rest, "_");
    if (emphasis) {
      out += `<em>${renderInline(emphasis.inner, line, unsupported, definitions)}</em>`;
      i += emphasis.length;
      continue;
    }
    if (/^<[A-Za-z/!?]/.test(rest)) {
      warn(`${line}行目: 生のHTMLは使えません。文字として表示します`);
      flushText("<");
      i++;
      continue;
    }
    if (rest.startsWith("[^"))
      warn(`${line}行目: 脚注は使えません`);
    const next = rest.slice(1).search(/[`\\![<*_]/);
    const chunk = next < 0 ? rest : rest.slice(0, next + 1);
    flushText(chunk);
    i += chunk.length;
  }
  return out;
}
export function renderBlocks(blocks, unsupported, headingId, definitions = new Map) {
  let index = 0;
  const render = (list) => list.map((block) => {
    switch (block.kind) {
      case "heading": {
        const id = headingId ? headingId(block.level, block.text, index++) : "";
        const attribute = id ? ` id="${escapeHtml(id)}"` : "";
        const level = Math.min(block.level, 6);
        return `<h${level}${attribute}>${renderInline(block.text, block.line, unsupported, definitions)}</h${level}>`;
      }
      case "paragraph":
        return `<p>${renderInline(block.text, block.line, unsupported, definitions).replaceAll(`
`, `
`)}</p>`;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
        const items = block.items.map((item) => {
          if (item.length === 1 && item[0].kind === "paragraph")
            return `<li>${renderInline(item[0].text, item[0].line, unsupported, definitions)}</li>`;
          return `<li>${render(item)}</li>`;
        }).join(`
`);
        return `<${tag}${start}>
${items}
</${tag}>`;
      }
      case "code": {
        const language = /^[A-Za-z0-9_+.-]+$/.test(block.language) ? ` class="language-${escapeHtml(block.language)}"` : "";
        return `<pre><code${language}>${escapeHtml(block.text)}</code></pre>`;
      }
      case "quote":
        return `<blockquote>
${render(block.blocks)}
</blockquote>`;
      case "table": {
        const head = block.header.map((cell) => `<th>${renderInline(cell, block.line, unsupported, definitions)}</th>`).join("");
        const body = block.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, block.line, unsupported, definitions)}</td>`).join("")}</tr>`).join(`
`);
        return `<div class="table-wrap">
<table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</div>`;
      }
      case "rule":
        return "<hr>";
    }
  }).join(`
`);
  return render(blocks);
}
