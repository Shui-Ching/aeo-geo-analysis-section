'use strict';

// 每個來源 IP 在 WINDOW_MS 內最多可送出 MAX_REQUESTS 次請求。
// 一次分析最多會發出三個外部請求(HTML、robots.txt、llms.txt),每個逾時 10 秒,
// 所以這個 endpoint 對伺服器與被掃描的站方都不便宜。
// 10 次/分鐘對人工操作綽綽有餘(手動輸入網址再看報告,一分鐘做不到十次),
// 但足以把「拿這支 API 當 SSRF 掃描器或流量放大器」的速度壓到沒有實用價值。
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

/**
 * 以來源 IP 計數的固定視窗速率限制,回傳一個 Express 中介層。
 *
 * 計數存在記憶體裡,所以只對單一 process 有效;多開幾個 process 或多台機器,
 * 每一份都會有自己的一份計數。這個工具目前是單 process 啟動,夠用。
 *
 * **鍵值取自 `req.ip`,而 `req.ip` 的正確性取決於 `trust proxy` 設定。**
 * 專案刻意沒有開啟 `trust proxy`(見 index.js),所以這裡拿到的是 TCP 連線的
 * 對端位址,無法被偽造。若之後部署到反向代理後面,必須同時設定 `trust proxy`,
 * 否則所有請求會被算在代理那一個 IP 上,等於全站共用一個額度。
 *
 * IPv6 客戶端通常整段 /64 都歸同一個使用者,逐位址計數擋不住換位址重試;
 * 這一點沒有處理,因為本工具的威脅模型是「別讓它變成免費掃描器」,不是防禦有備而來的對手。
 *
 * @param {{windowMs?: number, max?: number}} [options]
 * @returns {(req: object, res: object, next: Function) => void}
 */
function createRateLimiter({ windowMs = WINDOW_MS, max = MAX_REQUESTS } = {}) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const buckets = new Map();
  let lastSweepAt = Date.now();

  return function rateLimit(req, res, next) {
    const now = Date.now();

    // 每個視窗最多清一次過期項目,Map 因此只留得住「近兩個視窗內出現過的 IP」,
    // 不會隨著時間無限膨脹。用請求觸發而不用 setInterval,是為了不讓一個
    // 背景計時器影響 process 的生命週期(以及測試的收尾)。
    if (now - lastSweepAt >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweepAt = now;
    }

    // 取不到來源位址時全部歸到同一個桶,額度共用。這是往嚴格的方向失敗。
    const key = req.ip || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: `請求過於頻繁,請於 ${retryAfterSec} 秒後再試` });
    }

    return next();
  };
}

module.exports = { createRateLimiter, WINDOW_MS, MAX_REQUESTS };
