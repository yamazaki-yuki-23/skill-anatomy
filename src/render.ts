import { escapeHtml, parseMarkdown, renderBlocks, renderInline } from './markdown.js';
import type { Block, Definitions } from './markdown.js';
export type ReportKind = 'skill' | 'repository';
export interface ReportMeta {
  url: string;
  urlLabel: string;
  commit: string;
  date: string;
  progress?: string;
}
export interface RenderedReport {
  html: string;
  warnings: string[];
}
const SECTION_IDS: Record<ReportKind, Record<string, string>> = {
  skill: {
    概要と使い方: 'overview',
    仕組みと処理の流れ: 'flow',
    '作成・変更の経緯': 'history',
    設計判断: 'design',
    調査範囲と出典: 'sources',
  },
  repository: {
    概要: 'overview',
    スキル一覧: 'skills',
    スキル同士の関係: 'relations',
    共通する設計: 'learning',
    調査範囲と出典: 'sources',
  },
};
// Rows of the research record that stay visible; the rest folds into a details element.
const VISIBLE_RECORD_ROWS = new Set(['元URL', '分析コミット', '調査日', '実行検証']);
interface Section {
  id: string;
  heading: string;
  blocks: Block[];
  line: number;
}
function splitSections(blocks: Block[], kind: ReportKind): { title: string; sections: Section[] } {
  let title = '';
  const sections: Section[] = [];
  let current: Section | null = null;
  let unnamed = 0;
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 1 && !title && !current) {
      title = block.text;
      continue;
    }
    if (block.kind === 'heading' && block.level <= 2) {
      // Only the known chapter names map to fixed ids; inherited properties never do.
      const known = SECTION_IDS[kind];
      const id = Object.hasOwn(known, block.text) ? known[block.text]! : `section-${++unnamed}`;
      current = { id, heading: block.text, blocks: [], line: block.line };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: `section-${++unnamed}`, heading: '', blocks: [], line: block.line };
      sections.push(current);
    }
    current.blocks.push(block);
  }
  return { title, sections };
}
// A table-of-contents entry is itself a link, so links inside a heading are unwrapped to
// their text; other inline formatting stays.
function tocLabel(text: string, line: number): string {
  return renderInline(text, line, []).replace(/<a [^>]*>|<\/a>/g, '');
}
function renderSection(
  section: Section,
  warnings: string[],
  definitions: Definitions,
): { html: string; toc: string; anchors: { text: string; id: string }[] } {
  let count = 0;
  const subheadings: { id: string; text: string }[] = [];
  const headingId = (level: number, text: string): string => {
    if (level !== 3) return '';
    const id = `${section.id}-${++count}`;
    subheadings.push({ id, text });
    return id;
  };
  let body: string;
  if (section.id === 'sources')
    body = renderRecord(section.blocks, warnings, headingId, definitions);
  else body = renderBlocks(section.blocks, warnings, headingId, definitions);
  const heading = section.heading
    ? `<h2>${renderInline(section.heading, section.line, warnings, definitions)}</h2>\n`
    : '';
  const html = `<section id="${escapeHtml(section.id)}">\n${heading}${body}\n</section>`;
  const nested = subheadings.length
    ? `\n<ol>\n${subheadings
        .map(
          (sub) =>
            `<li><a href="#${escapeHtml(sub.id)}">${tocLabel(sub.text, section.line)}</a></li>`,
        )
        .join('\n')}\n</ol>\n`
    : '';
  const label = section.heading ? tocLabel(section.heading, section.line) : '…';
  const toc = `<li><a href="#${escapeHtml(section.id)}">${label}</a>${nested}</li>`;
  const anchors = section.heading
    ? [{ text: section.heading, id: section.id }, ...subheadings]
    : subheadings;
  return { html, toc, anchors };
}
// Markdown links to headings (#設計判断, or the percent-encoded form) are pointed at the
// generated ids so navigation inside the HTML version keeps working.
function retargetFragments(html: string, anchors: { text: string; id: string }[]): string {
  let out = html;
  for (const { text, id } of anchors)
    for (const form of new Set([text, encodeURIComponent(text)]))
      out = out.replaceAll(`href="#${escapeHtml(form)}"`, `href="#${escapeHtml(id)}"`);
  return out;
}
// The research record keeps the identifying rows visible and folds the rest, as the
// hand-written HTML version did.
function renderRecord(
  blocks: Block[],
  warnings: string[],
  headingId: (level: number, text: string, index: number) => string,
  definitions: Definitions,
): string {
  const index = blocks.findIndex((block) => block.kind === 'table');
  const table = blocks[index];
  if (index < 0 || !table || table.kind !== 'table')
    return renderBlocks(blocks, warnings, headingId, definitions);
  const visible = table.rows.filter((row) => VISIBLE_RECORD_ROWS.has(row[0] ?? ''));
  const folded = table.rows.filter((row) => !VISIBLE_RECORD_ROWS.has(row[0] ?? ''));
  const before = renderBlocks(blocks.slice(0, index), warnings, headingId, definitions);
  const visibleHtml = renderBlocks([{ ...table, rows: visible }], warnings, headingId, definitions);
  const rest: Block[] = [
    ...(folded.length ? [{ ...table, rows: folded }] : []),
    ...blocks.slice(index + 1),
  ];
  const foldedHtml = rest.length
    ? `<details class="report-details">\n<summary>詳しい調査記録を見る</summary>\n${renderBlocks(rest, warnings, headingId, definitions)}\n</details>`
    : '';
  return [before, visibleHtml, foldedHtml].filter(Boolean).join('\n');
}
function leadOf(sections: Section[], warnings: string[], definitions: Definitions): string {
  const first = sections[0]?.blocks.find((block) => block.kind === 'paragraph');
  if (!first || first.kind !== 'paragraph') return '';
  const sentence = first.text.split('\n')[0] ?? '';
  return renderInline(sentence, first.line, warnings, definitions);
}
function recordDate(sections: Section[]): string | undefined {
  for (const section of sections)
    for (const block of section.blocks)
      if (block.kind === 'table')
        for (const row of block.rows) if (row[0] === '調査日' && row[1]) return row[1];
  return undefined;
}
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (whole, key: string) =>
    Object.hasOwn(values, key) ? values[key]! : whole,
  );
}
export function renderReport(
  markdown: string,
  template: string,
  kind: ReportKind,
  meta: ReportMeta,
): RenderedReport {
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
    progress: escapeHtml(meta.progress ?? ''),
    toc: rendered.map((section) => section.toc).join('\n'),
    sections: retargetFragments(
      rendered.map((section) => section.html).join('\n'),
      rendered.flatMap((section) => section.anchors),
    ),
  });
  const leftover = html.match(/\{\{[a-z_]+\}\}/g);
  if (leftover) warnings.push(`テンプレートの未対応の項目: ${[...new Set(leftover)].join(', ')}`);
  return { html, warnings: [...new Set(warnings)] };
}
