# TODO

AEO/GEO 檢測工具的待辦清單。建立於 2026-08-06。

排序基準：影響工具核心價值的程度 × 觸發機率，同分時以修復成本判斷。
**本清單假設這是本機單機工具**；若改為公開部署，順序會大幅變動，見文末「公開部署時的重新排序」。

---

## 待辦（1 = 最重要）

### 1. HTTP 4xx/5xx 錯誤頁照樣被評分

- 檔案：`server/routes/analyze.js`（取得 `page` 之後未檢查 `page.status`）
- 問題：掃到 404 頁面會產出一份看起來正常的報告，只有 meta 區塊角落的「HTTP 狀態」透露真相。
- 修法：`status >= 400` 時比照 gate banner 在報告最上方給明確警示，或直接擋下不分析。
- 為什麼最優先：輸出錯誤結論，而且觸發機率高——網址打錯一個字就會發生。成本低。
- 估時：30 分鐘

### 2. robots.txt 規則與頁面路徑的百分比編碼不一致

- 檔案：`server/lib/analyzers/crawler-access.js` 的 `findLongestMatch`／`server/routes/analyze.js`
- 問題：傳進去比對的 `finalUrl.pathname` 一定是百分比編碼過的（`/%E9%97%9C%E6%96%BC`），
  但 robots.txt 裡的規則多半直接寫中文（`Disallow: /關於`）。兩邊字串對不起來，
  規則會被當成沒命中。
- 修法：依 RFC 9309，比對前把規則與路徑都正規化成百分比編碼（規則用 `encodeURI` 處理，
  已編碼的部分要避免二次編碼）。
- 為什麼排第二：與已修好的路徑比對是同一類「假的綠燈」，而且中文網站正是這個工具的主要對象。
  排在第一項之後是因為觸發條件較窄（要站方真的用中文路徑寫 Disallow 才會踩到）。
- 估時：40 分鐘

### 3. 零單元測試

- 對象：`server/lib/scoring.js`、`crawler-access.js` 的 `parseRobotsTxt` 與 `isPathBlocked`
  （兩者目前皆未 export，寫測試時要一併加上）、`server/lib/charset.js` 的 `decodeHtmlBuffer`、
  `server/lib/ssrf-guard.js` 的 `isBlockedIp`、`structured-data.js` 的 `flattenJsonLd`
  —— 全是無副作用的純函式。
- 工具：Node 18+ 內建 `node:test`，不需新增依賴。
- 為什麼排在其他所有事情之前：它是防止已修好的東西又壞掉的機制。robots.txt 比對邏輯
  （已完成的第一項）若有測試，「`Allow` 沒被使用」第一天就會被抓到。
- 估時：2-3 小時

### 4. 追蹤的 AI 爬蟲清單不完整

- 檔案：`server/lib/analyzers/crawler-access.js` 的 `TRACKED_BOTS`
- 缺少：`Applebot-Extended`、`meta-externalagent`（Meta AI）、`Amazonbot`、
  `Bytespider`（豆包／TikTok）、`cohere-ai`、`Diffbot`
- 為什麼：站方封鎖了 Meta AI，報告完全不會提，也是假陰性。屬於資料補齊而非邏輯錯誤，投報率高。
- 估時：20 分鐘

### 5. DNS rebinding（TOCTOU）完整防護

- 檔案：`server/lib/ssrf-guard.js` 的 `assertSafeUrl`（限制已寫在該函式的 JSDoc）
- 問題：解析出的 IP 無法交給後續的 `fetch` 使用（Node 內建 fetch 沒有指定連線 IP 的選項），
  實際連線時會再解析一次 DNS。攻擊者若控制 DNS 伺服器，可第一次回公開 IP 通過檢查、
  第二次回內網 IP 建立連線。
- 修法：改用 `undici` 自訂 Agent 指定已解析的 IP，同時保留原 hostname 於 Host header 與 TLS SNI。
- 為什麼不更前面：利用門檻高（需控制 DNS 伺服器並贏得 race），且已在註解明確標記為未實作，
  不會誤導維護者。**本機使用時風險低，公開部署時大幅上升。**
- 估時：2-3 小時

### 6. `/api/analyze` 無速率限制、錯誤訊息可用於內網探測

- 檔案：`server/routes/analyze.js`（`err.message` 原封不動回給前端）、`server/index.js`（無 rate limit）
- 問題：錯誤訊息措辭差異（「無法解析網域名稱」vs「連線被拒絕」vs「位於私有網段」）
  可被用來推測內網有哪些主機存在。無速率限制則讓 endpoint 成為免費的 SSRF 代理。
- 為什麼不更前面：本機單機使用時無實質意義（你自己打自己）。
- 估時：1 小時

### 7. `express.static` 開放過多檔案

- 檔案：`server/index.js:11`
- 問題：`client/package.json`、`client/package-lock.json`、`client/scss/*.scss` 全部可從瀏覽器下載。
- 修法：把 `index.html`、`css/`、`js/` 移到 `client/public/`，只服務那一層。
- 為什麼不更前面：目前這些檔案沒有機密，屬於「不該暴露但沒實害」。
- 估時：20 分鐘

### 8. 依賴 Google Fonts

- 檔案：`client/index.html:8-13`
- 問題：離線環境下字型掉回系統預設、視覺整個垮掉；同時每次開啟都把使用者資訊送給 Google。
- 修法：改用本地 woff2 字型檔（專案已有 SCSS build step，成本不高）。
- 估時：40 分鐘

### 9. 冗餘 selector 與重複的類型陣列

- `server/lib/analyzers/semantic-html.js:23`：`$('script[src], script:not([src])')` 等同 `$('script')`，
  且 filter 內連續呼叫三次 `$(el).attr('type')`。
- `server/lib/analyzers/content-trust.js:55`：`$('article a[href], main a[href], body a[href]')` 中
  `body a[href]` 已涵蓋前兩者。
- `server/lib/analyzers/structured-data.js:74,79`：`['Organization', 'WebSite', 'LocalBusiness']`
  重複寫兩次；第 79 行為 190 字元的三元運算子。
- 為什麼最後：純可讀性，不影響任何輸出。
- 估時：20 分鐘

---

## 公開部署時的重新排序

上述順序假設本機單機使用。若部署到公開網址，此 endpoint 等同「任何人都能免費驅動、
去抓任意網址」的代理，會被拿來當 SSRF 掃描器與流量放大器。此時順序改為：

1. 第 6 項（速率限制 + 錯誤訊息不外洩）
2. 第 5 項（DNS rebinding 完整防護）
3. 第 7 項（`express.static` 目錄收斂）
4. 之後才是第 1、2、3、4 項（評分正確性與測試）

---

## 已完成

2026-08-06，robots.txt 路徑比對（原待辦第 1 項）已修復並實測驗證：

- **`isPathBlocked` 不比對路徑、`Allow` 規則解析了卻沒用**（`server/lib/analyzers/crawler-access.js`）
  `analyzeCrawlerAccess` 新增 `path` 參數（由 `analyze.js` 以 `finalUrl.pathname + finalUrl.search` 傳入），
  比對改為 RFC 9309 的最長比對：Disallow 與 Allow 各取字面最長的命中規則，長度相同時 Allow 勝出。
  規則支援 `*` 萬用字元與結尾 `$` 錨定（`Disallow: /*` 這種常見全站封鎖寫法純前綴比對會漏判）。
  `note` 欄位改為說明命中哪一條規則、封鎖範圍是全站還是只有此路徑。
  順帶把空值 `Allow` 濾掉，與空值 `Disallow` 的處理對稱（在最長比對下不影響結果，只是行為一致）。
  **附帶的資安處理**：robots.txt 來自遠端不可信主機，規則轉正規表達式時連續 `*` 先收斂成一個，
  並拒絕長度超過 500 字元或萬用字元超過 10 個的規則，避免 ReDoS 卡住 event loop。
  驗證：17 個案例的臨時腳本全數通過，涵蓋子路徑封鎖、`Allow` 覆蓋 `Disallow`、
  `Disallow: /*`、空值 `Disallow`、最長比對、長度相同時 Allow 勝出、指名群組優先於 `*`、
  `$` 錨定、以及萬用字元過多的惡意規則（3000 字元路徑比對耗時 0ms）。
- **`parseRobotsTxt` 把「只有空值規則」的群組與下一個 `User-agent` 合併**
  （`server/lib/analyzers/crawler-access.js`）
  原本用「disallow/allow 陣列是否為空」判斷群組結束，改為獨立的 `sawRule` 旗標。
  修改前 `User-agent: GPTBot / Disallow:`（標準寫法，意思是「允許全部」）後面接的
  `User-agent: CCBot / Disallow: /` 會被併進同一群組，導致 GPTBot 被誤判為全站封鎖。
  驗證：新增兩個案例，確認空值群組不合併、連續 `User-agent` 仍共用同一群組。

已知未處理的限制（已列入待辦）：規則與路徑的百分比編碼不一致（待辦第 2 項）；
同一個 user-agent 出現兩組不連續規則群組時只有第一組生效（已寫進 JSDoc，暫不處理）。
`note` 欄位目前只存在於 API 回應，前端 `renderCrawlerTable` 只讀 `blocked`，未改動 UI。

2026-08-06，四項 P0 已修復並實測驗證：

- **Express 4 async handler rejection 未被捕捉**（`server/routes/analyze.js`）
  分析階段包進 `try/catch` 並 `next(err)`。修改前 analyzer 拋錯會造成 unhandled rejection：
  請求永不回應且 Node 18+ 直接終止 process。
  驗證：注入必定拋錯的 analyzer，確認回 500 且無 unhandled rejection。
- **robots.txt / llms.txt 的重導向繞過 SSRF 防護**（`server/lib/fetch-page.js`）
  抽出 `safeFetch`，每一跳重導向都呼叫 `assertSafeUrl`；`redirect: 'follow'` 已從專案中移除。
  驗證：本機測試 server 回 302，確認兩跳都進入 SSRF 檢查。
- **`resolvedIp` 宣稱有 DNS rebinding 防護但無任何呼叫端使用**（`server/lib/ssrf-guard.js`）
  移除該回傳值，並把 TOCTOU 限制誠實寫進 JSDoc。**這是移除誤導、不是修好漏洞**，
  實際防護見上方待辦第 5 項。
- **輔助檔案的 body 無大小上限**（`server/lib/fetch-page.js`）
  `readBodyWithLimit` 改為接受 `maxBytes`：HTML 5MB、robots.txt / llms.txt 512KB。
  驗證：4MB 回應被中止，heapUsed 停在 8MB。

附帶的行為變更：

- timeout 現在涵蓋 body 讀取（原本在 fetch resolve 後就 clearTimeout，慢速 body 可無限佔用資源）。
- 輔助檔案上限從「200,000 字元」改為「512KB bytes」（對齊 Google robots.txt 解析上限，
  真實世界的 robots.txt 不會被截斷）。
- `assertSafeUrl` 不再有回傳值（已確認無呼叫端使用，非 breaking change）。
