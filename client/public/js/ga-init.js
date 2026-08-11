'use strict';

// 站內政策不開 script-src 'unsafe-inline'(見 server/index.js CSP 註解,
// 這是唯一一層 XSS 防禦深度),所以 gtag 官方貼的 inline <script> 版本
// 不能直接貼進 index.html,會被 CSP 靜默擋掉、GA 完全收不到資料。
// 這裡把同一段初始化搬進外部檔案,靠 script-src 'self' 放行。
window.dataLayer = window.dataLayer || [];
function gtag() {
    dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-XKFG2DS9M0');
