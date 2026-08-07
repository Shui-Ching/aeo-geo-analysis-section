'use strict';

const CONTENT_TYPES = ['Article', 'BlogPosting', 'NewsArticle', 'FAQPage', 'HowTo', 'Product', 'Recipe', 'Review'];
const ORGANIZATION_TYPES = ['Organization', 'WebSite', 'LocalBusiness'];

function flattenJsonLd(parsed) {
  // JSON-LD 可能是單一物件、陣列,或帶 @graph 的容器,統一攤平成物件陣列方便後續檢查
  if (Array.isArray(parsed)) return parsed.flatMap(flattenJsonLd);
  if (parsed && Array.isArray(parsed['@graph'])) return parsed['@graph'].flatMap(flattenJsonLd);
  return parsed ? [parsed] : [];
}

function getTypes(node) {
  const t = node['@type'];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

/**
 * 分析頁面內的 JSON-LD 結構化資料。JSON.parse 失敗視為獨立的「存在但無法解析」
 * 狀態,不等同於完全沒有結構化資料 —— 這對網站主而言是可修的具體問題。
 */
function analyzeStructuredData($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  const findings = { checks: [] };

  if (scripts.length === 0) {
    findings.checks.push({
      id: 'jsonld-presence',
      label: 'JSON-LD 結構化資料',
      status: 'fail',
      evidence: '頁面中找不到 <script type="application/ld+json">',
      why: 'AI 答案引擎與搜尋引擎透過結構化資料理解頁面實體與內容類型,缺少時只能靠猜測。',
    });
    return { ...findings, nodes: [] };
  }

  const parsedNodes = [];
  let parseErrorCount = 0;

  for (const el of scripts) {
    const raw = $(el).html();
    try {
      const parsed = JSON.parse(raw);
      parsedNodes.push(...flattenJsonLd(parsed));
    } catch {
      parseErrorCount++;
    }
  }

  if (parseErrorCount > 0 && parsedNodes.length === 0) {
    findings.checks.push({
      id: 'jsonld-presence',
      label: 'JSON-LD 結構化資料',
      status: 'fail',
      evidence: `找到 ${scripts.length} 個 JSON-LD 區塊,但全部 JSON.parse 失敗`,
      why: '格式錯誤的 JSON-LD 會被搜尋引擎與 AI 爬蟲直接忽略,等同沒有結構化資料。',
    });
    return { ...findings, nodes: [] };
  }

  findings.checks.push({
    id: 'jsonld-presence',
    label: 'JSON-LD 結構化資料',
    status: parseErrorCount > 0 ? 'warn' : 'pass',
    evidence:
      parseErrorCount > 0
        ? `找到 ${scripts.length} 個區塊,其中 ${parseErrorCount} 個解析失敗`
        : `找到 ${scripts.length} 個可解析的 JSON-LD 區塊`,
    why: '結構化資料是 AI 引擎理解頁面實體最直接的管道。',
  });

  const allTypes = parsedNodes.flatMap(getTypes);

  const orgTypesFound = allTypes.filter((t) => ORGANIZATION_TYPES.includes(t));
  findings.checks.push({
    id: 'jsonld-organization',
    label: '網站/組織基本資料(Organization / WebSite)',
    status: orgTypesFound.length > 0 ? 'pass' : 'warn',
    evidence: orgTypesFound.length > 0 ? `偵測到類型: ${orgTypesFound.join(', ')}` : '未偵測到 Organization / WebSite / LocalBusiness',
    why: '讓 AI 引擎能明確辨識內容出處與品牌實體,是被引用時標註來源的基礎。',
  });

  const contentTypesFound = allTypes.filter((t) => CONTENT_TYPES.includes(t));
  findings.checks.push({
    id: 'jsonld-content-type',
    label: '內容型別標記(Article / FAQPage / HowTo 等)',
    status: contentTypesFound.length > 0 ? 'pass' : 'warn',
    evidence: contentTypesFound.length > 0 ? `偵測到類型: ${[...new Set(contentTypesFound)].join(', ')}` : '未偵測到內容型別 schema',
    why: '標明內容類型能幫助 AI 引擎判斷這段內容適合用在什麼情境的回答中(例如步驟教學 vs 問答)。',
  });

  return { ...findings, nodes: parsedNodes, types: [...new Set(allTypes)] };
}

// flattenJsonLd 僅供本模組使用,export 是為了讓 test/structured-data.test.js 直接測
// 巢狀 @graph 與陣列的攤平行為。
module.exports = { analyzeStructuredData, flattenJsonLd };
