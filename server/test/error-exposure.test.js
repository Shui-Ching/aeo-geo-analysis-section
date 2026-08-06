'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');
const http = require('node:http');
const express = require('express');

const { publicError } = require('../lib/public-error');
const { assertSafeUrl } = require('../lib/ssrf-guard');
const analyzeRouter = require('../routes/analyze');

/**
 * 把 /api/analyze 掛在一台臨時 server 上（與 index.js 相同的掛法，但不含速率限制，
 * 那一層另有 rate-limit.test.js 涵蓋）。這些測試要驗的是「HTTP 回應裡看得到什麼」，
 * 直接呼叫函式看不出來，必須真的走一次路由。
 */
function startApi() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', analyzeRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/**
 * 用 node:http 而不是全域 fetch 送請求：專案規定全域 fetch 只能出現在
 * dns-rebinding.test.js 的對照組,別處一律不得使用。
 */
function postAnalyze(port, url) {
  const payload = JSON.stringify({ url });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/analyze',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

/** 讓預檢的 DNS 解析回傳指定位址；不碰網路，測試才不依賴外部環境 */
function mockPrecheckResolve(t, addresses) {
  t.mock.method(dns.promises, 'lookup', async () => addresses);
}

test('publicError 標記 expose，一般 Error 沒有這個標記', () => {
  assert.equal(publicError('可以說的話').expose, true);
  assert.equal(new Error('不能說的話').expose, undefined);
});

test('assertSafeUrl：只描述輸入字串的錯誤可以公開', async () => {
  // 這三種都不牽涉任何 DNS 查詢或網路連線，講出來不會透露這台伺服器的網路環境。
  await assert.rejects(assertSafeUrl('https://not a url'), (err) => {
    assert.equal(err.expose, true);
    assert.equal(err.message, 'URL 格式無效');
    return true;
  });

  await assert.rejects(assertSafeUrl('ftp://example.com/'), (err) => {
    assert.equal(err.expose, true);
    assert.equal(err.message, '僅支援 http 或 https 協定');
    return true;
  });

  await assert.rejects(assertSafeUrl('http://localhost/'), (err) => {
    assert.equal(err.expose, true);
    assert.equal(err.message, '不允許存取 localhost');
    return true;
  });
});

test('assertSafeUrl：描述 DNS 與網段判定結果的錯誤不可公開', async (t) => {
  // 這兩種措辭的差異就是內網探測 oracle 的來源，必須標記為不可公開。
  mockPrecheckResolve(t, [{ address: '192.168.1.1', family: 4 }]);
  await assert.rejects(assertSafeUrl('https://intranet.example.com/'), (err) => {
    assert.ok(!err.expose, '私有網段的判定結果不可以回給前端');
    assert.match(err.message, /私有或保留網段/);
    return true;
  });

  t.mock.restoreAll();
  t.mock.method(dns.promises, 'lookup', async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  });
  await assert.rejects(assertSafeUrl('https://nx.example.com/'), (err) => {
    assert.ok(!err.expose, 'DNS 解析失敗與否不可以回給前端');
    assert.match(err.message, /無法解析網域名稱/);
    return true;
  });
});

test('路由：可公開的錯誤原文回傳給前端', async (t) => {
  const { server, port } = await startApi();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { status, body } = await postAnalyze(port, 'not a url');
  assert.equal(status, 400);
  assert.equal(body.error, 'URL 格式無效', '輸入格式錯誤要講清楚，不然使用者無從修正');
});

test('路由：私有網段與 DNS 失敗回完全相同的訊息', async (t) => {
  // 這是這一項待辦的核心驗收標準。兩種結果只要措辭有任何差異，
  // 攻擊者就能送一連串內部主機名進來，靠回應分辨「這個名字存在且指向內網」
  // 與「這個名字不存在」，把 /api/analyze 當成內網探測工具。
  const { server, port } = await startApi();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.mock.method(console, 'warn', () => {}); // 真正的原因會寫進 log，這裡不需要看到

  // 192.168.1.1 是 IP 字面值，dns.lookup 直接原樣回傳，不會發出查詢
  const blocked = await postAnalyze(port, 'https://192.168.1.1/');
  // .invalid 是 RFC 2606 保證不存在的 TLD，解析必定失敗
  const unresolvable = await postAnalyze(port, 'https://no-such-host.invalid/');

  assert.equal(blocked.status, 400);
  assert.equal(unresolvable.status, 400);
  assert.equal(blocked.body.error, unresolvable.body.error, '兩種失敗對外必須無法區分');
  assert.doesNotMatch(blocked.body.error, /私有|保留網段|解析/, '不可洩漏判定原因');
});

test('路由：不可公開的錯誤仍把真正原因寫進伺服器 log', async (t) => {
  // 收斂訊息是為了不讓資訊外流，不是為了把原因藏起來——
  // 本機使用時仍然要查得到到底是哪一種失敗。
  const { server, port } = await startApi();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const logged = [];
  t.mock.method(console, 'warn', (line) => logged.push(line));

  await postAnalyze(port, 'https://192.168.1.1/');

  assert.equal(logged.length, 1);
  assert.match(logged[0], /私有或保留網段/);
  assert.match(logged[0], /192\.168\.1\.1/, 'log 要帶上是哪一個網址失敗');
});

test('路由：寫進 log 的網址不含 basic-auth 憑證', async (t) => {
  // 使用者貼進來的網址是不可信輸入，https://user:pass@host 這種寫法原樣寫進 log
  // 等於把密碼落地留存。log 仍要保留主機與路徑，否則失去除錯價值。
  const { server, port } = await startApi();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const logged = [];
  t.mock.method(console, 'warn', (line) => logged.push(line));

  await postAnalyze(port, 'https://admin:s3cret@192.168.1.1/panel');

  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /s3cret/, '密碼不可以出現在 log');
  assert.doesNotMatch(logged[0], /admin/, '使用者名稱同樣不該留存');
  assert.match(logged[0], /192\.168\.1\.1\/panel/, '主機與路徑要保留');
});
