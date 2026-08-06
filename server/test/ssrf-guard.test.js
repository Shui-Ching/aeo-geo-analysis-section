'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isBlockedIp } = require('../lib/ssrf-guard');

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

test('isBlockedIp：無法辨識的格式一律視為不安全', () => {
  // fail-closed:寧可擋掉合法輸入，也不要放行一個看不懂的位址。
  assert.equal(isBlockedIp('not-an-ip'), true);
  assert.equal(isBlockedIp(''), true);
  assert.equal(isBlockedIp('999.999.999.999'), true);
  assert.equal(isBlockedIp('127.0.0.1:8080'), true, '帶埠號的字串不是合法 IP');
  assert.equal(isBlockedIp('0x7f.0.0.1'), true, '十六進位寫法不是合法 IP');
});
