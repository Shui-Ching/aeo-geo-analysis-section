'use strict';

const iconv = require('iconv-lite');

const CHARSET_ATTR_RE = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i;
const CONTENT_TYPE_CHARSET_RE = /<meta[^>]+http-equiv=["']?content-type["']?[^>]+content=["'][^"']*charset=([\w-]+)/i;

/**
 * 從 HTTP header 或 HTML <meta> 標籤判斷編碼,解碼成 UTF-8 字串。
 * AI 檢測工具常見盲點:繁中網站可能用 Big5,直接當 UTF-8 讀會產生亂碼,
 * 進而讓標題/內容長度等檢查全部失準。
 */
function decodeHtmlBuffer(buffer, contentTypeHeader) {
  let charset = extractCharsetFromHeader(contentTypeHeader);

  if (!charset) {
    // 只需要看檔頭前面一小段就能找到 <meta charset>,不必整個 buffer 轉字串
    const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('latin1');
    const match = CHARSET_ATTR_RE.exec(head) || CONTENT_TYPE_CHARSET_RE.exec(head);
    charset = match ? match[1] : null;
  }

  const normalized = (charset || 'utf-8').toLowerCase();

  if (normalized === 'utf-8' || normalized === 'utf8') {
    return { html: buffer.toString('utf-8'), charset: 'utf-8' };
  }

  if (!iconv.encodingExists(normalized)) {
    return { html: buffer.toString('utf-8'), charset: 'utf-8(fallback)' };
  }

  return { html: iconv.decode(buffer, normalized), charset: normalized };
}

function extractCharsetFromHeader(contentTypeHeader) {
  if (!contentTypeHeader) return null;
  const match = /charset=([\w-]+)/i.exec(contentTypeHeader);
  return match ? match[1] : null;
}

module.exports = { decodeHtmlBuffer };
