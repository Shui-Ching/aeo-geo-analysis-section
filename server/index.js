'use strict';

const path = require('node:path');
const express = require('express');
const analyzeRouter = require('./routes/analyze');
const { createRateLimiter } = require('./lib/rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// 刻意不設定 `trust proxy`:開了之後 req.ip 會改讀 X-Forwarded-For,
// 而這個 header 任何人都能自己填,速率限制會直接被繞過。
// 之後若真的部署到反向代理後面,要在這裡指定信任的層數或代理位址(不要用 true)。

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
