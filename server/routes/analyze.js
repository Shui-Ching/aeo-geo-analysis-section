'use strict';

const express = require('express');
const cheerio = require('cheerio');

const { fetchHtml, fetchTextFileBestEffort } = require('../lib/fetch-page');
const { analyzeCrawlerAccess } = require('../lib/analyzers/crawler-access');
const { analyzeStructuredData } = require('../lib/analyzers/structured-data');
const { analyzeSemanticHtml } = require('../lib/analyzers/semantic-html');
const { analyzeContentTrust } = require('../lib/analyzers/content-trust');
const { buildScoreSummary } = require('../lib/scoring');

const router = express.Router();

router.post('/analyze', async (req, res, next) => {
  const inputUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!inputUrl) {
    return res.status(400).json({ error: '請提供要檢測的網址' });
  }

  const normalizedUrl = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

  let page;
  try {
    page = await fetchHtml(normalizedUrl);
  } catch (err) {
    // 抓取階段的失敗(網址無效、被 SSRF 防護擋下、逾時)是使用者輸入造成的,回 400
    return res.status(400).json({ error: err.message });
  }

  // 這裡起的分析流程全部包在 try/catch 裡並手動 next(err),原因:
  // Express 4 的錯誤處理中介層只接得到「同步拋出」或「明確 next(err)」的錯誤,
  // 接不到 async handler 回傳的 rejected promise(那是 Express 5 才有的行為)。
  // 少了這層,cheerio 解析失敗或某支 analyzer 在畸形資料上拋錯,會變成
  // unhandled rejection —— 請求永遠不回應,而且 Node 18+ 預設會直接終止 process。
  try {
    const $ = cheerio.load(page.html);
    const finalUrl = new URL(page.finalUrl);

    const [robotsTxt, llmsTxt] = await Promise.all([
      fetchTextFileBestEffort(finalUrl.origin, '/robots.txt'),
      fetchTextFileBestEffort(finalUrl.origin, '/llms.txt'),
    ]);

    // robots.txt 的比對對象是路徑加 query,不含 origin 與 hash。
    const crawlerAccess = analyzeCrawlerAccess({
      robotsTxt,
      llmsTxt,
      path: finalUrl.pathname + finalUrl.search,
    });
    const structuredData = analyzeStructuredData($);
    const semanticHtml = analyzeSemanticHtml($);
    const contentTrust = analyzeContentTrust($, {
      finalUrl: page.finalUrl,
      structuredDataNodes: structuredData.nodes,
    });

    const scoreSummary = buildScoreSummary({ structuredData, semanticHtml, contentTrust });

    res.json({
      requestedUrl: inputUrl,
      finalUrl: page.finalUrl,
      httpStatus: page.status,
      charset: page.charset,
      redirectChain: page.redirectChain,
      crawlerAccess,
      overallScore: scoreSummary.overallScore,
      categories: scoreSummary.categories,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
