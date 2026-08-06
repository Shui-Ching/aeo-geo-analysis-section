'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreCategory, buildScoreSummary } = require('../lib/scoring');

// 產生一組 checks，只有 status 影響計分，其餘欄位補到最少可讀即可。
function checks(...statuses) {
  return statuses.map((status, i) => ({ id: `check-${i}`, label: `檢查 ${i}`, status }));
}

test('scoreCategory：pass 記 1 分、warn 記 0.5 分、fail 記 0 分', () => {
  assert.deepEqual(scoreCategory(checks('pass', 'pass')), {
    score: 100,
    applicableCount: 2,
    totalCount: 2,
  });
  assert.equal(scoreCategory(checks('fail', 'fail')).score, 0);
  assert.equal(scoreCategory(checks('warn', 'warn')).score, 50);
  assert.equal(scoreCategory(checks('pass', 'fail')).score, 50);
  assert.equal(scoreCategory(checks('pass', 'warn')).score, 75);
});

test('scoreCategory：na 從分母移除，不算 0 分', () => {
  // 這是整支計分邏輯最容易寫錯的地方：na 若算 0 分，
  // 「這項檢查不適用這種頁面」會被誤判成「沒做到」而拖低分數。
  const result = scoreCategory(checks('pass', 'na'));
  assert.equal(result.score, 100, 'na 不該把 100 分拉成 50 分');
  assert.equal(result.applicableCount, 1);
  assert.equal(result.totalCount, 2, 'totalCount 仍要含 na，報告要能顯示「N 項中 M 項適用」');
});

test('scoreCategory：全部都是 na 時分數為 null 而非 0', () => {
  assert.deepEqual(scoreCategory(checks('na', 'na')), {
    score: null,
    applicableCount: 0,
    totalCount: 2,
  });
});

test('scoreCategory：空的 checks 陣列回傳 null 分數，不除以零', () => {
  assert.deepEqual(scoreCategory([]), { score: null, applicableCount: 0, totalCount: 0 });
});

test('scoreCategory：分數四捨五入到整數', () => {
  // 2/3 = 66.67 → 67
  assert.equal(scoreCategory(checks('pass', 'pass', 'fail')).score, 67);
  // 1/3 = 33.33 → 33
  assert.equal(scoreCategory(checks('pass', 'fail', 'fail')).score, 33);
  // 2.5/3 = 83.33 → 83
  assert.equal(scoreCategory(checks('pass', 'pass', 'warn')).score, 83);
});

test('buildScoreSummary：三大類別等權重平均', () => {
  const { overallScore, categories } = buildScoreSummary({
    structuredData: { checks: checks('pass', 'pass') }, // 100
    semanticHtml: { checks: checks('pass', 'fail') }, // 50
    contentTrust: { checks: checks('fail', 'fail') }, // 0
  });

  assert.equal(categories.structuredData.score, 100);
  assert.equal(categories.semanticHtml.score, 50);
  assert.equal(categories.contentTrust.score, 0);
  assert.equal(overallScore, 50, '(100 + 50 + 0) / 3 = 50');
});

test('buildScoreSummary：分數為 null 的類別不列入總分計算', () => {
  const { overallScore } = buildScoreSummary({
    structuredData: { checks: checks('pass') }, // 100
    semanticHtml: { checks: checks('fail') }, // 0
    contentTrust: { checks: checks('na', 'na') }, // null，不計入
  });

  // 若 null 被當成 0 分算進三類平均，這裡會變成 33 而不是 50。
  assert.equal(overallScore, 50, '(100 + 0) / 2 = 50');
});

test('buildScoreSummary：三類都無法計分時總分為 null', () => {
  const { overallScore } = buildScoreSummary({
    structuredData: { checks: [] },
    semanticHtml: { checks: checks('na') },
    contentTrust: { checks: [] },
  });
  assert.equal(overallScore, null);
});

test('buildScoreSummary：帶出中文標籤與原始 checks 陣列', () => {
  const structuredChecks = checks('pass');
  const { categories } = buildScoreSummary({
    structuredData: { checks: structuredChecks },
    semanticHtml: { checks: checks('pass') },
    contentTrust: { checks: checks('pass') },
  });

  assert.equal(categories.structuredData.label, '結構化資料');
  assert.equal(categories.semanticHtml.label, '語意化內容結構');
  assert.equal(categories.contentTrust.label, '內容可信度訊號');
  assert.equal(categories.structuredData.checks, structuredChecks, 'checks 應原樣帶出給前端渲染');
});
