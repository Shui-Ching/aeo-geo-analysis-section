'use strict';

const { assertSafeUrl } = require('./ssrf-guard');
const { decodeHtmlBuffer } = require('./charset');

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB,避免抓到超大檔案拖垮伺服器
// robots.txt 實務上遠小於此;Google 自己的解析上限也是 500KB,超過的部分本來就會被忽略
const MAX_TEXT_BYTES = 512 * 1024;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const USER_AGENT = 'AEOGEO-Checker/1.0 (+local static analysis tool)';

/**
 * 讀取 response body,超過大小上限就中止連線。
 */
async function readBodyWithLimit(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) {
      reader.cancel();
      throw new Error(`回應內容超過 ${Math.round(maxBytes / 1024)}KB 上限`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * 帶 SSRF 防護的抓取:手動處理重導向(不用 fetch 內建的 redirect:'follow'),
 * 因為每一跳都要重新做一次 SSRF 檢查 —— 否則 A 網址通過檢查後,對方只要回一個
 * 302 指向 169.254.169.254 之類的內網位址,就能繞過整套防護。
 *
 * HTML 主頁與 robots.txt / llms.txt 都必須走這個函式,不可以有任何一條路徑
 * 直接呼叫 fetch 並交給它自己跟隨重導向。
 */
async function safeFetch(targetUrl, { accept, maxBytes }) {
  let currentUrl = targetUrl;
  const redirectChain = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    // timeout 必須涵蓋「連線 + 讀取 body」整段,不能在 fetch resolve 後就清掉:
    // response header 秒回但 body 一個 byte 一個 byte 慢慢吐的連線,一樣會佔住資源
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      let response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: accept },
        });
      } catch (err) {
        throw new Error(`抓取失敗: ${err.message}`);
      }

      if (REDIRECT_STATUSES.includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('伺服器回傳重導向狀態碼但未提供 Location');
        const nextUrl = new URL(location, currentUrl).toString();
        redirectChain.push({ from: currentUrl, to: nextUrl, status: response.status });
        currentUrl = nextUrl;
        continue;
      }

      const body = await readBodyWithLimit(response, maxBytes);
      return { response, body, finalUrl: currentUrl, redirectChain };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`重導向超過 ${MAX_REDIRECTS} 次上限`);
}

async function fetchHtml(targetUrl) {
  const { response, body, finalUrl, redirectChain } = await safeFetch(targetUrl, {
    accept: 'text/html,application/xhtml+xml',
    maxBytes: MAX_HTML_BYTES,
  });

  const { html, charset } = decodeHtmlBuffer(body, response.headers.get('content-type'));

  return {
    finalUrl,
    status: response.status,
    contentType: response.headers.get('content-type') || null,
    charset,
    html,
    redirectChain,
  };
}

/**
 * 抓取 robots.txt / llms.txt 這類輔助檔案,失敗不拋錯(視為不存在),
 * 因為這些檔案本來就常常不存在,不該讓整體分析失敗。
 */
async function fetchTextFileBestEffort(origin, path) {
  const targetUrl = new URL(path, origin).toString();
  try {
    const { response, body } = await safeFetch(targetUrl, {
      accept: 'text/plain',
      maxBytes: MAX_TEXT_BYTES,
    });

    if (!response.ok) return { exists: false, content: null };
    return { exists: true, content: body.toString('utf-8') };
  } catch {
    return { exists: false, content: null };
  }
}

module.exports = { fetchHtml, fetchTextFileBestEffort };
