'use strict';

const path = require('node:path');
const express = require('express');
const analyzeRouter = require('./routes/analyze');
const { createRateLimiter } = require('./lib/rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// 這個設定決定 req.ip 從哪裡取值,而 req.ip 是速率限制的計數鍵(見 lib/rate-limit.js),
// 所以填錯的後果都落在速率限制上。
//
// 預設 0 = 不信任任何代理,req.ip 取 TCP 連線的對端位址,偽造不了。
// 本機開發,以及任何直接對外(前面沒有代理)的部署,都該維持 0。
//
// 部署到反向代理後面時,才把它設成「代理層數」,讓 Express 從連線鏈的尾端往前跳過 N 個位址。
// 層數必須實測,不要照抄別人的數字,兩個方向錯的代價不一樣:
//   設太低 —— req.ip 變成代理自己的位址,全站所有人共用同一份額度(可用性問題)。
//   設太高 —— 連線鏈比 N 短時,Express 會信任整條 X-Forwarded-For 並回傳最左邊那一個,
//             而最左邊那個是客戶端自己填的,等於 `trust proxy: true`,速率限制直接被繞過。
// 因此從 1 開始往上試,不要一開始就給大的值。
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS) || 0;
if (TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', TRUST_PROXY_HOPS);
}

app.use(express.json({ limit: '10kb' }));

// Content-Security-Policy —— 這是防禦深度,不是在補一個已知的洞。
//
// 目前整套 XSS 防禦只有一層:client/public/js/main.js 全面用 textContent 的約定
// (見該檔開頭註解)。這層約定經逐檔確認沒有破口,但它沒有機制強制 —— 只要日後
// 有人寫錯一次 innerHTML,被檢測網站的 <title> 就能對這個工具下 XSS。
// 第二個理由是 index.html 那支第三方 Umami script(cloud.umami.is,無 SRI):
// 若上游被入侵,目前沒有任何東西限制它能做什麼。
//
// script-src 與 connect-src 兩條都要有 Umami,但**網域不同**,不能兩條抄同一個:
//   script-src  —— https://cloud.umami.is,script.js 從這裡載入。
//   connect-src —— https://gateway.umami.is,統計資料 POST 到這裡(/api/send)。
// 兩條都寫 cloud.umami.is 的話,script 載得進來、資料送不出去,統計會靜默歸零,
// 而且使用者與站方都看不到任何徵兆(已用強制模式實測確認)。
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' https://cloud.umami.is",
  "connect-src 'self' https://cloud.umami.is https://gateway.umami.is",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

// 先用 Report-Only 上線:只在 Console 報告違規、不真的擋,政策寫錯也不影響使用者。
// 觀察 1–2 天、確認 Console 零違規、Umami 後台仍有新資料、報表下載正常之後,
// 才把標頭名稱換成正式的 Content-Security-Policy。
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy-Report-Only', CSP_DIRECTIVES);
  next();
});

// 只服務 client/public,不服務整個 client/ —— 後者會把 package.json、
// package-lock.json 與 scss/ 原始碼一併開放下載。
app.use(express.static(path.join(__dirname, '..', 'client', 'public')));

// 只保護 /api,不保護靜態檔案 —— 開一次頁面就會抓走 HTML、CSS、JS 好幾個檔案,
// 把它們算進同一份額度會讓正常使用者一進站就被擋。
app.use('/api', createRateLimiter(), analyzeRouter);

// 統一錯誤處理:分析過程中任何未預期的例外都回傳 500 而不是讓 process 掛掉。
//
// 有 err.status 就尊重它,沒有才回 500 —— express.json() 遇到格式錯誤的 request body
// 會拋出帶 status: 400 的錯誤,那是使用者輸入問題,不該被記成伺服器故障。
// console.error 因此也只留給 5xx。
//
// 訊息不直接用 err.message:body-parser 的原文是英文的解析器內部訊息
// (例如 "Unexpected token } in JSON at position 12"),放進中文介面既突兀,
// 也把內部實作細節送了出去。4xx 一律換成同一句中文。
//
// 沒用到的 next 參數不能拿掉:Express 4 靠參數個數辨識錯誤處理中介層,
// 少一個參數這一層會靜默退化成普通中介層,所有錯誤都不再被接住。
app.use((err, req, res, next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;

  if (status >= 500) {
    console.error(err);
  } else {
    console.warn(`[${req.method} ${req.originalUrl}] ${status}: ${err.message}`);
  }

  res.status(status).json({ error: status >= 500 ? '伺服器內部錯誤' : '請求格式錯誤' });
});

app.listen(PORT, () => {
  console.log(`AEO/GEO 檢測工具已啟動: http://localhost:${PORT}`);
});
