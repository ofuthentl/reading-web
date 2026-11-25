import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://ofu.lol/',
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.DOMParser = dom.window.DOMParser;
g.Node = dom.window.Node;
g.Element = dom.window.Element;
g.HTMLElement = dom.window.HTMLElement;

const { parseAndSanitizeEpubBody, sanitizeHtmlToBody, sanitizeSvgBlob } = await import(
  '../src/lib/sanitizeHtml'
);

describe('sanitizeHtml (EPUB XHTML self-closing tags, frameset & XSS)', () => {
  it('mở rộng đúng các thẻ tự đóng non-void (<a/>, <b/>, <div/>, <script/>) không nuốt chữ phía sau', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title/><script/></head>
  <body>
    <div id="marker"/>
    <p><a id="fn1"/>Đoạn một giữ đủ chữ <b/>và không bị in đậm cả đoạn sau.</p>
    <p>Đoạn hai vẫn hiển thị bình thường với <ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>.</p>
  </body>
</html>`;
    const body = parseAndSanitizeEpubBody(xhtml);
    const paragraphs = body.querySelectorAll('p');
    assert.equal(paragraphs.length, 2);
    assert.ok(paragraphs[0].textContent?.includes('Đoạn một giữ đủ chữ'));
    assert.ok(paragraphs[0].textContent?.includes('và không bị in đậm cả đoạn sau.'));
    // Thẻ <b> tự đóng phải đóng ngay, không bọc text phía sau
    const boldEl = paragraphs[0].querySelector('b');
    assert.equal(boldEl?.textContent || '', '');
    // Thẻ <a id="fn1"/> phải đóng ngay, không bọc cả đoạn văn
    const anchorEl = paragraphs[0].querySelector('a#fn1');
    assert.equal(anchorEl?.textContent || '', '');
    // Giữ nguyên Furigana <ruby><rt><rp>
    assert.equal(body.querySelector('ruby rt')?.textContent, 'かんじ');
    // Không còn <script>
    assert.equal(body.querySelector('script'), null);
  });

  it('xử lý an toàn <frameset> không crash (null-guard DOMPurify RETURN_DOM)', () => {
    const body = sanitizeHtmlToBody('<frameset cols="50%,50%"><frame src="a.html"/></frameset>');
    assert.ok(body);
    assert.equal(body.querySelector('frameset'), null);
    assert.equal(body.querySelector('frame'), null);
  });

  it('loại bỏ triệt để XSS, style inline, srcset nhưng giữ epub:type và role', () => {
    const malicious = `
      <section role="doc-chapter" epub:type="chapter">
        <p style="color:red" onclick="alert(1)">Nội dung sạch</p>
        <img src="cover.jpg" srcset="evil.jpg 2x" onerror="alert(2)" alt="Minh hoạ"/>
        <a href="javascript:alert(3)" epub:type="noteref" role="doc-noteref">[1]</a>
        <script>window.__pwned = true;</script>
        <iframe src="https://evil.example"></iframe>
      </section>
    `;
    const body = parseAndSanitizeEpubBody(malicious);
    assert.equal(body.querySelector('script'), null);
    assert.equal(body.querySelector('iframe'), null);
    const p = body.querySelector('p');
    assert.equal(p?.textContent, 'Nội dung sạch');
    assert.equal(p?.getAttribute('style'), null);
    assert.equal(p?.getAttribute('onclick'), null);
    const img = body.querySelector('img');
    assert.equal(img?.getAttribute('srcset'), null);
    assert.equal(img?.getAttribute('onerror'), null);
    const link = body.querySelector('a');
    assert.equal(link?.getAttribute('href'), null);
    assert.equal(link?.getAttribute('role'), 'doc-noteref');
    assert.equal(link?.getAttribute('epub:type'), 'noteref');
  });

  it('sanitizeSvgBlob chặn <script>, onload và <foreignObject> nhưng giữ hình vẽ hợp lệ', async () => {
    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(2)</script>
      <foreignObject><div>bad</div></foreignObject>
      <path d="M0 0 L10 10" />
    </svg>`;
    const cleanBlob = await sanitizeSvgBlob(new Blob([rawSvg], { type: 'image/svg+xml' }));
    const cleanText = await cleanBlob.text();
    assert.ok(cleanText.includes('<path'));
    assert.ok(!cleanText.includes('<script'));
    assert.ok(!cleanText.includes('onload'));
    assert.ok(!cleanText.includes('foreignObject'));
  });
});
