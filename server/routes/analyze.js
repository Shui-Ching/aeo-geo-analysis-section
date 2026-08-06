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

router.post('/analyze', async (req, res) => {
  const inputUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!inputUrl) {
    return res.status(400).json({ error: '請提供要檢測的網址' });
  }

  const normalizedUrl = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

  let page;
  try {
    page = await fetchHtml(normalizedUrl);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const $ = cheerio.load(page.html);
  const origin = new URL(page.finalUrl).origin;

  const [robotsTxt, llmsTxt] = await Promise.all([
    fetchTextFileBestEffort(origin, '/robots.txt'),
    fetchTextFileBestEffort(origin, '/llms.txt'),
  ]);

  const crawlerAccess = analyzeCrawlerAccess({ robotsTxt, llmsTxt });
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
});

module.exports = router;
