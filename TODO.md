# TODO

AEO/GEO 檢測工具的待辦清單。建立於 2026-08-06。

排序基準：影響工具核心價值的程度 × 觸發機率，同分時以修復成本判斷。
**本清單假設這是本機單機工具**；若改為公開部署，順序會大幅變動，見文末「公開部署時的重新排序」。

---

## 待辦（1 = 最重要）

### 1. DNS rebinding（TOCTOU）完整防護

- 檔案：`server/lib/ssrf-guard.js` 的 `assertSafeUrl`（限制已寫在該函式的 JSDoc）
- 問題：解析出的 IP 無法交給後續的 `fetch` 使用（Node 內建 fetch 沒有指定連線 IP 的選項），
  實際連線時會再解析一次 DNS。攻擊者若控制 DNS 伺服器，可第一次回公開 IP 通過檢查、
  第二次回內網 IP 建立連線。
- 修法：改用 `undici` 自訂 Agent 指定已解析的 IP，同時保留原 hostname 於 Host header 與 TLS SNI。
- 為什麼不更前面：利用門檻高（需控制 DNS 伺服器並贏得 race），且已在註解明確標記為未實作，
  不會誤導維護者。**本機使用時風險低，公開部署時大幅上升。**
- 估時：2-3 小時

### 2. `/api/analyze` 無速率限制、錯誤訊息可用於內網探測

- 檔案：`server/routes/analyze.js`（`err.message` 原封不動回給前端）、`server/index.js`（無 rate limit）
- 問題：錯誤訊息措辭差異（「無法解析網域名稱」vs「連線被拒絕」vs「位於私有網段」）
  可被用來推測內網有哪些主機存在。無速率限制則讓 endpoint 成為免費的 SSRF 代理。
- 為什麼不更前面：本機單機使用時無實質意義（你自己打自己）。
- 估時：1 小時

### 3. `express.static` 開放過多檔案

- 檔案：`server/index.js:11`
- 問題：`client/package.json`、`client/package-lock.json`、`client/scss/*.scss` 全部可從瀏覽器下載。
- 修法：把 `index.html`、`css/`、`js/` 移到 `client/public/`，只服務那一層。
- 為什麼不更前面：目前這些檔案沒有機密，屬於「不該暴露但沒實害」。
- 估時：20 分鐘

### 4. 依賴 Google Fonts

- 檔案：`client/index.html:8-13`
- 問題：離線環境下字型掉回系統預設、視覺整個垮掉；同時每次開啟都把使用者資訊送給 Google。
- 修法：改用本地 woff2 字型檔（專案已有 SCSS build step，成本不高）。
- 估時：40 分鐘

### 5. 冗餘 selector 與重複的類型陣列

- `server/lib/analyzers/semantic-html.js:23`：`$('script[src], script:not([src])')` 等同 `$('script')`，
  且 filter 內連續呼叫三次 `$(el).attr('type')`。
- `server/lib/analyzers/content-trust.js:55`：`$('article a[href], main a[href], body a[href]')` 中
  `body a[href]` 已涵蓋前兩者。
- `server/lib/analyzers/structured-data.js:74,79`：`['Organization', 'WebSite', 'LocalBusiness']`
  重複寫兩次；第 79 行為 190 字元的三元運算子。
- 為什麼排在後面：純可讀性，不影響任何輸出。
- 估時：20 分鐘

### 6. `build:css` 的輸出格式與版控裡的 `main.css` 不一致

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

### 7. HTTP 410 與 404 共用同一段警示文案

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

1. 第 2 項（速率限制 + 錯誤訊息不外洩）
2. 第 1 項（DNS rebinding 完整防護）
3. 第 3 項（`express.static` 目錄收斂）

---

## 已完成

2026-08-06，追蹤的 AI 爬蟲清單不完整（完成時列為待辦第 1 項）已補齊：

- **`TRACKED_BOTS` 從 10 支增為 18 支**（`server/lib/analyzers/crawler-access.js`）
  新增 `Applebot-Extended`（Apple）、Meta 三支（`meta-externalagent` 訓練/索引、
  `meta-webindexer` 搜尋引用、`meta-externalfetcher` 使用者即時瀏覽）、`Amazonbot`（Amazon）、
  `Bytespider`（ByteDance）、`cohere-ai`（Cohere）、`Diffbot`。
  Meta 補到三支是為了與 OpenAI／Anthropic 的粒度一致——那兩家都是「訓練／搜尋引用／
  使用者即時瀏覽」三支齊全，Meta 官方文件也剛好對得上這三種。
  排序改為「第一方廠商爬蟲在前，把資料供應給多家模型的第三方（CCBot、Diffbot）在後」，
  所以 CCBot 從最後一列往上移了一格。比對邏輯完全沒動——`isPathBlocked` 兩邊都轉小寫，
  帶連字號的 `meta-externalagent`、`cohere-ai` 走的是同一條路徑。
- **名單裡有兩種性質不同的東西，已寫進檔頭註解**：`Google-Extended` 與 `Applebot-Extended`
  不是真的會來抓網頁的爬蟲，而是 robots.txt 專用的控制標記，擋掉只影響「抓回去的資料
  能不能拿去訓練」，不影響一般搜尋索引（Apple 官方文件明講 Applebot-Extended does not
  crawl webpages itself）。`Bytespider` 則是常被回報無視 robots.txt，`meta-externalfetcher`
  更是 Meta 官方文件自己載明「依使用者要求取用時可能不套用 robots.txt」；報告照樣呈現
  規則的判定結果，因為工具的職責是檢查站方有沒有表態。
- **`cohere-ai` 的用途標為「使用者即時瀏覽」而非訓練**：Cohere 另有
  `cohere-training-data-crawler` 負責訓練資料，`cohere-ai` 目前沒有官方文件說明，
  第三方觀測認為是聊天產品依使用者提問即時取用。這一欄的措辭有不確定性。
- **前端未改動**：`renderCrawlerTable` 是直接跑 `crawlerAccess.bots` 的迴圈，新增的六列
  自動出現，不需要動 `client/js/main.js` 或 HTML。
- `test/crawler-access.test.js` 新增三個測試：ua 不重複且欄位齊全、八支新爬蟲都在名單裡、
  robots.txt 寫成 `Meta-ExternalAgent`／`Cohere-AI`／`BYTESPIDER` 這種實務大小寫仍能命中。
  最後那條的 `deepEqual` 順帶鎖住「agent 是完整比對而非前綴比對」——Meta 三支共用
  `meta-external` 前綴，只指名 `meta-externalagent` 時不該連 `meta-externalfetcher` 一起判封鎖。
- 驗證：`npm test` → `# pass 77 / # fail 0`（測試數從 74 增為 77）。
  **未經真實網站端對端確認**：測試走 `analyzeCrawlerAccess` 的公開介面，沒有實際掃描
  一個 robots.txt 有封鎖 Meta 或 ByteDance 的線上網站。
- 未收錄 `meta-externalads`（廣告與商業產品用途，不屬於 AI 答案引擎）與
  `cohere-training-data-crawler`（原待辦指定的是 `cohere-ai`，兩支性質不同，
  要不要一併追蹤是後續可再決定的事）。

2026-08-06，`isBlockedIp` 未涵蓋 multicast 與保留網段（完成時列為待辦第 3 項）已修補：

- **`BLOCKED_IPV4_RANGES` 補上三個網段**（`server/lib/ssrf-guard.js`）
  `192.88.99.0/24`（已淘汰的 6to4 relay anycast）、`224.0.0.0/4`（multicast）、
  `240.0.0.0/4`（保留段，涵蓋受限廣播位址 `255.255.255.255`）。
  遮罩比對邏輯完全沒動——`bits: 4` 在既有的 `(~0 << (32 - bits)) >>> 0` 下算出 `0xF0000000`，
  與 `/8`、`/24` 走同一條路徑。
  **這是補防禦深度，不是修可利用的漏洞**：HTTP 走 multicast 或廣播位址幾乎建立不了 TCP 連線，
  真正有意義的是 `240.0.0.0/4` 在某些內部網路確實有路由。
- `test/ssrf-guard.test.js` 新增三個測試（各網段的上下界），並把原本刻意迴避 224 以上的
  「位元運算不溢位」測試改回用 `255.255.255.255` 斷言——那條位址現在有明確的預期行為了。
- 驗證：`npm test` → `# pass 74 / # fail 0`（測試數從 71 增為 74）。

2026-08-06，零單元測試（完成時列為待辦第 1 項）已建立並全數通過：

- **`server/test/` 五支測試檔，共 71 個測試案例，`npm test` 全綠。**
  工具是 Node 內建的 `node:test` 與 `node:assert/strict`，沒有新增任何依賴。
  `server/package.json` 新增 `test`（`node --test`）與 `test:watch` 兩支 script。
  **`node --test test/` 這種寫法會失敗**——Node 會把 `test/` 當成單一檔案去 require，
  要嘛不帶參數讓它自己遞迴搜尋，要嘛給明確的 glob。
- 覆蓋範圍：`scoring.js`（10 個，重點是 `na` 從分母移除而不是算 0 分）、
  `crawler-access.js`（29 個，涵蓋 `normalizeForMatch`／`parseRobotsTxt`／`isPathBlocked`
  三層與對外的 `analyzeCrawlerAccess`）、`charset.js`（10 個，Big5 解碼與 header/meta 優先序）、
  `ssrf-guard.js`（12 個，各網段的 CIDR 邊界）、`structured-data.js`（8 個，`@graph` 攤平）。
- **為了測試而新增的 export**：`crawler-access.js` 的 `normalizeForMatch`、`parseRobotsTxt`、
  `isPathBlocked`，以及 `structured-data.js` 的 `flattenJsonLd`。這四支沒有其他模組使用，
  export 的唯一理由寫在各自的 `module.exports` 上方註解裡。
- **這批測試當場抓到一個真 bug**（已修，`crawler-access.js` 的 `encodeUnescapedChunk`）：
  `encodeURI` 自己就會把 `%` 編成 `%25`，原本卻在丟進去之前又手動替換一次，
  結果 `/100%off` 被正規化成 `/100%2525off`。
  **當天稍早那 28 個案例的整合測試看不到這個錯誤**——規則與路徑套用同一個函式，
  兩邊一起錯、一起對得上，最終 `blocked` 仍然正確。只有直接斷言 `normalizeForMatch`
  的輸出字串才看得出來。實際傷害是規則若寫成正確編碼的 `/100%25off`，
  會對不上路徑 `/100%off` 而整條漏判。修好後補了一個
  「`normalizeForMatch('/100%off') === normalizeForMatch('/100%25off')`」的斷言鎖住行為。
  這正是這個待辦項存在的理由，也說明整合測試不能取代單元測試。
- **順帶發現的資安問題**：`isBlockedIp` 沒有涵蓋 multicast 與保留網段。當下未修（超出「寫測試」
  的範圍），測試刻意停在 `223.255.255.255` 不對 224 以上做斷言，避免把缺口固化成規格；
  **同日經確認後已補上，見上一則紀錄**。
- **`server/node_modules` 原本不存在**（專案從未安裝過依賴），本次以 `npm ci` 依 lockfile 安裝，
  `package-lock.json` 未被修改，`node_modules` 已被 `.gitignore` 涵蓋。
- 驗證：`npm test` → `# pass 71 / # fail 0`。當天稍早的 28 案例臨時腳本重跑仍全數通過。

2026-08-06，robots.txt 規則與頁面路徑的百分比編碼不一致（完成時列為待辦第 1 項）已修復並實測驗證：

- **中文（及任何非 ASCII）的 robots.txt 規則永遠比對不到路徑**
  （`server/lib/analyzers/crawler-access.js`）
  新增 `normalizeForMatch`，依 RFC 9309 把規則與路徑都正規化成百分比編碼再比對。
  `compileRule` 在 escape 之前先正規化，`analyzeCrawlerAccess` 對傳入的 path 套用同一個函式。
  **兩邊都要正規化、不能只處理規則那一側**：`URL` 物件不編碼 `[`、`]`、`|`、`^`，
  而 `encodeURI` 會編碼它們，只做單邊會把原本對得上的 ASCII 規則弄成對不上。
  已編碼的片段原樣保留、只把十六進位統一成大寫，避免 `%E9` 被二次編碼成 `%25E9`；
  不做反向解碼，所以 `%2F` 不會被還原成路徑分隔的 `/`。落單的 `%`（例如 `/100%off`）
  交給 `encodeURI` 自己編成 `%25`（**這裡當初寫錯過一次，見上一則紀錄**）。
  **最長比對改用編碼後長度**（`findLongestMatch` 與 Allow/Disallow 的勝負判定），
  因為 RFC 9309 比的是編碼後的 octet 長度，`/關於` 要算 9 個字元而不是 3 個；
  `note` 欄位仍顯示規則原文，不讓使用者讀到 `Disallow: /%E9%97%9C%E6%96%BC`。
  ReDoS 的長度與萬用字元上限**刻意留在原始規則上檢查**，否則中文規則會因編碼後膨脹九倍
  而被 `MAX_RULE_LENGTH` 誤丟（60 個中文字就會超過 500）。
  驗證：28 個案例的臨時腳本全數通過，涵蓋中文／日文／emoji 規則、規則已編碼（大小寫 hex）、
  中文搭配 `*` 與 `$`、空白、`[]`／`|`／`^`、落單的 `%`、`%2F` 不還原、
  以編碼後長度決定的最長比對、以及六項既有行為的回歸。
  同一份腳本對 `git show HEAD` 的修改前版本執行，28 個案例中有 11 個失敗（問題重現）。
  `server/routes/analyze.js` 未改動——正規化放在 analyzer 內部，呼叫端照舊傳
  `finalUrl.pathname + finalUrl.search` 即可。
  **未經真實網站端對端確認**：測試走 `analyzeCrawlerAccess` 的公開介面，
  路徑由真的 `new URL()` 產生（與 `analyze.js:49` 同一種串接方式），
  但沒有實際掃描一個 robots.txt 寫中文規則的線上網站。

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

已知未處理的限制：規則與路徑的百分比編碼不一致（已於同日修復，見上方）；
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
  實際防護見上方待辦第 2 項。
- **輔助檔案的 body 無大小上限**（`server/lib/fetch-page.js`）
  `readBodyWithLimit` 改為接受 `maxBytes`：HTML 5MB、robots.txt / llms.txt 512KB。
  驗證：4MB 回應被中止，heapUsed 停在 8MB。

附帶的行為變更：

- timeout 現在涵蓋 body 讀取（原本在 fetch resolve 後就 clearTimeout，慢速 body 可無限佔用資源）。
- 輔助檔案上限從「200,000 字元」改為「512KB bytes」（對齊 Google robots.txt 解析上限，
  真實世界的 robots.txt 不會被截斷）。
- `assertSafeUrl` 不再有回傳值（已確認無呼叫端使用，非 breaking change）。
