'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../lib/rate-limit');

/** 最小的 res 替身，只記下中介層做了什麼，不牽扯 Express */
function createRes() {
  const res = { statusCode: null, headers: {}, body: null };
  res.set = (name, value) => {
    res.headers[name] = value;
    return res;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

/**
 * 接管 Date.now，讓「視窗過期」這件事不必靠 sleep。
 * 必須在 createRateLimiter 之前呼叫——限制器建立時會讀一次 Date.now 當作清理基準點。
 */
function mockClock(t, start = 1_700_000_000_000) {
  let now = start;
  t.mock.method(Date, 'now', () => now);
  return { advance: (ms) => (now += ms) };
}

/** 送一次請求，回傳 { res, passed }，passed 表示有沒有被放行到下一層 */
function send(limiter, ip) {
  const res = createRes();
  let passed = false;
  limiter({ ip }, res, () => {
    passed = true;
  });
  return { res, passed };
}

test('額度內的請求全部放行，且不動到 res', (t) => {
  mockClock(t);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

  for (let i = 0; i < 3; i++) {
    const { res, passed } = send(limiter, '203.0.113.1');
    assert.equal(passed, true, `第 ${i + 1} 次應該放行`);
    assert.equal(res.statusCode, null);
  }
});

test('超出額度回 429、附帶 Retry-After，而且不再放行', (t) => {
  mockClock(t);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

  send(limiter, '203.0.113.1');
  send(limiter, '203.0.113.1');
  const { res, passed } = send(limiter, '203.0.113.1');

  assert.equal(passed, false, '被擋下的請求不可以進到分析流程');
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '60');
  assert.match(res.body.error, /請求過於頻繁/);
});

test('Retry-After 隨著視窗剩餘時間遞減', (t) => {
  const clock = mockClock(t);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  send(limiter, '203.0.113.1');
  clock.advance(45_000);
  const { res } = send(limiter, '203.0.113.1');

  // 視窗還剩 15 秒，不能永遠回固定的 60——那會叫使用者多等 45 秒
  assert.equal(res.headers['Retry-After'], '15');
});

test('不同來源 IP 各自計數，互不影響', (t) => {
  mockClock(t);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal(send(limiter, '203.0.113.1').passed, true);
  assert.equal(send(limiter, '203.0.113.1').passed, false, '同一個 IP 的第二次要被擋');
  assert.equal(send(limiter, '203.0.113.2').passed, true, '另一個 IP 不該受牽連');
});

test('視窗過期後額度重置', (t) => {
  const clock = mockClock(t);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal(send(limiter, '203.0.113.1').passed, true);
  assert.equal(send(limiter, '203.0.113.1').passed, false);

  clock.advance(60_000);
  assert.equal(send(limiter, '203.0.113.1').passed, true, '視窗結束後應該拿到新的額度');
});

test('取不到來源 IP 時共用同一份額度，不是無限放行', (t) => {
  // fail-closed：req.ip 是 undefined 的請求全部歸到同一個桶。
  // 若改成「沒有 IP 就直接放行」，攻擊者只要想辦法讓 req.ip 取不到就整個繞過。
  mockClock(t);
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal(send(limiter, undefined).passed, true);
  assert.equal(send(limiter, undefined).passed, false);
});
