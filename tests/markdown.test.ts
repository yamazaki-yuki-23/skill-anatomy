import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectHtml } from '../src/html.ts';
import { parseMarkdown, renderBlocks, renderInline, safeLinkTarget } from '../src/markdown.ts';

function render(markdown: string): { html: string; unsupported: string[] } {
  const parsed = parseMarkdown(markdown);
  const html = renderBlocks(parsed.blocks, parsed.unsupported, undefined, parsed.definitions);
  return { html, unsupported: parsed.unsupported };
}
const page = (body: string) =>
  `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>\n`;

test('headings, paragraphs, lists, code, quotes, tables and rules render as escaped HTML', () => {
  const { html, unsupported } = render(
    [
      '# 題名 & 記号',
      '',
      '## 概要',
      '',
      '段落の1行目',
      '2行目 & 続き',
      '',
      '- 箇条書き `code & <x>`',
      '- **太字** と *強調* と [リンク](https://example.com/a?b=1&c=2)',
      '  入れ子の続き',
      '',
      '1. 手順1',
      '2. 手順2',
      '   - 下位の項目',
      '',
      '```sh',
      'echo "<script>"',
      '```',
      '',
      '> 引用の段落',
      '> 2行目',
      '',
      '| 項目 | 内容 |',
      '|---|---|',
      '| 元URL | https://example.com |',
      '| 記号 | a \\| b |',
      '',
      '---',
    ].join('\n'),
  );
  assert.deepEqual(unsupported, []);
  assert.match(html, /<h1>題名 &amp; 記号<\/h1>/);
  assert.match(html, /<p>段落の1行目\n2行目 &amp; 続き<\/p>/);
  assert.match(html, /<li>箇条書き <code>code &amp; &lt;x&gt;<\/code><\/li>/);
  assert.match(
    html,
    /<li><strong>太字<\/strong> と <em>強調<\/em> と <a href="https:\/\/example.com\/a\?b=1&amp;c=2">リンク<\/a>\n入れ子の続き<\/li>/,
  );
  assert.match(
    html,
    /<ol>\n<li>手順1<\/li>\n<li><p>手順2<\/p>\n<ul>\n<li>下位の項目<\/li>\n<\/ul><\/li>\n<\/ol>/,
  );
  assert.match(
    html,
    /<pre><code class="language-sh">echo &quot;&lt;script&gt;&quot;<\/code><\/pre>/,
  );
  assert.match(html, /<blockquote>\n<p>引用の段落\n2行目<\/p>\n<\/blockquote>/);
  assert.match(html, /<thead><tr><th>項目<\/th><th>内容<\/th><\/tr><\/thead>/);
  assert.match(html, /<td>a \| b<\/td>/);
  assert.match(html, /<hr>/);
  assert.deepEqual(inspectHtml(page(html)), []);
});

test('raw HTML, unsafe links, external images and reference links are reported and neutralised', () => {
  const { html, unsupported } = render(
    [
      '<div onclick="x()">生HTML</div>',
      '',
      '[実行](javascript:alert(1)) と [相対](../other.md#sec) と [断片](#design-1)',
      '',
      '![図](https://example.com/x.png) ![内蔵](data:image/svg+xml;base64,PHN2Zy8+)',
      '',
      '[未定義][none] と脚注[^1]',
    ].join('\n'),
  );
  assert.match(html, /<p>&lt;div onclick=&quot;x\(\)&quot;&gt;生HTML&lt;\/div&gt;<\/p>/);
  assert.match(
    html,
    /<p>実行 と <a href="..\/other.md#sec">相対<\/a> と <a href="#design-1">断片<\/a><\/p>/,
  );
  assert.match(html, /<p>図 <img src="data:image\/svg\+xml;base64,PHN2Zy8\+" alt="内蔵"><\/p>/);
  assert.ok(unsupported.some((w) => /生のHTML/.test(w)));
  assert.ok(unsupported.some((w) => /javascript:alert/.test(w)));
  assert.ok(unsupported.some((w) => /画像/.test(w)));
  assert.ok(unsupported.some((w) => /参照形式/.test(w)));
  assert.deepEqual(inspectHtml(page(html)), []);
  assert.equal(safeLinkTarget('//evil.example'), null);
  assert.equal(safeLinkTarget('data:text/html,x'), null);
  assert.equal(safeLinkTarget('https://example.com/a b'), null);
  assert.equal(safeLinkTarget('reports/x.md'), 'reports/x.md');
});

test('unclosed fences, indented code and ragged tables are reported without throwing', () => {
  const { unsupported } = render(
    ['```', 'open', '', '    indented', '', '| a | b |', '|--|--|', '| 1 | 2 | 3 |'].join('\n'),
  );
  assert.ok(unsupported.some((w) => /閉じていません/.test(w)));
  const second = render(['    indented', '', '| a | b |', '|--|--|', '| 1 | 2 | 3 |'].join('\n'));
  assert.ok(second.unsupported.some((w) => /字下げによるコード/.test(w)));
  assert.ok(second.unsupported.some((w) => /列数/.test(w)));
});

test('reference-style links resolve from definitions, which disappear from the output', () => {
  const { html, unsupported } = render(
    [
      '[使う条件][entry] と [Other][] の2つ。',
      '',
      '- 箇条書きでも[同じ][entry]',
      '',
      '| 表 | 中 |',
      '|---|---|',
      '| [表の中][entry] | x |',
      '',
      '[entry]: https://example.com/skill#entry',
      '[Other]: https://example.com/second "title"',
      '',
      '```',
      '[code]: not-a-definition',
      '```',
    ].join('\n'),
  );
  assert.deepEqual(unsupported, []);
  assert.match(
    html,
    /<a href="https:\/\/example.com\/skill#entry">使う条件<\/a> と <a href="https:\/\/example.com\/second">Other<\/a> の2つ/,
  );
  assert.match(
    html,
    /<li>箇条書きでも<a href="https:\/\/example.com\/skill#entry">同じ<\/a><\/li>/,
  );
  assert.match(html, /<td><a href="https:\/\/example.com\/skill#entry">表の中<\/a><\/td>/);
  assert.match(html, /\[code\]: not-a-definition/);
  assert.doesNotMatch(html, /\[entry\]:/);
  const quoted = render(
    '`[a][entry]` と [a][entry] と [x][none]\n\n[entry]: https://example.com/e\n',
  );
  assert.match(
    quoted.html,
    /<code>\[a\]\[entry\]<\/code> と <a href="https:\/\/example.com\/e">a<\/a> と \[x\]\[none\]/,
  );
  assert.ok(quoted.unsupported.some((w) => /定義がありません/.test(w)));
});

test('a list ends before an unindented heading, fence, quote, rule or table', () => {
  const { html } = render(
    '- item\n## 設計判断\n\n本文。\n\n- a\n```\ncode\n```\n- b\n> q\n- c\n---\n- d\n| x | y |\n|---|---|\n| 1 | 2 |\n',
  );
  assert.match(html, /<ul>\n<li>item<\/li>\n<\/ul>\n<h2>設計判断<\/h2>\n<p>本文。<\/p>/);
  assert.match(html, /<li>a<\/li>\n<\/ul>\n<pre><code>code<\/code><\/pre>/);
  assert.match(html, /<li>b<\/li>\n<\/ul>\n<blockquote>/);
  assert.match(html, /<li>c<\/li>\n<\/ul>\n<hr>/);
  assert.match(html, /<li>d<\/li>\n<\/ul>\n<div class="table-wrap">/);
});

test('nested lists keep their hierarchy with two-space and four-space indentation', () => {
  const two = render('- parent\n  - child\n    - grandchild\n  - sibling\n- second\n').html;
  assert.match(
    two,
    /<ul>\n<li><p>parent<\/p>\n<ul>\n<li><p>child<\/p>\n<ul>\n<li>grandchild<\/li>\n<\/ul><\/li>\n<li>sibling<\/li>\n<\/ul><\/li>\n<li>second<\/li>\n<\/ul>/,
  );
  const four = render('1. first\n    - inner\n        - deeper\n2. second\n').html;
  assert.match(
    four,
    /<ol>\n<li><p>first<\/p>\n<ul>\n<li><p>inner<\/p>\n<ul>\n<li>deeper<\/li>\n<\/ul><\/li>\n<\/ul><\/li>\n<li>second<\/li>\n<\/ol>/,
  );
});

test('headings keep attached hashes, fences close only on a bare marker, and nested fences keep definitions', () => {
  const { html, unsupported } = render(
    [
      '## C#',
      '',
      '## 題名 ##',
      '',
      '```md',
      '```not-a-close',
      '[inner]: https://example.com/inner',
      '```',
      '',
      '- example',
      '  ```markdown',
      '  [label]: https://example.com',
      '  ```',
      '',
      '[inner][] と [label][]',
    ].join('\n'),
  );
  assert.match(html, /<h2>C#<\/h2>/);
  assert.match(html, /<h2>題名<\/h2>/);
  assert.match(
    html,
    /<pre><code class="language-md">```not-a-close\n\[inner\]: https:\/\/example.com\/inner<\/code><\/pre>/,
  );
  assert.match(
    html,
    /<li><p>example<\/p>\n<pre><code class="language-markdown">\[label\]: https:\/\/example.com<\/code><\/pre><\/li>/,
  );
  assert.match(html, /<p>\[inner\]\[\] と \[label\]\[\]<\/p>/);
  assert.equal(unsupported.filter((w) => /定義がありません/.test(w)).length, 2);
});

test('emphasis skips code spans and indented sibling items stay siblings', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline('**Use `**/*.ts` files** and *a `*` star* and __x__y', 1, unsupported),
    '<strong>Use <code>**/*.ts</code> files</strong> and <em>a <code>*</code> star</em> and __x__y',
  );
  assert.deepEqual(unsupported, []);
  const { html } = render('  - first\n  - second\n    - child\n  - third\n');
  assert.match(
    html,
    /<ul>\n<li>first<\/li>\n<li><p>second<\/p>\n<ul>\n<li>child<\/li>\n<\/ul><\/li>\n<li>third<\/li>\n<\/ul>/,
  );
});

test('loose lists keep numbering, nested emphasis closes in order, and indented fences are code', () => {
  const loose = render('1. first\n\n2. second\n\n3. third\n\nAfter.\n\n- a\n\n- b\n').html;
  assert.match(
    loose,
    /<ol>\n<li>first<\/li>\n<li>second<\/li>\n<li>third<\/li>\n<\/ol>\n<p>After.<\/p>\n<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>/,
  );
  const unsupported: string[] = [];
  assert.equal(
    renderInline('**bold with *italic*** and ***both*** x', 1, unsupported),
    '<strong>bold with <em>italic</em></strong> and <strong><em>both</em></strong> x',
  );
  assert.deepEqual(unsupported, []);
  const fenced = render('  ```md\n  ## Not a section\n   deeper\n  ```\n\n## Real\n');
  assert.deepEqual(fenced.unsupported, []);
  assert.match(
    fenced.html,
    /<pre><code class="language-md">## Not a section\n deeper<\/code><\/pre>\n<h2>Real<\/h2>/,
  );
  assert.doesNotMatch(fenced.html, /<h2>Not a section/);
});

test('link labels may hold code spans with brackets, escapes and nested brackets', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline(
      '[`items[0]`](https://example.com/source) and [a \\] b [c]](https://x.example/p(q)) and [`x[1]`][ref] and ![`alt[2]`](data:image/png;base64,QUJD)',
      1,
      unsupported,
      new Map([['ref', 'https://r.example']]),
    ),
    '<a href="https://example.com/source"><code>items[0]</code></a> and <a href="https://x.example/p(q)">a ] b [c]</a> and <a href="https://r.example"><code>x[1]</code></a> and <img src="data:image/png;base64,QUJD" alt="`alt[2]`">',
  );
  assert.deepEqual(unsupported, []);
  assert.equal(
    renderInline('[unclosed](https://x.example', 1, unsupported),
    '[unclosed](https://x.example',
  );
});

test('character references in text are decoded before escaping while code stays literal', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline('a &amp; b, &lt;value&gt;, &#65;&#x42;, &unknown; and `&amp;`', 1, unsupported),
    'a &amp; b, &lt;value&gt;, AB, &amp;unknown; and <code>&amp;amp;</code>',
  );
  const { html } = render('## A &amp; B\n\n```\n&lt;kept&gt;\n```\n');
  assert.match(html, /<h2>A &amp; B<\/h2>\n<pre><code>&amp;lt;kept&amp;gt;<\/code><\/pre>/);
  assert.deepEqual(unsupported, []);
});

test('hard breaks render as br and link destinations are normalised before validation', () => {
  const { html, unsupported } = render(
    [
      'first  ',
      'second\\',
      'third   ',
      'fourth',
      '',
      '- item one  ',
      '  item two',
      '',
      '[q](https://example.com/?a=1&amp;b=2) [p](https://example.com/a\\(b\\)) [r][ref]',
      '',
      '[ref]: https://example.com/?x=1&amp;y=2',
    ].join('\n'),
  );
  assert.deepEqual(unsupported, []);
  assert.match(html, /<p>first<br>\nsecond<br>\nthird<br>\nfourth<\/p>/);
  assert.match(html, /<li>item one<br>\nitem two<\/li>/);
  assert.match(
    html,
    /<a href="https:\/\/example.com\/\?a=1&amp;b=2">q<\/a> <a href="https:\/\/example.com\/a\(b\)">p<\/a> <a href="https:\/\/example.com\/\?x=1&amp;y=2">r<\/a>/,
  );
  assert.deepEqual(inspectHtml(page(html)), []);
});

test('inline code keeps significant whitespace', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline('` x  ` and `   ` and ``a`b`` and ` `` ` and `a\nb`', 1, unsupported),
    '<code>x </code> and <code>   </code> and <code>a`b</code> and <code>``</code> and <code>a b</code>',
  );
  assert.deepEqual(unsupported, []);
});

test('emphasis skips links whose destinations contain delimiter characters', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline(
      '_See [source](https://github.com/o/r/blob/main/__init__.py) for details_ and **<https://x.example/a_b_c> x**',
      1,
      unsupported,
    ),
    '<em>See <a href="https://github.com/o/r/blob/main/__init__.py">source</a> for details</em> and <strong><a href="https://x.example/a_b_c">https://x.example/a_b_c</a> x</strong>',
  );
  assert.deepEqual(unsupported, []);
});

test('nested bold inside italic and angle-bracketed destinations', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline(
      '*italic and **bold** here* and [source](<https://example.com/source>) and [t](<https://x.example/p> "title")',
      1,
      unsupported,
    ),
    '<em>italic and <strong>bold</strong> here</em> and <a href="https://example.com/source">source</a> and <a href="https://x.example/p">t</a>',
  );
  assert.deepEqual(unsupported, []);
});

test('intraword underscores never open emphasis', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline('prefix_with_suffix_ and a__b__c and _open_ word and x _y_', 1, unsupported),
    'prefix_with_suffix_ and a__b__c and <em>open</em> word and x <em>y</em>',
  );
  assert.deepEqual(unsupported, []);
});

test('parentheses inside quoted link titles do not end the link', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline(
      '[source](https://example.com "Step 1)") and [p](https://x.example/a(b) "(x") done',
      1,
      unsupported,
    ),
    '<a href="https://example.com">source</a> and <a href="https://x.example/a(b)">p</a> done',
  );
  assert.deepEqual(unsupported, []);
});

test('inline escapes and autolinks', () => {
  const unsupported: string[] = [];
  assert.equal(
    renderInline('\\*not em\\* <https://x.example/?a=1&b=2> 5 * 3 * 2', 1, unsupported),
    '*not em* <a href="https://x.example/?a=1&amp;b=2">https://x.example/?a=1&amp;b=2</a> 5 * 3 * 2',
  );
  assert.equal(
    renderInline('snake_case_name and `a_b`', 1, unsupported),
    'snake_case_name and <code>a_b</code>',
  );
  assert.deepEqual(unsupported, []);
});

test('heading ids come from the caller', () => {
  const parsed = parseMarkdown('## 概要\n\n### 小見出し\n\n## 設計判断\n');
  const html = renderBlocks(parsed.blocks, parsed.unsupported, (level, text, index) =>
    level === 2 ? `s${index}` : `${text}-${index}`,
  );
  assert.match(
    html,
    /<h2 id="s0">概要<\/h2>\n<h3 id="小見出し-1">小見出し<\/h3>\n<h2 id="s2">設計判断<\/h2>/,
  );
});
