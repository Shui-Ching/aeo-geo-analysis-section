'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');
const http = require('node:http');

const { fetchHtml } = require('../lib/fetch-page');

const PUBLIC_IP = '93.184.216.34';
const HOSTNAME = 'rebind.example.com';

/** 開一台只聽 127.0.0.1 的 HTTP server，扮演「攻擊者想打到的內網服務」 */
function startInternalServer() {
  return new Promise((resolve) => {
    const hits = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body>internal service</body></html>');
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, hits, port: server.address().port });
    });
  });
}

/**
 * 模擬 DNS rebinding：預檢那一次解析回公開 IP，之後每一次都回內網 IP。
 *
 * 兩個 API 分別對應兩個階段，缺一不可：
 * - dns.promises.lookup → assertSafeUrl 的預檢
 * - dns.lookup（callback 形式）→ net.connect 建立連線時的解析
 * 真實攻擊靠的是攻擊者自己控制的 DNS 伺服器把 TTL 設成 0 再換答案，
 * 這裡直接換掉解析函式，效果相同但不需要真的架 DNS。
 */
function mockRebinding(t) {
  t.mock.method(dns.promises, 'lookup', async () => [{ address: PUBLIC_IP, family: 4 }]);
  t.mock.method(dns, 'lookup', (hostname, options, callback) => {
    callback(null, [{ address: '127.0.0.1', family: 4 }]);
  });
}

test('DNS rebinding：預檢放行後改指向內網，連線階段仍被擋下', async (t) => {
  const { server, hits, port } = await startInternalServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  mockRebinding(t);

  await assert.rejects(fetchHtml(`http://${HOSTNAME}:${port}/`), /抓取失敗/);

  // 這一條才是真正的驗收標準：內網服務完全沒有收到請求。
  // 錯誤訊息只證明「失敗了」，不證明「沒連出去」——TCP 連線建立後才失敗一樣算漏。
  assert.deepEqual(hits, [], '內網服務不該收到任何請求');
});

test('DNS rebinding 對照組：同一個情境用全域 fetch 會連進內網服務', async (t) => {
  // 這條是上一條測試的對照組，用來證明那個情境真的建得起連線。
  // 少了它，上一條有可能是因為別的原因（例如網域根本解析不到）而通過。
  // 這裡刻意繞過 lib/fetch-page.js 的防護直接用全域 fetch，
  // 是唯一允許在專案裡出現全域 fetch 的地方。
  const { server, hits, port } = await startInternalServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  mockRebinding(t);

  const response = await fetch(`http://${HOSTNAME}:${port}/`);
  const body = await response.text();

  assert.match(body, /internal service/);
  assert.deepEqual(hits, ['/'], '全域 fetch 依照第二次解析結果連到了內網服務');
});
