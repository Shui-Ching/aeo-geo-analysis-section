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

// DNS 解析失敗、目標落在私有網段、連線被拒或逾時,一律換成這一句。
// 三種結果對外必須完全一樣,否則措辭差異本身就是一個內網探測 oracle:
// 攻擊者送一連串內部主機名進來,再看回哪一種錯誤,就能推測哪些主機存在、
// 哪些名字有對到內網位址。收斂之後他從回應裡拿不到任何區別。
// 這句話同時也是使用者打錯網址時最常見的情況,拿來當通用訊息不會答非所問。
const GENERIC_FETCH_ERROR = '無法連線到該網址,請確認網址正確且可從公開網路存取';

/**
 * 拿掉網址裡的 basic-auth 憑證(https://user:pass@host)再寫進 log。
 * 使用者貼進來的網址是不可信的輸入,原樣寫進 log 等於把密碼留在檔案裡。
 */
function redactCredentials(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl; // 連 URL 都解析不了的字串不會有結構化的憑證欄位
  }

  if (!parsed.username && !parsed.password) return rawUrl;
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}

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
    // 抓取階段的失敗(網址無效、被 SSRF 防護擋下、逾時)是使用者輸入造成的,回 400。
    // 只有被標記 expose 的錯誤才把原文回給前端,其餘一律換成 GENERIC_FETCH_ERROR;
    // 哪些算可公開、為什麼這樣切,見 lib/public-error.js。
    // 真正的原因寫進伺服器 log,本機使用時照樣查得到,只是不再從 HTTP 回應外流。
    if (!err.expose) {
      console.warn(`[analyze] 抓取失敗 ${redactCredentials(normalizedUrl)}: ${err.message}`);
    }
    return res.status(400).json({ error: err.expose ? err.message : GENERIC_FETCH_ERROR });
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
