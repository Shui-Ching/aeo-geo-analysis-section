'use strict';

const path = require('node:path');
const express = require('express');
const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

app.use('/api', analyzeRouter);

// 統一錯誤處理:分析過程中任何未預期的例外都回傳 500 而不是讓 process 掛掉
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

app.listen(PORT, () => {
  console.log(`AEO/GEO 檢測工具已啟動: http://localhost:${PORT}`);
});
