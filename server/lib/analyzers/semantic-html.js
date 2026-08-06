'use strict';

const MIN_TEXT_LENGTH_FOR_NON_SPA = 200;

function getVisibleText($) {
  const clone = $('body').clone();
  clone.find('script, style, noscript').remove();
  return clone.text().replace(/\s+/g, ' ').trim();
}

function headingLevel(tagName) {
  return Number(tagName.slice(1));
}

/**
 * 分析語意化 HTML 結構。這裡刻意只看伺服器回傳的原始 HTML(不執行 JS),
 * 因為主流 AI 爬蟲(GPTBot、ClaudeBot 等)本身也不執行 JS —— 這正是
 * 「JS 渲染依賴度」檢查要抓的問題:原始 HTML 裡有沒有實質內容。
 */
function analyzeSemanticHtml($) {
  const checks = [];
  const bodyText = getVisibleText($);
  const scriptCount = $('script[src], script:not([src])').filter((_, el) => !$(el).attr('type') || $(el).attr('type') === 'text/javascript' || $(el).attr('type') === 'module').length;

  const looksJsHeavy = bodyText.length < MIN_TEXT_LENGTH_FOR_NON_SPA && scriptCount >= 3;
  checks.push({
    id: 'js-rendering-dependency',
    label: '原始 HTML 內容完整度(非 JS 渲染依賴)',
    status: looksJsHeavy ? 'fail' : 'pass',
    evidence: `原始 HTML 可見文字約 ${bodyText.length} 字,偵測到 ${scriptCount} 個 script 標籤`,
    why: 'GPTBot、ClaudeBot 等主流 AI 爬蟲不執行 JavaScript,若內容仰賴前端渲染,爬蟲抓到的會是近乎空白的頁面。',
  });

  const h1s = $('h1');
  checks.push({
    id: 'h1-uniqueness',
    label: 'H1 標題唯一性',
    status: h1s.length === 1 ? 'pass' : h1s.length === 0 ? 'fail' : 'warn',
    evidence: `頁面中偵測到 ${h1s.length} 個 <h1>`,
    why: '單一明確的 H1 是 AI 引擎判斷頁面主題的第一個訊號,多個或缺少都會造成主題模糊。',
  });

  const headings = $('h1, h2, h3, h4, h5, h6')
    .toArray()
    .map((el) => headingLevel(el.tagName.toLowerCase()));
  let skipped = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) skipped = true;
  }
  checks.push({
    id: 'heading-hierarchy',
    label: '標題階層是否跳級',
    status: headings.length === 0 ? 'na' : skipped ? 'warn' : 'pass',
    evidence: headings.length === 0 ? '頁面沒有任何標題標籤' : `標題序列: ${headings.map((h) => `H${h}`).join(' > ')}`,
    why: '跳級的標題結構(如 H2 直接跳 H4)會讓內容的層級關係難以被自動解析。',
  });

  const title = $('title').first().text().trim();
  const titleLen = title.length;
  checks.push({
    id: 'title-tag',
    label: 'Title 標籤',
    status: !title ? 'fail' : titleLen >= 10 && titleLen <= 60 ? 'pass' : 'warn',
    evidence: title ? `「${title}」(${titleLen} 字)` : '未找到 <title>',
    why: '通常是 AI 引擎顯示引用來源時的標準顯示文字,過短或過長都會被截斷或缺乏資訊量。',
  });

  const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';
  checks.push({
    id: 'meta-description',
    label: 'Meta Description',
    status: !metaDesc ? 'fail' : metaDesc.length >= 50 && metaDesc.length <= 160 ? 'pass' : 'warn',
    evidence: metaDesc ? `${metaDesc.length} 字` : '未找到 meta description',
    why: '許多 AI 摘要在缺乏更好素材時會退而使用 meta description 作為頁面摘要來源。',
  });

  const listCount = $('ul, ol').length;
  const tableCount = $('table').length;
  checks.push({
    id: 'structured-content-blocks',
    label: '結構化內容區塊(清單/表格)',
    status: listCount + tableCount > 0 ? 'pass' : 'warn',
    evidence: `偵測到 ${listCount} 個清單、${tableCount} 個表格`,
    why: '條列與表格是最容易被 AI 引擎精準抽取、逐項引用的內容形式,純長篇段落較難被精確摘要。',
  });

  return { checks, bodyTextLength: bodyText.length };
}

module.exports = { analyzeSemanticHtml };
