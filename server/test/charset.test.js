'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const iconv = require('iconv-lite');

const { decodeHtmlBuffer } = require('../lib/charset');

test('decodeHtmlBuffer：沒有任何編碼宣告時預設 UTF-8', () => {
  const buffer = Buffer.from('<html><body>你好</body></html>', 'utf-8');
  const result = decodeHtmlBuffer(buffer, null);
  assert.equal(result.charset, 'utf-8');
  assert.match(result.html, /你好/);
});

test('decodeHtmlBuffer：從 Content-Type header 取得編碼', () => {
  const buffer = iconv.encode('<html><body>測試中文</body></html>', 'big5');
  const result = decodeHtmlBuffer(buffer, 'text/html; charset=Big5');
  assert.equal(result.charset, 'big5');
  assert.match(result.html, /測試中文/, 'Big5 位元組直接當 UTF-8 讀會變亂碼');
});

test('decodeHtmlBuffer：header 沒有編碼時退回 <meta charset>', () => {
  const buffer = iconv.encode('<html><head><meta charset="big5"></head><body>繁體</body></html>', 'big5');
  const result = decodeHtmlBuffer(buffer, 'text/html');
  assert.equal(result.charset, 'big5');
  assert.match(result.html, /繁體/);
});

test('decodeHtmlBuffer：支援 http-equiv 形式的 content-type meta', () => {
  const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=big5"></head><body>舊寫法</body></html>';
  const result = decodeHtmlBuffer(iconv.encode(html, 'big5'), null);
  assert.equal(result.charset, 'big5');
  assert.match(result.html, /舊寫法/);
});

test('decodeHtmlBuffer：header 的編碼優先於 meta 標籤', () => {
  // HTTP header 是傳輸層的權威宣告，與 HTML 內的 meta 衝突時以 header 為準。
  const buffer = iconv.encode('<html><head><meta charset="utf-8"></head><body>優先序</body></html>', 'big5');
  const result = decodeHtmlBuffer(buffer, 'text/html; charset=big5');
  assert.equal(result.charset, 'big5');
  assert.match(result.html, /優先序/);
});

test('decodeHtmlBuffer：utf8 與 utf-8 兩種寫法都認得', () => {
  const buffer = Buffer.from('<html>中文</html>', 'utf-8');
  assert.equal(decodeHtmlBuffer(buffer, 'text/html; charset=utf8').charset, 'utf-8');
  assert.equal(decodeHtmlBuffer(buffer, 'text/html; charset=UTF-8').charset, 'utf-8');
});

test('decodeHtmlBuffer：無法辨識的編碼名稱退回 UTF-8 並標記 fallback', () => {
  const buffer = Buffer.from('<html>fallback</html>', 'utf-8');
  const result = decodeHtmlBuffer(buffer, 'text/html; charset=x-not-a-real-charset');
  assert.equal(result.charset, 'utf-8(fallback)', 'charset 欄位要看得出來是猜的，不是站方宣告的');
  assert.match(result.html, /fallback/);
});

test('decodeHtmlBuffer：只掃前 2048 bytes 找 meta，之後的宣告不生效', () => {
  // 這是刻意的效能取捨:不把整個 buffer 轉字串。真實網站的 <meta charset>
  // 依 HTML 規範必須出現在前 1024 bytes 內，所以這個限制不會誤傷。
  const padding = '<!-- '.padEnd(2100, 'x') + ' -->';
  const html = `<html><head>${padding}<meta charset="big5"></head><body>太後面</body></html>`;
  const result = decodeHtmlBuffer(Buffer.from(html, 'utf-8'), null);
  assert.equal(result.charset, 'utf-8', '超出掃描範圍的 meta 讀不到，退回預設值');
});

test('decodeHtmlBuffer：空 buffer 不拋錯', () => {
  const result = decodeHtmlBuffer(Buffer.alloc(0), null);
  assert.equal(result.html, '');
  assert.equal(result.charset, 'utf-8');
});

test('decodeHtmlBuffer：Content-Type 沒有 charset 參數時不誤判', () => {
  const buffer = Buffer.from('<html>純 header</html>', 'utf-8');
  const result = decodeHtmlBuffer(buffer, 'text/html');
  assert.equal(result.charset, 'utf-8');
});
