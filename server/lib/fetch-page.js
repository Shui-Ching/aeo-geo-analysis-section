'use strict';

// 用 undici 套件的 fetch 而不是全域 fetch:全域 fetch 沒有辦法指定 dispatcher 以外的
// 連線行為,而 dispatcher 必須來自同一份 undici(跨版本的 Agent 不保證能被接受)。
const { fetch, Agent } = require('undici');

const { assertSafeUrl, safeLookup } = require('./ssrf-guard');
const { decodeHtmlBuffer } = require('./charset');
const { publicError } = require('./public-error');

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB,避免抓到超大檔案拖垮伺服器
// robots.txt 實務上遠小於此;Google 自己的解析上限也是 500KB,超過的部分本來就會被忽略
const MAX_TEXT_BYTES = 512 * 1024;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const USER_AGENT = 'AEOGEO-Checker/1.0 (+local static analysis tool)';

// 全專案唯一對外的 dispatcher。connect.lookup 被換成 safeLookup 之後,
// 「檢查 IP」與「連到這個 IP」變成同一次 DNS 解析,DNS rebinding 無從下手。
// 這個模組以外不要再建立其他 Agent,也不要用全域 fetch —— 那等於繞過整層防護。
const safeAgent = new Agent({ connect: { lookup: safeLookup } });

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
      // 可公開:能讀到 body 代表對方是公開主機,講出大小上限不洩漏內網資訊
      throw publicError(`回應內容超過 ${Math.round(maxBytes / 1024)}KB 上限`);
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
 *
 * 兩層防護的分工:assertSafeUrl 是每一跳的預檢(擋協定、localhost,給中文錯誤訊息),
 * safeAgent 的 lookup 才是實際連線時的把關。少了後者,預檢與連線之間會有 TOCTOU 空窗。
 *
 * 連線本身失敗時拋一般 Error(訊息不對外顯示):連線被拒、逾時、TLS 失敗這幾種
 * 措辭的差異可以被用來探測內網有哪些主機在。走到重導向與 body 讀取這一步的
 * 錯誤才用 publicError,因為那時對方已經確定是公開主機。理由見 public-error.js。
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
          dispatcher: safeAgent,
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: accept },
        });
      } catch (err) {
        throw new Error(`抓取失敗: ${err.message}`);
      }

      if (REDIRECT_STATUSES.includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw publicError('伺服器回傳重導向狀態碼但未提供 Location');
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

  throw publicError(`重導向超過 ${MAX_REDIRECTS} 次上限`);
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
