# TODO

AEO/GEO 檢測工具的待辦清單。建立於 2026-08-06。

排序基準：影響工具核心價值的程度 × 觸發機率，同分時以修復成本判斷。
**本清單假設這是本機單機工具**；若改為公開部署，順序會大幅變動，見文末「公開部署時的重新排序」。

---

## 待辦（1 = 最重要）

### 1. robots.txt 規則與頁面路徑的百分比編碼不一致

- 檔案：`server/lib/analyzers/crawler-access.js` 的 `findLongestMatch`／`server/routes/analyze.js`
- 問題：傳進去比對的 `finalUrl.pathname` 一定是百分比編碼過的（`/%E9%97%9C%E6%96%BC`），
  但 robots.txt 裡的規則多半直接寫中文（`Disallow: /關於`）。兩邊字串對不起來，
  規則會被當成沒命中。
- 修法：依 RFC 9309，比對前把規則與路徑都正規化成百分比編碼（規則用 `encodeURI` 處理，
  已編碼的部分要避免二次編碼）。
- 為什麼最優先：與已修好的路徑比對是同一類「假的綠燈」，而且中文網站正是這個工具的主要對象。
- 估時：40 分鐘

### 2. 零單元測試

- 對象：`server/lib/scoring.js`、`crawler-access.js` 的 `parseRobotsTxt` 與 `isPathBlocked`
  （兩者目前皆未 export，寫測試時要一併加上）、`server/lib/charset.js` 的 `decodeHtmlBuffer`、
  `server/lib/ssrf-guard.js` 的 `isBlockedIp`、`structured-data.js` 的 `flattenJsonLd`
  —— 全是無副作用的純函式。
- 工具：Node 18+ 內建 `node:test`，不需新增依賴。
- 為什麼排在其他所有事情之前：它是防止已修好的東西又壞掉的機制。robots.txt 比對邏輯
  （已完成的項目）若有測試，「`Allow` 沒被使用」第一天就會被抓到。
- 估時：2-3 小時

### 3. 追蹤的 AI 爬蟲清單不完整

- 檔案：`server/lib/analyzers/crawler-access.js` 的 `TRACKED_BOTS`
- 缺少：`Applebot-Extended`、`meta-externalagent`（Meta AI）、`Amazonbot`、
  `Bytespider`（豆包／TikTok）、`cohere-ai`、`Diffbot`
- 為什麼：站方封鎖了 Meta AI，報告完全不會提，也是假陰性。屬於資料補齊而非邏輯錯誤，投報率高。
- 估時：20 分鐘

### 4. DNS rebinding（TOCTOU）完整防護

- 檔案：`server/lib/ssrf-guard.js` 的 `assertSafeUrl`（限制已寫在該函式的 JSDoc）
- 問題：解析出的 IP 無法交給後續的 `fetch` 使用（Node 內建 fetch 沒有指定連線 IP 的選項），
  實際連線時會再解析一次 DNS。攻擊者若控制 DNS 伺服器，可第一次回公開 IP 通過檢查、
  第二次回內網 IP 建立連線。
- 修法：改用 `undici` 自訂 Agent 指定已解析的 IP，同時保留原 hostname 於 Host header 與 TLS SNI。
- 為什麼不更前面：利用門檻高（需控制 DNS 伺服器並贏得 race），且已在註解明確標記為未實作，
  不會誤導維護者。**本機使用時風險低，公開部署時大幅上升。**
- 估時：2-3 小時

### 5. `/api/analyze` 無速率限制、錯誤訊息可用於內網探測

- 檔案：`server/routes/analyze.js`（`err.message` 原封不動回給前端）、`server/index.js`（無 rate limit）
- 問題：錯誤訊息措辭差異（「無法解析網域名稱」vs「連線被拒絕」vs「位於私有網段」）
  可被用來推測內網有哪些主機存在。無速率限制則讓 endpoint 成為免費的 SSRF 代理。
- 為什麼不更前面：本機單機使用時無實質意義（你自己打自己）。
- 估時：1 小時

### 6. `express.static` 開放過多檔案

- 檔案：`server/index.js:11`
- 問題：`client/package.json`、`client/package-lock.json`、`client/scss/*.scss` 全部可從瀏覽器下載。
- 修法：把 `index.html`、`css/`、`js/` 移到 `client/public/`，只服務那一層。
- 為什麼不更前面：目前這些檔案沒有機密，屬於「不該暴露但沒實害」。
- 估時：20 分鐘

### 7. 依賴 Google Fonts

- 檔案：`client/index.html:8-13`
- 問題：離線環境下字型掉回系統預設、視覺整個垮掉；同時每次開啟都把使用者資訊送給 Google。
- 修法：改用本地 woff2 字型檔（專案已有 SCSS build step，成本不高）。
- 估時：40 分鐘

### 8. 冗餘 selector 與重複的類型陣列

- `server/lib/analyzers/semantic-html.js:23`：`$('script[src], script:not([src])')` 等同 `$('script')`，
  且 filter 內連續呼叫三次 `$(el).attr('type')`。
- `server/lib/analyzers/content-trust.js:55`：`$('article a[href], main a[href], body a[href]')` 中
  `body a[href]` 已涵蓋前兩者。
- `server/lib/analyzers/structured-data.js:74,79`：`['Organization', 'WebSite', 'LocalBusiness']`
  重複寫兩次；第 79 行為 190 字元的三元運算子。
- 為什麼排在後面：純可讀性，不影響任何輸出。
- 估時：20 分鐘

### 9. `build:css` 的輸出格式與版控裡的 `main.css` 不一致

- 檔案：`client/package.json:6`（`build:css` 帶 `--style=compressed`）／`client/css/main.css`（版控裡是展開格式）
- 問題：照 README 或 `package.json` 跑 `npm run build:css`，會把整支 CSS 從展開格式改寫成
  壓縮成一行，產生 700 行以上的無關 diff。真正的樣式改動會被埋在裡面，code review 看不出來。
  `watch:css` 沒帶 `--style` 所以輸出展開格式，兩支 script 的產物互不相容，交替使用會來回翻攪整個檔案。
- 修法：二選一——把 `build:css` 的 `--style=compressed` 拿掉（與 `watch:css` 一致，維持現在版控裡的格式），
  或保留壓縮並把 `client/css/main.css` 一次性改成壓縮格式提交。前者的 diff 較乾淨，後者的產物較小。
  這是取捨不是對錯，需要你決定。
- 觸發紀錄：2026-08-06 修 HTTP 錯誤頁警示時實際踩到，當次改用
  `npx sass scss/main.scss:css/main.css --no-source-map` 繞過。
- 為什麼排在這裡：不影響工具的任何輸出，但只要有人照 script 跑就一定會踩到，而且修起來只要五分鐘。
- 估時：5 分鐘（改 script）或 10 分鐘（改格式並重新提交產物）

### 10. HTTP 410 與 404 共用同一段警示文案

- 檔案：`client/js/main.js` 的 `statusBannerCopy`
- 問題：410 Gone 的語意是「站方明確表示此資源已永久移除」，目前與 404 共用
  「請先確認網址有沒有打錯」的說法。網址其實沒打錯，該做的是把指向它的連結拿掉。
- 修法：410 獨立一個分支，文案改為說明資源已被永久移除、以及這對 AI 引擎既有索引的影響。
- 為什麼最後：文案精確度問題，而且 410 在真實世界極少見（多數站方直接回 404）。
- 估時：10 分鐘

---

## 公開部署時的重新排序

上述順序假設本機單機使用。若部署到公開網址，此 endpoint 等同「任何人都能免費驅動、
去抓任意網址」的代理，會被拿來當 SSRF 掃描器與流量放大器。此時順序改為：

1. 第 5 項（速率限制 + 錯誤訊息不外洩）
2. 第 4 項（DNS rebinding 完整防護）
3. 第 6 項（`express.static` 目錄收斂）
4. 之後才是第 1、2、3 項（評分正確性與測試）

---

## 已完成

2026-08-06，HTTP 4xx/5xx 錯誤頁警示（完成時列為待辦第 1 項）已完成並實測驗證：

- **錯誤頁照樣被評分卻沒有任何警示**（`client/index.html`、`client/js/main.js`、
  `client/scss/components/_report.scss`）
  報告最上方新增 `status-banner`，`httpStatus >= 400` 時顯示，位置在 `gate-banner` 之前
  （HTTP 錯誤比 robots.txt 封鎖更根本，且兩者可能同時發生）。
  文案依狀態碼分三類，因為使用者要採取的行動不同：401／403 說明是站方的 bot 防護擋下本工具、
  404／410 提示網址可能打錯或頁面已下架、5xx 建議稍後再掃；三類都明講「下方分數描述的是
  這張錯誤頁面本身的內容品質」。
  **選擇警示而非直接擋下不分析的理由**：robots.txt 與 llms.txt 抓的是 origin 層級的檔案，
  就算這個路徑 404，「AI 爬蟲存取權限明細」那一段的結論仍然完全成立，擋下等於丟掉正確資料。
  這也與既有 `gate-banner`「照樣給分但講清楚分數的對象」的處理方式一致。
  **實作位置與原待辦記載不同**：原本寫在 `server/routes/analyze.js`，實際改在前端——
  `httpStatus` 早就在 API 回應裡（`analyze.js:63`），後端再包一層警示物件只是多一層封裝，
  該檔案至今仍未檢查 `page.status`，這是刻意的。
  驗證：實際掃描 `https://www.google.com/aeogeo-does-not-exist-xyz`，確認 API 回
  `httpStatus=404` 且照樣給出 33 分（重現問題）；再用 Node `vm` 沙箱載入真實的 `main.js`
  搭配最小 DOM stub，確認 200／204／304 不顯示、401／403／404／410／418／500／503
  顯示且文案分類正確。CSS 已重新編譯，確認 `.status-banner:not([hidden])` 進了 `main.css`。
  **未經瀏覽器目視確認**：DOM stub 的 `getElementById` 會偽造任何 id，所以上述測試證明的是
  文案分支與 `hidden` 開關，不是 id 有沒有接對（id 與 class 是逐一比對三支檔案確認的）；
  視覺結果由編譯後的 CSS 推得，沒有實際開瀏覽器看過。

2026-08-06，robots.txt 路徑比對（完成時列為待辦第 1 項）已修復並實測驗證：

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

已知未處理的限制（已列入待辦）：規則與路徑的百分比編碼不一致（待辦第 1 項）；
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
  實際防護見上方待辦第 4 項。
- **輔助檔案的 body 無大小上限**（`server/lib/fetch-page.js`）
  `readBodyWithLimit` 改為接受 `maxBytes`：HTML 5MB、robots.txt / llms.txt 512KB。
  驗證：4MB 回應被中止，heapUsed 停在 8MB。

附帶的行為變更：

- timeout 現在涵蓋 body 讀取（原本在 fetch resolve 後就 clearTimeout，慢速 body 可無限佔用資源）。
- 輔助檔案上限從「200,000 字元」改為「512KB bytes」（對齊 Google robots.txt 解析上限，
  真實世界的 robots.txt 不會被截斷）。
- `assertSafeUrl` 不再有回傳值（已確認無呼叫端使用，非 breaking change）。
