import { escapeHtml, parseMarkdown, renderBlocks, renderInline } from "./markdown.js";
const SECTION_IDS = {
  skill: {
    概要と使い方: "overview",
    仕組みと処理の流れ: "flow",
    "作成・変更の経緯": "history",
    設計判断: "design",
    調査範囲と出典: "sources"
  },
  repository: {
    概要: "overview",
    スキル一覧: "skills",
    スキル同士の関係: "relations",
    共通する設計: "learning",
    調査範囲と出典: "sources"
  }
};
const VISIBLE_RECORD_ROWS = new Set(["元URL", "分析コミット", "調査日", "実行検証"]);
function splitSections(blocks, kind) {
  let title = "";
  const sections = [];
  let current = null;
  let unnamed = 0;
  for (const block of blocks) {
    if (block.kind === "heading" && block.level === 1 && !title && !current) {
      title = block.text;
      continue;
    }
    if (block.kind === "heading" && block.level <= 2) {
      const known = SECTION_IDS[kind];
      const id = Object.hasOwn(known, block.text) ? known[block.text] : `section-${++unnamed}`;
      current = { id, heading: block.text, blocks: [], line: block.line };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: `section-${++unnamed}`, heading: "", blocks: [], line: block.line };
      sections.push(current);
    }
    current.blocks.push(block);
  }
  return { title, sections };
}
function tocLabel(text, line) {
  return renderInline(text, line, []).replace(/<a [^>]*>|<\/a>/g, "");
}
function renderSection(section, warnings, definitions) {
  let count = 0;
  const subheadings = [];
  const headingId = (level, text) => {
    if (level !== 3)
      return "";
    const id = `${section.id}-${++count}`;
    subheadings.push({ id, text });
    return id;
  };
  let body;
  if (section.id === "sources")
    body = renderRecord(section.blocks, warnings, headingId, definitions);
  else
    body = renderBlocks(section.blocks, warnings, headingId, definitions);
  const heading = section.heading ? `<h2>${renderInline(section.heading, section.line, warnings, definitions)}</h2>
` : "";
  const html = `<section id="${escapeHtml(section.id)}">
${heading}${body}
</section>`;
  const nested = subheadings.length ? `
<ol>
${subheadings.map((sub) => `<li><a href="#${escapeHtml(sub.id)}">${tocLabel(sub.text, section.line)}</a></li>`).join(`
`)}
</ol>
` : "";
  const label = section.heading ? tocLabel(section.heading, section.line) : "…";
  const toc = `<li><a href="#${escapeHtml(section.id)}">${label}</a>${nested}</li>`;
  const anchors = section.heading ? [{ text: section.heading, id: section.id }, ...subheadings] : subheadings;
  return { html, toc, anchors };
}
function retargetFragments(html, anchors) {
  let out = html;
  for (const { text, id } of anchors)
    for (const form of new Set([text, encodeURIComponent(text)]))
      out = out.replaceAll(`href="#${escapeHtml(form)}"`, `href="#${escapeHtml(id)}"`);
  return out;
}
function renderRecord(blocks, warnings, headingId, definitions) {
  const index = blocks.findIndex((block) => block.kind === "table");
  const table = blocks[index];
  if (index < 0 || !table || table.kind !== "table")
    return renderBlocks(blocks, warnings, headingId, definitions);
  const visible = table.rows.filter((row) => VISIBLE_RECORD_ROWS.has(row[0] ?? ""));
  const folded = table.rows.filter((row) => !VISIBLE_RECORD_ROWS.has(row[0] ?? ""));
  const before = renderBlocks(blocks.slice(0, index), warnings, headingId, definitions);
  const visibleHtml = renderBlocks([{ ...table, rows: visible }], warnings, headingId, definitions);
  const rest = [
    ...folded.length ? [{ ...table, rows: folded }] : [],
    ...blocks.slice(index + 1)
  ];
  const foldedHtml = rest.length ? `<details class="report-details">
<summary>詳しい調査記録を見る</summary>
${renderBlocks(rest, warnings, headingId, definitions)}
</details>` : "";
  return [before, visibleHtml, foldedHtml].filter(Boolean).join(`
`);
}
function leadOf(sections, warnings, definitions) {
  const first = sections[0]?.blocks.find((block) => block.kind === "paragraph");
  if (!first || first.kind !== "paragraph")
    return "";
  const sentence = first.text.split(`
`)[0] ?? "";
  return renderInline(sentence, first.line, warnings, definitions);
}
function recordDate(sections) {
  for (const section of sections)
    for (const block of section.blocks)
      if (block.kind === "table") {
        for (const row of block.rows)
          if (row[0] === "調査日" && row[1])
            return row[1];
      }
  return;
}
function fill(template, values) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (whole, key) => Object.hasOwn(values, key) ? values[key] : whole);
}
export function renderReport(markdown, template, kind, meta) {
  const parsed = parseMarkdown(markdown);
  const warnings = [...parsed.unsupported];
  const { title, sections } = splitSections(parsed.blocks, kind);
  const rendered = sections.map((section) => renderSection(section, warnings, parsed.definitions));
  const date = recordDate(sections) ?? meta.date;
  const html = fill(template, {
    title: escapeHtml(title || meta.urlLabel),
    lead: leadOf(sections, warnings, parsed.definitions),
    url: escapeHtml(meta.url),
    url_label: escapeHtml(meta.urlLabel),
    commit: escapeHtml(meta.commit.slice(0, 12)),
    date: escapeHtml(date),
    progress: escapeHtml(meta.progress ?? ""),
    toc: rendered.map((section) => section.toc).join(`
`),
    sections: retargetFragments(rendered.map((section) => section.html).join(`
`), rendered.flatMap((section) => section.anchors))
  });
  const leftover = html.match(/\{\{[a-z_]+\}\}/g);
  if (leftover)
    warnings.push(`テンプレートの未対応の項目: ${[...new Set(leftover)].join(", ")}`);
  return { html, warnings: [...new Set(warnings)] };
}
