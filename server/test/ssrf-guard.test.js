'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');

const { isBlockedIp, safeLookup } = require('../lib/ssrf-guard');

/** 把 callback 形式的 safeLookup 包成 promise，回傳 callback 收到的全部參數 */
function callSafeLookup(hostname, options) {
  return new Promise((resolve, reject) => {
    safeLookup(hostname, options, (err, address, family) => {
      if (err) return reject(err);
      resolve({ address, family });
    });
  });
}

/** 讓 dns.lookup 回傳指定的位址清單（safeLookup 一律以 all:true 呼叫它） */
function mockResolve(t, addresses) {
  t.mock.method(dns, 'lookup', (hostname, options, callback) => {
    callback(null, addresses);
  });
}

test('isBlockedIp：loopback 與 0.0.0.0/8', () => {
  assert.equal(isBlockedIp('127.0.0.1'), true);
  assert.equal(isBlockedIp('127.255.255.255'), true);
  assert.equal(isBlockedIp('0.0.0.0'), true);
  assert.equal(isBlockedIp('0.1.2.3'), true);
});

test('isBlockedIp：RFC 1918 私有網段', () => {
  assert.equal(isBlockedIp('10.0.0.0'), true);
  assert.equal(isBlockedIp('10.255.255.255'), true);
  assert.equal(isBlockedIp('192.168.0.1'), true);
  assert.equal(isBlockedIp('192.168.255.255'), true);
  assert.equal(isBlockedIp('172.16.0.1'), true);
  assert.equal(isBlockedIp('172.31.255.255'), true);
});

test('isBlockedIp：172.16.0.0/12 的邊界只涵蓋 172.16-172.31', () => {
  // /12 很容易被誤寫成 /16(只擋 172.16.x)或 /8(連 172.0-172.255 都擋掉)。
  assert.equal(isBlockedIp('172.15.255.255'), false, '172.15 是公開位址');
  assert.equal(isBlockedIp('172.32.0.0'), false, '172.32 是公開位址');
});

test('isBlockedIp：169.254.0.0/16 link-local(雲端 metadata endpoint)', () => {
  // 169.254.169.254 是 AWS/GCP/Azure 的 metadata endpoint，
  // SSRF 打進去可以直接讀到執行個體的臨時憑證，是這層防護最關鍵的一條。
  assert.equal(isBlockedIp('169.254.169.254'), true);
  assert.equal(isBlockedIp('169.254.0.0'), true);
  assert.equal(isBlockedIp('169.253.255.255'), false);
});

test('isBlockedIp：100.64.0.0/10 CGNAT 網段的邊界', () => {
  assert.equal(isBlockedIp('100.64.0.0'), true);
  assert.equal(isBlockedIp('100.127.255.255'), true);
  assert.equal(isBlockedIp('100.63.255.255'), false);
  assert.equal(isBlockedIp('100.128.0.0'), false);
});

test('isBlockedIp：192.0.0.0/24 與 198.18.0.0/15', () => {
  assert.equal(isBlockedIp('192.0.0.1'), true);
  assert.equal(isBlockedIp('192.0.1.1'), false, '/24 不該擴及 192.0.1.x');
  assert.equal(isBlockedIp('198.18.0.1'), true);
  assert.equal(isBlockedIp('198.19.255.255'), true, '/15 涵蓋 198.18 與 198.19');
  assert.equal(isBlockedIp('198.20.0.0'), false);
});

test('isBlockedIp：192.88.99.0/24 已淘汰的 6to4 relay anycast', () => {
  assert.equal(isBlockedIp('192.88.99.1'), true);
  assert.equal(isBlockedIp('192.88.98.255'), false, '/24 不該擴及 192.88.98.x');
  assert.equal(isBlockedIp('192.88.100.0'), false);
});

test('isBlockedIp：224.0.0.0/4 multicast', () => {
  assert.equal(isBlockedIp('224.0.0.1'), true, 'all-hosts 群組位址');
  assert.equal(isBlockedIp('239.255.255.255'), true, '/4 的上界');
  assert.equal(isBlockedIp('223.255.255.255'), false, '單播位址的上界，不該被擋');
});

test('isBlockedIp：240.0.0.0/4 保留段與廣播位址', () => {
  assert.equal(isBlockedIp('240.0.0.0'), true);
  assert.equal(isBlockedIp('255.255.255.255'), true, '受限廣播位址');
  assert.equal(isBlockedIp('255.255.255.254'), true);
});

test('isBlockedIp：一般公開 IPv4 不被擋', () => {
  assert.equal(isBlockedIp('8.8.8.8'), false);
  assert.equal(isBlockedIp('1.1.1.1'), false);
  assert.equal(isBlockedIp('142.250.196.132'), false);
  assert.equal(isBlockedIp('104.16.0.1'), false);
});

test('isBlockedIp：位元運算在高位元組不會因為 JS 有號整數而出錯', () => {
  // ipv4ToInt 用 `<<` 運算，超過 2^31 的位址若忘了 `>>> 0` 會變成負數，
  // 讓 200.x 之後的公開位址與私有網段的比對結果整個錯亂。
  assert.equal(isBlockedIp('223.255.255.255'), false, '最高的公開單播位址');
  assert.equal(isBlockedIp('200.1.2.3'), false);
  assert.equal(isBlockedIp('192.168.1.1'), true, '高位元組為 192 時仍要正確命中');
  assert.equal(isBlockedIp('255.255.255.255'), true, '整數溢位成負數的話這條會漏擋');
});

test('isBlockedIp：IPv6 loopback、link-local 與 unique local', () => {
  assert.equal(isBlockedIp('::1'), true);
  assert.equal(isBlockedIp('fe80::1'), true);
  assert.equal(isBlockedIp('FE80::1'), true, '大小寫不敏感');
  assert.equal(isBlockedIp('fc00::1'), true);
  assert.equal(isBlockedIp('fd12:3456::1'), true);
});

test('isBlockedIp：IPv4-mapped IPv6 要套用 IPv4 的規則', () => {
  // 不處理的話 `::ffff:127.0.0.1` 就是一條繞過整層防護的捷徑。
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIp('::ffff:169.254.169.254'), true);
  assert.equal(isBlockedIp('::ffff:8.8.8.8'), false);
});

test('isBlockedIp：一般公開 IPv6 不被擋', () => {
  assert.equal(isBlockedIp('2001:4860:4860::8888'), false);
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false);
});

test('safeLookup：all 為 false 時回傳單一位址與 family', async (t) => {
  mockResolve(t, [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ]);

  const { address, family } = await callSafeLookup('example.com', { family: 0, all: false });
  assert.equal(address, '93.184.216.34');
  assert.equal(family, 4, 'family 必須是數字，net.connect 會直接拿去用');
});

test('safeLookup：all 為 true 時原樣回傳陣列', async (t) => {
  const addresses = [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ];
  mockResolve(t, addresses);

  // Node 22 的 net.connect 預設開啟 autoSelectFamily，會以 all:true 呼叫 lookup，
  // 這條路徑走錯的話 IPv6 網域一律連不上。
  const result = await callSafeLookup('example.com', { hints: 1024, all: true });
  assert.deepEqual(result.address, addresses);
});

test('safeLookup：解析結果落在私有網段就拒絕', async (t) => {
  mockResolve(t, [{ address: '169.254.169.254', family: 4 }]);

  await assert.rejects(
    callSafeLookup('metadata.example.com', { all: false }),
    /私有或保留網段/,
  );
});

test('safeLookup：只要有一個位址不安全就整批拒絕', async (t) => {
  // 濾掉不安全的那個、留下其餘位址是不夠的——autoSelectFamily 會同時嘗試多個位址，
  // 而且一個網域同時回公開 IP 與內網 IP 本身就是 DNS rebinding 的攻擊特徵。
  mockResolve(t, [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);

  await assert.rejects(callSafeLookup('rebind.example.com', { all: true }), /私有或保留網段/);
});

test('safeLookup：解析失敗與空結果都往上拋錯', async (t) => {
  t.mock.method(dns, 'lookup', (hostname, options, callback) => {
    callback(new Error('getaddrinfo ENOTFOUND'));
  });
  await assert.rejects(callSafeLookup('nx.example.com', { all: false }), /ENOTFOUND/);

  t.mock.restoreAll();
  mockResolve(t, []);
  await assert.rejects(callSafeLookup('empty.example.com', { all: false }), /沒有可用的 IP/);
});

test('isBlockedIp：無法辨識的格式一律視為不安全', () => {
  // fail-closed:寧可擋掉合法輸入，也不要放行一個看不懂的位址。
  assert.equal(isBlockedIp('not-an-ip'), true);
  assert.equal(isBlockedIp(''), true);
  assert.equal(isBlockedIp('999.999.999.999'), true);
  assert.equal(isBlockedIp('127.0.0.1:8080'), true, '帶埠號的字串不是合法 IP');
  assert.equal(isBlockedIp('0x7f.0.0.1'), true, '十六進位寫法不是合法 IP');
});
