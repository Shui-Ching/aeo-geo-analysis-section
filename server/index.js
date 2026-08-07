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
// 只服務 client/public,不服務整個 client/ —— 後者會把 package.json、
// package-lock.json 與 scss/ 原始碼一併開放下載。
app.use(express.static(path.join(__dirname, '..', 'client', 'public')));

// 只保護 /api,不保護靜態檔案 —— 開一次頁面就會抓走 HTML、CSS、JS 好幾個檔案,
// 把它們算進同一份額度會讓正常使用者一進站就被擋。
app.use('/api', createRateLimiter(), analyzeRouter);

// 統一錯誤處理:分析過程中任何未預期的例外都回傳 500 而不是讓 process 掛掉
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

app.listen(PORT, () => {
  console.log(`AEO/GEO 檢測工具已啟動: http://localhost:${PORT}`);
});
