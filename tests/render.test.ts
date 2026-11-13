import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectHtml } from '../src/html.ts';
import { renderReport } from '../src/render.ts';
import { readTemplate, templatePath } from '../src/templates.ts';

const skillMarkdown = [
  '# review-brief の分析',
  '',
  '## 概要と使い方',
  '',
  '作者が向き合った課題は、観察と質問の混在です。**重要**な設計は分離です。',
  '2文目は lead に入らない。',
  '',
  '## 仕組みと処理の流れ',
  '',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
  '',
  '## 作成・変更の経緯',
  '',
  '作者の説明は[コミット](https://github.com/o/r/commit/abc)にある。',
  '',
  '## 設計判断',
  '',
  '### 観察と質問を分ける',
  '',
  '理由を先に書く。',
  '',
  '### 変更を試したと書かない',
  '',
  '条件を続ける。',
  '',
  '## 調査範囲と出典',
  '',
  '| 項目 | 内容 |',
  '|---|---|',
  '| 元URL | https://github.com/o/r/blob/abc/skills/review-brief/SKILL.md |',
  '| 分析コミット | abcdef0123456789abcdef0123456789abcdef01 |',
  '| 調査日 | 2026-11-13 |',
  '| 調査範囲 | SKILL.md と references |',
  '| 未確認の範囲 | PR の議論 |',
  '| 実行検証 | なし |',
  '',
  '- [SKILL.md](https://github.com/o/r/blob/abc/skills/review-brief/SKILL.md)',
].join('\n');

test('a skill report renders into the template with sections, nested toc and a folded record', () => {
  const { html, warnings } = renderReport(
    skillMarkdown,
    readTemplate('skill-analysis.html'),
    'skill',
    {
      url: 'https://github.com/o/r/blob/abc/skills/review-brief/SKILL.md',
      urlLabel: 'o/r/skills/review-brief',
      commit: 'abcdef0123456789abcdef0123456789abcdef01',
      date: '2026-01-01',
    },
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(inspectHtml(html), []);
  assert.match(html, /<title>review-brief の分析<\/title>/);
  assert.match(html, /<h1>review-brief の分析<\/h1>/);
  assert.match(
    html,
    /<p class="lead">作者が向き合った課題は、観察と質問の混在です。<strong>重要<\/strong>な設計は分離です。<\/p>/,
  );
  assert.match(html, /<code>abcdef012345<\/code>/);
  assert.match(html, /<dd>2026-11-13<\/dd>/);
  assert.match(html, /<section id="overview">\n<h2>概要と使い方<\/h2>/);
  assert.match(
    html,
    /<section id="flow">[\s\S]*<pre><code class="language-mermaid">flowchart LR\n {2}A --&gt; B<\/code><\/pre>/,
  );
  assert.match(
    html,
    /<section id="design">[\s\S]*<h3 id="design-1">観察と質問を分ける<\/h3>[\s\S]*<h3 id="design-2">変更を試したと書かない<\/h3>/,
  );
  assert.match(
    html,
    /<li><a href="#design">設計判断<\/a>\n<ol>\n<li><a href="#design-1">観察と質問を分ける<\/a><\/li>\n<li><a href="#design-2">変更を試したと書かない<\/a><\/li>\n<\/ol>\n<\/li>/,
  );
  assert.match(
    html,
    /<section id="sources">[\s\S]*<tr><td>元URL<\/td>[\s\S]*<tr><td>実行検証<\/td><td>なし<\/td><\/tr>[\s\S]*<details class="report-details">\n<summary>詳しい調査記録を見る<\/summary>[\s\S]*<td>調査範囲<\/td>[\s\S]*<td>未確認の範囲<\/td>[\s\S]*<a href="https:\/\/github.com\/o\/r\/blob\/abc\/skills\/review-brief\/SKILL.md">SKILL.md<\/a>[\s\S]*<\/details>/,
  );
  assert.doesNotMatch(html, /\{\{/);
  assert.doesNotMatch(html, /<details[\s\S]*<tr><td>元URL/);
});

test('a repository report fills the progress fact and unknown chapters get generic ids', () => {
  const markdown = [
    '# o/r の全体分析',
    '',
    '## 概要',
    '',
    '2つのスキルを持つ。',
    '',
    '## スキル一覧',
    '',
    '| スキル | 元のパス | 役割 | 分析状況 | 個別分析 |',
    '|---|---|---|---|---|',
    '| a | skills/a/SKILL.md | x | 完了 | [a](skill-analyses/a.md) |',
    '',
    '## 補足',
    '',
    '<script>alert(1)</script> は文字になる。',
    '',
    '## 調査範囲と出典',
    '',
    '| 項目 | 内容 |',
    '|---|---|',
    '| 調査日 | 2026-11-13 |',
  ].join('\n');
  const { html, warnings } = renderReport(
    markdown,
    readTemplate('repository-analysis.html'),
    'repository',
    {
      url: 'https://github.com/o/r',
      urlLabel: 'o/r',
      commit: 'abcdef0123456789abcdef0123456789abcdef01',
      date: '2026-01-01',
      progress: '完了 2 / 未完了 0',
    },
  );
  assert.ok(warnings.some((w) => /生のHTML/.test(w)));
  assert.equal(warnings.length, 1);
  assert.deepEqual(inspectHtml(html), []);
  assert.match(html, /<dd>完了 2 \/ 未完了 0<\/dd>/);
  assert.match(html, /<section id="skills">[\s\S]*<a href="skill-analyses\/a.md">a<\/a>/);
  assert.match(
    html,
    /<section id="section-1">\n<h2>補足<\/h2>\n<p>&lt;script&gt;alert\(1\)&lt;\/script&gt; は文字になる。<\/p>/,
  );
  assert.match(html, /<li><a href="#section-1">補足<\/a><\/li>/);
});

test('reference-style links resolve inside sections and a heading right after a list starts its section', () => {
  const markdown =
    '# t\n\n## 概要と使い方\n\n[入口][entry] を読む。\n\n- 箇条書き\n## 設計判断\n\n理由。\n\n[entry]: https://example.com/skill\n';
  const { html, warnings } = renderReport(markdown, readTemplate('skill-analysis.html'), 'skill', {
    url: 'u',
    urlLabel: 'l',
    commit: 'c',
    date: 'd',
  });
  assert.deepEqual(warnings, []);
  assert.match(
    html,
    /<p class="lead"><a href="https:\/\/example.com\/skill">入口<\/a> を読む。<\/p>/,
  );
  assert.match(html, /<section id="design">\n<h2>設計判断<\/h2>\n<p>理由。<\/p>\n<\/section>/);
  assert.match(html, /<li><a href="#design">設計判断<\/a><\/li>/);
});

test('links to Markdown headings are retargeted to the generated ids', () => {
  const markdown =
    '# t\n\n## 概要と使い方\n\n[設計へ](#設計判断) と [小見出しへ](#%E5%85%88%E3%81%AB%E8%B3%AA%E5%95%8F%E3%81%99%E3%82%8B) と [不明](#ない見出し)。\n\n## 設計判断\n\n### 先に質問する\n\n本文。\n';
  const { html } = renderReport(markdown, readTemplate('skill-analysis.html'), 'skill', {
    url: 'u',
    urlLabel: 'l',
    commit: 'c',
    date: 'd',
  });
  assert.match(
    html,
    /<a href="#design">設計へ<\/a> と <a href="#design-1">小見出しへ<\/a> と <a href="#ない見出し">不明<\/a>/,
  );
  assert.deepEqual(inspectHtml(html), []);
});

test('table-of-contents entries never contain nested hyperlinks', () => {
  const markdown =
    '# t\n\n## 概要と使い方\n\n本文。\n\n## 設計判断\n\n### [承認の分離](https://example.com/source) と `code`\n\n理由。\n';
  const { html } = renderReport(markdown, readTemplate('skill-analysis.html'), 'skill', {
    url: 'u',
    urlLabel: 'l',
    commit: 'c',
    date: 'd',
  });
  assert.match(html, /<li><a href="#design-1">承認の分離 と <code>code<\/code><\/a><\/li>/);
  assert.match(
    html,
    /<h3 id="design-1"><a href="https:\/\/example.com\/source">承認の分離<\/a> と <code>code<\/code><\/h3>/,
  );
  assert.doesNotMatch(html, /<a [^>]*><a /);
  assert.deepEqual(inspectHtml(html), []);
});

test('headings named like inherited property names get generic ids', () => {
  const markdown =
    '# t\n\n## 概要と使い方\n\n本文 &constructor; &amp; x。\n\n## constructor\n\n一。\n\n## __proto__\n\n二。\n\n## toString\n\n三。\n';
  const { html, warnings } = renderReport(markdown, readTemplate('skill-analysis.html'), 'skill', {
    url: 'u',
    urlLabel: 'l',
    commit: 'c',
    date: 'd',
  });
  assert.deepEqual(warnings, []);
  assert.match(html, /<section id="section-1">\n<h2>constructor<\/h2>/);
  assert.match(html, /<section id="section-2">\n<h2><strong>proto<\/strong><\/h2>/);
  assert.match(html, /<section id="section-3">\n<h2>toString<\/h2>/);
  assert.match(html, /本文 &amp;constructor; &amp; x。/);
  assert.deepEqual(inspectHtml(html), []);
});

test('templates are found beside dist or under the published skill and keep their safety', () => {
  for (const name of ['skill-analysis.html', 'repository-analysis.html']) {
    assert.match(templatePath(name), /skills\/skill-anatomy\/assets\/templates\//);
    const template = readTemplate(name);
    assert.deepEqual(inspectHtml(template), []);
    for (const key of ['title', 'lead', 'url', 'url_label', 'commit', 'date', 'toc', 'sections'])
      assert.match(template, new RegExp(`\\{\\{${key}\\}\\}`), `${name} lacks ${key}`);
  }
});
