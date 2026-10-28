import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { htmlPath, inspectHtml, isReportFormat } from '../src/html.ts';

const page = (body: string, head = '<meta charset="utf-8">') =>
  `<!doctype html>\n<html lang="ja"><head>${head}<title>t</title></head><body>${body}</body></html>\n`;

test('HTML paths sit beside the Markdown report', () => {
  assert.equal(htmlPath('skill-analyses/review.md'), 'skill-analyses/review.html');
  assert.equal(htmlPath('skill-analyses/a--0123.md'), 'skill-analyses/a--0123.html');
  assert.equal(htmlPath('repository-analysis'), 'repository-analysis.html');
  assert.ok(isReportFormat('html') && isReportFormat('markdown'));
  assert.ok(!isReportFormat('pdf') && !isReportFormat(undefined));
});

test('published HTML templates satisfy the safety conditions', () => {
  for (const name of ['skill-analysis', 'repository-analysis']) {
    const template = readFileSync(
      fileURLToPath(
        new URL(`../skills/skill-anatomy/assets/templates/${name}.html`, import.meta.url),
      ),
      'utf8',
    );
    assert.deepEqual(inspectHtml(template), [], name);
    assert.match(template, /<style>/);
    assert.match(template, /prefers-color-scheme: dark/);
    assert.match(template, /調査範囲と出典/);
  }
});

test('reports may link, embed inline SVG and data images, and keep template styling', () => {
  const body = [
    '<a href="https://github.com/a/b/blob/0123/SKILL.md#L1-L2">source</a>',
    '<a href="#design">内部リンク</a><a href="../repository-analysis.md">全体</a>',
    '<a href="HTTPS://example.com/">upper</a>',
    '<a href="../repository-analysis.md?x=1&amp;y=2#top">query</a><a href="?a=1&b=2">raw ampersand</a>',
    '<a href="&#104;ttps://example.com/">decoded scheme</a>',
    '<svg viewBox="0 0 10 10"><use xlink:href="#arrow"/><use href="#arrow"/><rect width="1" height="1"/></svg>',
    '<img alt="図" src="data:image/png;base64,AAAA">',
    '<p style="color: red; scroll-behavior: smooth">text with 1 &lt; 2 and 3 < 4</p>',
    '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt; onclick="x"</code></pre>',
    '<style>html{scroll-behavior:smooth} body{background:url(data:image/png;base64,AA)} .b{background: url( "data:image/png;base64,AA" )}</style>',
    '<style>.c > p{color:red}</style ><svg><style>.d{fill:red}</style></svg>',
    '<svg><rect filter="url(#f)" marker-end="url(#m)" width="1" height="1"/></svg><style>.a{filter:url(#f)}</style>',
    '<div style="background:url(&num;p)">entity decoded in attribute</div><a href="https://x/a&#32;b">space kept</a>',
    '<a href="https://x/?a=1&b=2&amp;c=3" title="A &amp; B &#169; &lt;C&gt;">query ampersands</a>',
  ].join('');
  assert.deepEqual(inspectHtml(page(body)), []);
});

test.each([
  ['script', '<script>alert(1)</script>', /<script>/],
  ['uppercase script', '<SCRIPT SRC="x"></SCRIPT>', /<script>/],
  ['event handler', '<div onclick="x()">a</div>', /onclick/],
  ['event handler after quoted >', '<div title="a>b" onclick="x()">a</div>', /onclick/],
  ['javascript link', '<a href="javascript:alert(1)">a</a>', /javascript:/],
  ['entity-encoded javascript link', '<a href="java&#115;cript:alert(1)">a</a>', /javascript:/],
  ['named-entity colon', '<a href="javascript&colon;alert(1)">a</a>', /javascript:/],
  ['tab inside scheme', '<a href="java\tscript:alert(1)">a</a>', /javascript:/],
  ['data link', '<a href="data:text/html,x">a</a>', /data:/],
  ['stylesheet link', '<link rel="stylesheet" href="https://x/y.css">', /<link>/],
  ['iframe', '<iframe src="https://x"></iframe>', /<iframe>/],
  ['external image', '<img src="https://x/y.png">', /data:image/],
  ['relative image', '<img src="y.png">', /data:image/],
  ['srcset', '<img srcset="https://x/y.png 1x" src="data:image/png;base64,AA">', /srcset/],
  ['svg external use', '<svg><use href="https://x/s.svg#i"/></svg>', /data:image/],
  ['css import', '<style>@import url(https://x/y.css);</style>', /@import/],
  ['css external url', '<style>body{background:url("https://x/y.png")}</style>', /url\(\)/],
  ['inline style url', '<div style="background:url(//x/y.png)">a</div>', /url\(\)/],
  ['css behavior', '<div style="behavior:url(x.htc)">a</div>', /CSS/],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://x">', /http-equiv/],
  ['form', '<form action="https://x"><input></form>', /<form>/],
  ['object data', '<object data="https://x/y.swf"></object>', /<object>/],
  ['unclosed attribute quote', '<div title="abc>x</div>', /引用符/],
  [
    'duplicate href keeps the first value',
    '<a href="javascript:alert(1)" href="https://x/">a</a>',
    /重複/,
  ],
  ['duplicate src', '<img src="https://x/y.png" src="data:image/png;base64,AA">', /重複/],
  [
    'numeric reference without semicolon',
    '<a href="&#106avascript:alert(1)">a</a>',
    /javascript:|実体参照/,
  ],
  [
    'hex reference without semicolon',
    '<a href="j&#x61vascript:alert(1)">a</a>',
    /javascript:|実体参照/,
  ],
  ['unknown reference before a colon', '<a href="java&bogus;script:alert(1)">a</a>', /実体参照/],
  ['css identifier escape', '<style>body{background:u\\72l(https://x/t)}</style>', /エスケープ/],
  ['css import escape', '<style>@\\69mport url(https://x/y.css);</style>', /エスケープ/],
  ['css image-set', '<style>body{background:image-set("https://x/y.png" 1x)}</style>', /CSS関数/],
  [
    'svg animate href',
    '<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>',
    /<animate>/,
  ],
  ['svg set', '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>', /<set>/],
  ['abruptly closed comment', '<!--><img src=x onerror=alert(1)>-->', /コメント|onerror/],
  ['comment hiding markup', '<!-- <script>x</script> -->', /コメント/],
  ['bang-closed comment', '<!-- a --!><img src=x onerror=alert(1)>', /コメント|onerror/],
  [
    'quoted css url with inner apostrophe',
    `<style>body{background:url("https://x/p?x='")}</style>`,
    /url\(\)/,
  ],
  [
    'single-quoted css url with inner quote',
    `<style>body{background:url('https://x/p?x="')}</style>`,
    /url\(\)/,
  ],
  ['unterminated css url', '<style>body{background:url("https://x/p}</style>', /url\(\)/],
  [
    'css url with trailing junk',
    '<style>body{background:url("data:image/png;base64,AA" x)}</style>',
    /url\(\)/,
  ],

  [
    'svg style breaking out to html',
    '<svg><style><img src=x onerror=alert(1)></style></svg>',
    /中に < は書けません/,
  ],
  [
    'style content past a bogus end tag',
    '<style></stylex>{} body{background:url(https://x/p)}</style>',
    /url\(\)/,
  ],
  ['unclosed style', '<style>body{color:red}', /閉じていません/],
  ['script content is still scanned', '<script><img src=x onerror=alert(1)></script>', /<script>/],
  [
    'style content desynchronizing attribute scanning',
    `<style>p::before{content:"<div title='"}</style><img src=x onerror=alert(1)><div title='">`,
    /中に < は書けません|onerror/,
  ],
  [
    'title hiding markup',
    `<title><div title='</title><img src=x onerror=alert(1)><div title='"></title>`,
    /中に < は書けません|onerror/,
  ],
  [
    'svg title breaking out',
    '<svg><title><img src=x onerror=alert(1)></title></svg>',
    /中に < は書けません|onerror/,
  ],
  ['xmp', '<xmp><img src=x onerror=alert(1)></xmp>', /中に < は書けません/],
  ['plaintext', '<plaintext><img src=x onerror=alert(1)>', /<plaintext>/],
  ['noscript', '<noscript><img src=x onerror=alert(1)></noscript>', /<noscript>/],
  [
    'non-ascii space before attribute value',
    '<div title=\u00A0" ><img src=x onerror=alert(1)>">',
    /引用符|onerror/,
  ],
  ['non-ascii space inside tag name boundary', '<img\u00A0src=x onerror=alert(1)>', /空白|onerror/],
  [
    'vendor-prefixed image-set',
    '<style>body{background:-webkit-image-set("https://x/p" 1x)}</style>',
    /CSS関数/,
  ],
  ['css string literal url', '<style>.a::before{content:"https://x/p"}</style>', /文字列/],
  [
    'svg cursor presentation attribute',
    '<svg cursor="url(https://x/p.cur),auto"><rect width="1" height="1"/></svg>',
    /url\(\)/,
  ],
  [
    'svg fill presentation attribute',
    '<svg><rect fill="url(https://x/p.svg#g)" width="1" height="1"/></svg>',
    /url\(\)/,
  ],
  ['cdata section', '<svg><![CDATA[>]]><img src=x onerror=alert(1)></svg>', /宣言/],
  ['processing instruction', '<?xml version="1.0"?>', /宣言/],
  ['non utf-8 charset', '<meta charset="utf-7">', /utf-8/],
  ['portal', '<portal src="https://x"></portal>', /<portal>/],
  ['equals sign before an attribute name', '<div =" ><img src=x onerror=alert(1)>">', /属性/],
  [
    'attributes on a closing tag',
    `<div></div title="><span title='"><img src=x onerror=alert(1)><span title='">`,
    /終了タグ/,
  ],
  ['unquoted attribute value', '<a href=https://x>a</a>', /引用符/],
  ['stray slash inside a tag', '<a/href="https://x">a</a>', /空白|不正/],
  ['missing space between attributes', '<a title="x"href="https://y">a</a>', /不正/],
  ['quote in attribute name position', `<div "onclick"="x">a</div>`, /属性/],
  ['tag name with punctuation', '<a<b onclick="x()">a</a>', /空白|不正|onclick/],
  ['bogus closing tag', '</ div><img src=x onerror=alert(1)>', /終了タグ/],
  [
    'escaped css function in a presentation attribute',
    '<svg cursor="u\\72l(https://x/p.cur),auto"><rect width="1" height="1"/></svg>',
    /バックスラッシュ/,
  ],
  [
    'entity-encoded backslash in an attribute',
    '<div style="background:u&#92;72l(https://x/p)">a</div>',
    /バックスラッシュ/,
  ],
  ['embedded space before a data url', '<img src="d ata:image/png,abc">', /data:image/],
  [
    'embedded space in a css url',
    '<style>body{background:url("d ata:image/png,abc")}</style>',
    /url\(\)/,
  ],
  [
    'leading space in a quoted css url',
    '<style>body{background:url(" data:image/png,abc")}</style>',
    /url\(\)/,
  ],
  [
    'entity in style element url',
    '<style>body{background:url("data&colon;image/png,abc")}</style>',
    /url\(\)/,
  ],
  ['entity fragment in style element', '<style>.a{filter:url("&num;f")}</style>', /url\(\)/],
  ['control character in href', '<a href="https://x/\u0001y">a</a>', /制御文字/],
  ['control character in style element', '<style>body{color:red\u0001}</style>', /制御文字/],
  [
    'uppercase named reference in a data url',
    '<img src="data&COLON;image/png,abc">',
    /実体参照|data:image/,
  ],
  [
    'uppercase named reference in a link scheme',
    '<a href="javascript&COLON;alert(1)">a</a>',
    /実体参照|javascript/,
  ],
  [
    'encoded import inside svg style',
    '<svg><style>&#64;import "pixel.css";</style></svg>',
    /@import/,
  ],
  [
    'encoded url inside svg style',
    '<svg><style>.a{fill:&#117;rl(https://x/p.svg#g)}</style></svg>',
    /url\(\)/,
  ],
  [
    'named parentheses in a style attribute',
    '<div style="background:url&lpar;https://x/p&rpar;">x</div>',
    /実体参照/,
  ],
  ['legacy reference without semicolon', '<a href="https://x/?a=1&lt b">a</a>', /実体参照/],
  [
    'unknown named reference in svg style',
    '<svg><style>.a{fill:url&lpar;https://x/p&rpar;}</style></svg>',
    /実体参照/,
  ],
  [
    'non-ascii space in an unquoted css url',
    '<style>body{background:url(\u00A0data:image/png,abc)}</style>',
    /url\(\)/,
  ],
  [
    'uppercase image function in a presentation attribute',
    `<svg><rect mask="IMAGE-SET('pixel.png' 1x)" width="1" height="1"/></svg>`,
    /CSS関数/,
  ],
  [
    'uppercase url in a presentation attribute',
    '<svg><rect fill="URL(https://x/p.svg#g)" width="1" height="1"/></svg>',
    /url\(\)/,
  ],
])('rejects %s', (label, body, expected) => {
  const problems = inspectHtml(page(body));
  assert.ok(problems.length, `${label}: ${body}`);
  assert.ok(
    problems.some((problem) => expected.test(problem)),
    problems.join('\n'),
  );
});

test('documents need a doctype and a charset and may not be empty', () => {
  assert.deepEqual(inspectHtml('  \n'), ['HTML版が空です']);
  assert.match(inspectHtml(`${page('x')}<div class="a"`)[0]!, /閉じていません/);
  assert.match(inspectHtml(page('x').replace(/^<!doctype html>\n/, ''))[0]!, /doctype/);
  assert.match(inspectHtml(page('x', ''))[0]!, /charset/);
  assert.deepEqual(inspectHtml(`﻿${page('x', '<META CHARSET="utf-8">')}`), []);
  assert.deepEqual(inspectHtml(page('x', '<meta charset="UTF8">')), []);
});
