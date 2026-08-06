'use strict';

const { assertSafeUrl } = require('./ssrf-guard');
const { decodeHtmlBuffer } = require('./charset');

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB,避免抓到超大檔案拖垮伺服器
const USER_AGENT = 'AEOGEO-Checker/1.0 (+local static analysis tool)';

/**
 * 讀取 response body,超過大小上限就中止連線。
 */
async function readBodyWithLimit(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_BODY_BYTES) {
      reader.cancel();
      throw new Error(`回應內容超過 ${MAX_BODY_BYTES / 1024 / 1024}MB 上限`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * 手動處理重導向(不用 fetch 內建的 redirect:'follow'),
 * 是因為每一跳都要重新做 SSRF 檢查,避免 A 網址安全、跳轉到 B 網址其實指向內網。
 */
async function fetchHtml(targetUrl) {
  let currentUrl = targetUrl;
  const redirectChain = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });
    } catch (err) {
      throw new Error(`抓取失敗: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('伺服器回傳重導向狀態碼但未提供 Location');
      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push({ from: currentUrl, to: nextUrl, status: response.status });
      currentUrl = nextUrl;
      continue;
    }

    const buffer = await readBodyWithLimit(response);
    const { html, charset } = decodeHtmlBuffer(buffer, response.headers.get('content-type'));

    return {
      finalUrl: currentUrl,
      status: response.status,
      contentType: response.headers.get('content-type') || null,
      charset,
      html,
      redirectChain,
    };
  }

  throw new Error(`重導向超過 ${MAX_REDIRECTS} 次上限`);
}

/**
 * 抓取 robots.txt / llms.txt 這類輔助檔案,失敗不拋錯(視為不存在),
 * 因為這些檔案本來就常常不存在,不該讓整體分析失敗。
 */
async function fetchTextFileBestEffort(origin, path) {
  const targetUrl = new URL(path, origin).toString();
  try {
    await assertSafeUrl(targetUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) return { exists: false, content: null };
    const text = await response.text();
    return { exists: true, content: text.slice(0, 200_000) };
  } catch {
    return { exists: false, content: null };
  }
}

module.exports = { fetchHtml, fetchTextFileBestEffort };
