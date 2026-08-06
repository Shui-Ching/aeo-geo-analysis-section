'use strict';

const STATUS_POINTS = { pass: 1, warn: 0.5, fail: 0, na: null };

/**
 * 分數 = 已得分 / 適用項目數(排除 na)。na 從分母移除,而不是算 0 分,
 * 否則「這項檢查根本不適用這種頁面」會被誤判成「沒做到」而拖低分數。
 */
function scoreCategory(checks) {
  const applicable = checks.filter((c) => c.status !== 'na');
  if (applicable.length === 0) {
    return { score: null, applicableCount: 0, totalCount: checks.length };
  }
  const earned = applicable.reduce((sum, c) => sum + STATUS_POINTS[c.status], 0);
  return {
    score: Math.round((earned / applicable.length) * 100),
    applicableCount: applicable.length,
    totalCount: checks.length,
  };
}

const CATEGORY_LABELS = {
  structuredData: '結構化資料',
  semanticHtml: '語意化內容結構',
  contentTrust: '內容可信度訊號',
};

/**
 * 彙整三大類別(結構化資料／語意化結構／內容可信度)為總分,三類等權重平均。
 * AI 爬蟲存取權限不計入此總分 —— 它是獨立的 gate 警示,原因見報告最上方說明。
 */
function buildScoreSummary({ structuredData, semanticHtml, contentTrust }) {
  const categories = {
    structuredData: { label: CATEGORY_LABELS.structuredData, ...scoreCategory(structuredData.checks), checks: structuredData.checks },
    semanticHtml: { label: CATEGORY_LABELS.semanticHtml, ...scoreCategory(semanticHtml.checks), checks: semanticHtml.checks },
    contentTrust: { label: CATEGORY_LABELS.contentTrust, ...scoreCategory(contentTrust.checks), checks: contentTrust.checks },
  };

  const scoredCategories = Object.values(categories).filter((c) => c.score !== null);
  const overallScore =
    scoredCategories.length === 0
      ? null
      : Math.round(scoredCategories.reduce((sum, c) => sum + c.score, 0) / scoredCategories.length);

  return { overallScore, categories };
}

module.exports = { buildScoreSummary, scoreCategory };
