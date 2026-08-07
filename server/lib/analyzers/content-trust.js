'use strict';

function analyzeContentTrust($, { finalUrl, structuredDataNodes }) {
  const checks = [];

  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || '';
  checks.push({
    id: 'canonical-url',
    label: 'Canonical URL',
    status: canonical ? 'pass' : 'warn',
    evidence: canonical ? canonical : '未找到 <link rel="canonical">',
    why: '避免同一內容的多個網址版本被視為重複來源,分散被引用的權重。',
  });

  const authorMeta = $('meta[name="author"]').attr('content')?.trim();
  const authorSchema = (structuredDataNodes || []).some((n) => n.author);
  const authorByline = $('[rel="author"], .author, [class*="byline" i]').first().text().trim();
  const hasAuthor = Boolean(authorMeta || authorSchema || authorByline);
  checks.push({
    id: 'author-info',
    label: '作者資訊',
    status: hasAuthor ? 'pass' : 'na',
    evidence: hasAuthor
      ? `找到: ${authorMeta ? 'meta[name=author]' : ''}${authorSchema ? ' JSON-LD author' : ''}${authorByline ? ' 頁面 byline 文字' : ''}`.trim()
      : '未偵測到作者資訊(meta / JSON-LD / byline 皆無)',
    why: 'E-E-A-T(專業性/可信度)訊號之一,對評論、新聞、教學類內容較重要;純產品/工具頁通常不適用,故標記為不適用而非扣分。',
  });

  const publishedTime =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    (structuredDataNodes || []).find((n) => n.datePublished)?.datePublished;
  checks.push({
    id: 'publish-date',
    label: '發布/更新日期',
    status: publishedTime ? 'pass' : 'na',
    evidence: publishedTime ? String(publishedTime) : '未偵測到發布或更新日期',
    why: '時效性內容(新聞、教學、價格)若標明日期,AI 引擎較敢直接引用;靜態頁面(如關於我們)通常不適用。',
  });

  const images = $('img').toArray();
  const imagesWithAlt = images.filter((el) => {
    const alt = $(el).attr('alt');
    return alt !== undefined && alt.trim() !== '';
  });
  const altRatio = images.length === 0 ? null : imagesWithAlt.length / images.length;
  checks.push({
    id: 'image-alt-coverage',
    label: '圖片 Alt Text 覆蓋率',
    status: images.length === 0 ? 'na' : altRatio >= 0.8 ? 'pass' : altRatio >= 0.4 ? 'warn' : 'fail',
    evidence: images.length === 0 ? '頁面沒有 <img>' : `${imagesWithAlt.length}/${images.length} 張圖片有 alt 文字(${Math.round(altRatio * 100)}%)`,
    why: '圖片的文字描述是 AI 引擎理解非文字內容的主要方式。',
  });

  const bodyLinks = $('body a[href]').toArray();
  const currentHost = safeHostname(finalUrl);
  const externalLinks = bodyLinks.filter((el) => {
    const href = $(el).attr('href');
    const host = safeHostname(resolveUrl(href, finalUrl));
    return host && host !== currentHost;
  });
  checks.push({
    id: 'external-citations',
    label: '外部引用連結',
    status: externalLinks.length > 0 ? 'pass' : 'na',
    evidence: `偵測到 ${externalLinks.length} 個外部連結`,
    why: '引用外部權威來源是內容可信度訊號之一;純著陸頁/產品頁通常不適用,故標記為不適用而非扣分。',
  });

  return { checks };
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function resolveUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

module.exports = { analyzeContentTrust };
