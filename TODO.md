# TODO

AEO/GEO 檢測工具的待辦清單。建立於 2026-08-06。

排序基準：影響工具核心價值的程度 × 觸發機率，同分時以修復成本判斷。
**本清單假設這是本機單機工具**；若改為公開部署，順序會大幅變動，見文末「公開部署時的重新排序」。

---

## 待辦（1 = 最重要）

### 1. HTTP 410 與 404 共用同一段警示文案

- 檔案：`client/public/js/main.js` 的 `statusBannerCopy`
- 問題：410 Gone 的語意是「站方明確表示此資源已永久移除」，目前與 404 共用
  「請先確認網址有沒有打錯」的說法。網址其實沒打錯，該做的是把指向它的連結拿掉。
- 修法：410 獨立一個分支，文案改為說明資源已被永久移除、以及這對 AI 引擎既有索引的影響。
- 為什麼最後：文案精確度問題，而且 410 在真實世界極少見（多數站方直接回 404）。
- 估時：10 分鐘

---

## 公開部署時的重新排序

上述順序假設本機單機使用。若部署到公開網址，此 endpoint 等同「任何人都能免費驅動、
去抓任意網址」的代理，會被拿來當 SSRF 掃描器與流量放大器。

原本排在這一節的三項——DNS rebinding 防護、速率限制／錯誤訊息外洩、`express.static`
目錄收斂——均已完成，見「已完成」（前兩項於 2026-08-06，`express.static` 目錄收斂於
2026-08-07）。目前待辦清單裡沒有任何項目會因為改成公開部署而需要提前。

公開部署前另外要處理、目前不在清單上的兩件事（本機使用不構成問題，故未列為待辦）：

- **沒有全域併發上限**：速率限制是「每個 IP 每分鐘幾次」，擋不住大量不同來源同時打進來。
  真要公開，還需要一個同時進行的分析數上限。
- **速率限制的計數存在單一 process 的記憶體裡**：多開 process 或多台機器時各算各的，
  額度等於乘以份數。

---

## 已完成

2026-08-07，`build:css` 的輸出格式與版控裡的 `main.css` 不一致（完成時列為待辦第 1 項）已修正：

- **`build:css` 的 `--style=compressed` 拿掉，與 `watch:css` 一致輸出展開格式**（`client/package.json:6`）
  這一項原本記為「取捨不是對錯，需要你決定」，決定是**維持版控裡現有的展開格式**，
  而不是保留壓縮、把產物一次性換成壓縮版提交。
- **決定的依據是實測出來的數字，不是偏好**：同一份 SCSS 編出來，展開格式 16721 bytes、
  壓縮格式 13621 bytes，只差 3.1 KB（18.5%）。**gzip 之後的差距也實際量過**：
  3519 bytes 對 3311 bytes，只差 208 bytes（5.9%）——縮排與換行本來就是 gzip 最擅長壓的東西，
  `--style=compressed` 省下來的絕大部分它自己就會省掉。
  用這點差距換掉「每次樣式改動的 diff 都是整行重寫、code review 看不出改了什麼」並不划算。
  **附帶確認**：`server/` 目前沒有掛任何壓縮 middleware（已 grep，`compression`／`gzip`
  在 server 原始碼裡零命中），所以現在實際走線的是 16721 對 13621 那一組數字；
  gzip 那一組是「將來若加上壓縮，差距只會更小」的旁證，不是現況。
- **選壓縮那條路其實比原記載更貴**：`watch:css` 沒帶 `--style`，開發時一存檔就會把檔案翻回展開格式，
  所以真要走壓縮，`watch:css` 也得一起加上 `--style=compressed`，改的是兩支 script 不是一支。
  這一點原本沒有寫進待辦，是這次比較兩條路時才確認的。
- **不需要重新提交產物**：改 script 之前先比對過，版控裡的 `client/public/css/main.css` 與
  展開格式重新編譯的產物 SHA256 完全相同（`DDB05533CEEE7BEC…`），所以拿掉旗標後
  `npm run build:css` 產生的是同一批位元組。
- 驗證：實際跑 `npm run build:css`（**這是三次繞過之後第一次真的跑它**），
  `git status --porcelain` 裡沒有 `client/public/css/main.css`，即 0 行 diff，
  同時證明 script 的相對路徑仍然正確。`npm test` → `# pass 97 / # fail 0`（測試數不變——
  沒有任何測試引用 client 的建置流程，這次跑測試是回歸把關，不是目標）。
- **未涵蓋的部分**：沒有開瀏覽器目視確認頁面；`main.css` 一個位元組都沒變，所以沒有可看的差異。
  這次也沒有補 README——這個 repo 目前根本沒有 README，「照 README 跑會踩到」那句描述的是
  `package.json` 這一條路徑。要不要補 README 是另一件事，未列入待辦。

2026-08-07，冗餘 selector 與重複的類型陣列（完成時列為待辦第 1 項）已清理並驗證輸出未變：

- **`$('script[src], script:not([src])')` 收斂為 `$('script')`，filter 內三次 `attr('type')` 改為取一次**
  （`server/lib/analyzers/semantic-html.js:23`）
  `[src]` 與 `:not([src])` 的聯集必然涵蓋全部 `script` 且互不重疊，所以集合相等。
  **刻意沒有順手 `trim()` 或轉小寫**：目前 `type=" module "` 與 `type="TEXT/JAVASCRIPT"` 都不算數，
  加了正規化會讓這兩種寫法開始被計入 `scriptCount`，那是行為變更不是清理。
  `!type` 同時涵蓋沒有 type 屬性與 `type=""` 兩種情形，與修改前一致。
- **`$('article a[href], main a[href], body a[href]')` 收斂為 `$('body a[href]')`**
  （`server/lib/analyzers/content-trust.js:55`）
  **這一項是「純可讀性」還是「輸出變了」的分水嶺，取決於 cheerio 的逗號 selector 會不會去重**：
  若不去重，巢狀在 `<main><article>` 裡的連結目前會被算三次，「偵測到 N 個外部連結」一直是灌水的，
  收斂就等於改動使用者看得到的數字。**已實測確認會去重**——用
  `<body><main><article>` 三層巢狀的 fixture 量測，`$('article a[href], main a[href], body a[href]').length`
  與 `$('body a[href]').length` 都是 5。所以這是可讀性改動，外部連結數沒有變。
  **沒有再往下收成 `$('a[href]')`**：雖然本次 fixture 裡兩者結果相同（HTML 解析器會把 `<head>` 內的
  `<a>` 搬進 body），但那要仰賴解析器行為，`body a[href]` 的意圖也更明確。
- **`['Organization', 'WebSite', 'LocalBusiness']` 抽成 `ORGANIZATION_TYPES` 常數，命中結果只算一次**
  （`server/lib/analyzers/structured-data.js`）
  `hasOrgOrSite` 改為 `orgTypesFound`，`status` 與 `evidence` 都由它推得，190 字元那行降到 120 餘字元，
  結構也與下面 `contentTypesFound` 那段對稱。
  **刻意沒有替 org 那一欄補上 `[...new Set()]`**：下面的內容型別欄有去重、org 欄沒有，
  所以頁面若有兩個 `Organization` 節點，evidence 目前會顯示「Organization, Organization」。
  這看起來像是該一起修好，正因為如此才不能順手改——那會變更輸出，屬於另一件事。
  要不要統一去重是可以後續再決定的提案，未列入待辦。
- **驗收標準是「修改前後的完整輸出逐位元組相同」，不是「測試還是綠的」**：寫了一支等價性腳本
  （九個 fixture：script 的 src／type 各種組合含大小寫與前後空白、三層巢狀的 anchor、
  `article` 與 `main` 並存但不巢狀、完全沒有 `article`／`main`、`<head>` 裡放 anchor、
  重複 `Organization`、`@graph` 與多重 `@type`、無組織型別、JSON 解析失敗、全空白頁），
  對三支 analyzer 的完整回傳值輸出 JSON。修改前後兩份 JSON `diff` 完全相同。
  **另跑負向對照確認這批 fixture 有鑑別力**（否則「相同」不代表什麼）：同一份 fixture 下，
  若誤加 `trim().toLowerCase()`，script 數會從 2 變成 4；若誤把選擇器縮成 `article a[href]`，
  連結數會從 3 變成 2。兩種錯誤都會被這批 fixture 抓到。
- 驗證：`npm test` → `# pass 97 / # fail 0`（測試數不變）。
- **未涵蓋的部分**：沒有為 `semantic-html.js` 與 `content-trust.js` 新增常設測試——這兩支目前
  在 `server/test/` 裡沒有對應的測試檔，等價性腳本是一次性的，跑完就丟。補這兩支的測試覆蓋
  是獨立的一件事，不在這次範圍內，也未列入待辦。

2026-08-07，依賴 Google Fonts（完成時列為待辦第 1 項）已改為本地字型並實測驗證：

- **三支字型改為自架，`index.html` 不再對 Google 發出任何請求**（`client/public/fonts/`、
  `client/scss/_fonts.scss`、`client/scss/main.scss`、`client/public/index.html`）
  移除兩條 `preconnect` 與那條 `fonts.googleapis.com` 的 stylesheet，共三個 `<link>`。
  **這則寫的當下 `index.html` 完全沒有外部請求，但同日稍晚加入了 Umami 分析 script
  （`cloud.umami.is`），所以「零外部請求」現在已不成立**。字型那一半不受影響：
  六個 woff2 全部是本地檔案，離線照樣算繪；Umami 的 script 帶 `defer`，
  抓不到就靜默失敗，畫面不會有任何變化。
  **只移掉 stylesheet 那一條不夠**——`preconnect` 本身就會對 Google 開 TCP／TLS 連線，
  隱私問題原封不動。新增 `client/scss/_fonts.scss` 放六段 `@font-face`，
  在 `main.scss` 以 `@use 'fonts';` 排在第一行（要在 `reset` 之前）。
  **沒有放進 `variables/_variables-font.scss`**：那支被多個檔案 `@use`，
  裡面只該有變數；放宣告進去會在每個載入點重複輸出。
- **三支都是可變字型（variable font），所以是六個檔案而不是十個**
  原本的 URL 指名 Fraunces 500/600/700、IBM Plex Sans 400/500/600、
  JetBrains Mono 400/500/600/700 共十種字重，但 Google Fonts 對這三支回傳的是
  同一個可變字型檔——十種字重指向的檔案其實只有三個。改用 `wght@400..600` 這種
  區間寫法拿到完全相同的檔案，`@font-face` 的 `font-weight` 寫成 `400 600` 區間。
  **已逐字比對驗證**：用舊的列舉式 URL 與新的區間式 URL 各抓一次 CSS，
  latin 與 latin-ext 六條 `src` 的 gstatic 網址完全相同，所以算繪結果不可能改變。
  IBM Plex Sans 的 `font-stretch: 100%` 是可變字型必要的宣告，照抄未動。
  **區間寫法唯一可能改變外觀的情況已排除**：列舉式的 `font-weight: 500` 會把可變軸釘在 500，
  區間式的 `font-weight: 500 700` 則會依元素要求內插——所以只要有元素用了 550 這種
  「原本沒被列舉、但落在區間內」的字重，兩者就會不同。已 grep 整份 SCSS 與 `main.js`，
  實際出現的字重只有 500、600、700 三種（加上瀏覽器對 `h1`／`h2`／`th` 的預設 700
  與內文預設 400），全部都在原本列舉過的值裡面，`font-variation-settings` 一個也沒有。
  區間外的值兩種寫法都會夾到同一個端點，所以外觀相同這件事是驗證過的，不是推測。
- **只保留 latin 與 latin-ext 兩個 subset，捨棄 cyrillic、cyrillic-ext、greek、vietnamese**
  原本會下載 15 個 subset 檔，介面文字是繁體中文加英數，用不到那四類。
  保留 latin-ext 的理由是使用者輸入的網址可能含重音拉丁字母，而 `unicode-range`
  讓瀏覽器只在真的出現該範圍字元時才下載，平常一個位元組都不花。
  六個檔案合計 241 KB（Fraunces 124 KB、IBM Plex Sans 75 KB、JetBrains Mono 42 KB）。
  `unicode-range` 字串直接從 Google 的 CSS 複製，並在編譯後以 `sort -u` 比對確認
  兩條範圍與原文逐字相符——手打這種字串是最容易出錯而且看不出來的地方。
- **`url()` 的相對基準是編譯後的 CSS 而不是 SCSS 原始碼**：Dart Sass 不改寫 `url()`，
  原樣輸出。SCSS 在 `client/scss/`，產物在 `client/public/css/main.css`，
  所以路徑要寫 `../fonts/`（解析為 `client/public/fonts/`）而不是 `../public/fonts/`。
  這是這次唯一會靜默壞掉的地方，已由下方的 HTTP 200 證實。
- **授權**：自架等同再散布，三支都是 SIL OFL 1.1，已放 `client/public/fonts/OFL.txt`
  （三則版權宣告從各自的上游 repo 取得，後接完整授權條文）。
- 檔名帶上游版本號（`fraunces-v38-latin.woff2` 等）：換版時檔名一起換，
  順便讓瀏覽器快取自然失效，也讓過期檔案一眼看得出來。
- **驗收標準是負向的，「頁面還打得開」測不到這一項**：實際啟動 server（PORT=3125）
  雙向確認——六支 `/fonts/*.woff2` 全部回 200、`content-type: font/woff2`、
  `content-length` 與磁碟位元組數相同，且取回的內容前四個位元組是 `wOF2` 魔術數字；
  `/`、`/css/main.css`、`/js/main.js` 仍為 200。
  另以 grep 確認整個 repo 沒有任何 `googleapis`／`gstatic`／`fonts.google` 字串（這一條至今成立），
  當下 `index.html` 與編譯後的 `main.css` 裡唯一剩下的 `https://` 是輸入框的 placeholder 文字
  （同日稍晚加入的 Umami script 是後來多出來的第二處，見本則第一點）。
- **`core.autocrlf = true` 會不會弄壞二進位檔**：這台機器開著 autocrlf，已用
  `git diff --cached --numstat` 確認六個 woff2 都被判定為二進位（顯示為 `-`），
  換行轉換不會套用；`git cat-file -s` 的 blob 大小與磁碟位元組數一一相符。
  沒有新增 `.gitattributes`——git 的自動判定在這裡已經正確，多一個檔案沒有意義。
- **沒有跑 `npm run build:css`**：它帶 `--style=compressed`，會把整支 CSS 壓成一行，
  56 行的 `@font-face` diff 會被埋進 700 行的格式變動裡，而且等於替
  「`build:css` 的輸出格式與版控裡的 `main.css` 不一致」那一項做了本來要你決定的取捨
  （寫這則時它還在待辦清單上，當時是第 2 項，同日「冗餘 selector」那則完成後為第 1 項，
  最後決定拿掉 `--style=compressed`，見上方該則已完成紀錄）。
  改用 `npx sass scss/main.scss:public/css/main.css --no-source-map`，
  `git diff --stat` 確認 `main.css` 只有 56 行新增、0 行刪除。
- 驗證：`npm test` → `# pass 97 / # fail 0`（測試數不變——沒有任何測試引用 client 的字型，
  這次跑測試是回歸把關，不是目標）。
- **未涵蓋的部分**：沒有實際開瀏覽器目視確認字型有算繪出來；上述 200 只證明檔案送得出去，
  「看起來和以前一樣」是從「同一批位元組 + 同一組字重」兩件事推得的，不是眼睛看到的。
  另外，`$font-display` 等變數裡的中日韓 fallback `Noto Serif TC`／`Noto Sans TC`
  本來就不在 Google Fonts 的請求裡，只有使用者自己裝了才生效——這次沒有改變這件事，
  所以「離線字型不掉」目前只對拉丁字母成立，中文仍然吃系統字型。要不要一併自架
  中文字型是另一件事（Noto Sans TC 完整檔約 8 MB，需要 subset 才實際），未列入待辦。

2026-08-07，`express.static` 開放過多檔案（完成時列為待辦第 1 項）已收斂並實測驗證：

- **靜態根目錄從 `client/` 改為 `client/public/`**（`server/index.js`、`client/package.json`）
  `index.html`、`css/`、`js/` 以 `git mv` 移進 `client/public/`，`express.static` 只服務那一層。
  三者一起移動，所以 `index.html` 裡 `css/main.css` 與 `js/main.js` 兩條相對路徑不用改，
  HTML 完全沒有改動。留在 `client/` 的 `package.json`、`package-lock.json`、`scss/`
  從此不在靜態根目錄底下，瀏覽器要不到。
- **`build:css` 與 `watch:css` 兩支都要改輸出路徑**（`client/package.json:6-7`）
  改成 `public/css/main.css`（相對於 `client/`，不是 repo 根目錄）。只改一支的話兩支會寫到
  不同目錄，其中一支的產物靜默地不再被服務。
  **`--style` 旗標刻意維持原樣**：`build:css` 的 `--style=compressed` 與版控格式不一致是
  「`build:css` 的輸出格式與版控裡的 `main.css` 不一致」那一項，需要你決定取捨，不在這次範圍內
  （寫這則時它還在待辦清單上，當時是第 3 項，同日字型那則完成後為第 2 項，
  同日「冗餘 selector」那則完成後為第 1 項，最後決定拿掉 `--style=compressed`，
  見上方該則已完成紀錄）。也因此驗證時**沒有跑 `npm run build:css`**，
  改用 `npx sass scss/main.scss:public/css/main.css --no-source-map` 重新編譯，
  產物與版控中的 `main.css` 位元組完全相同（`git status` 無 modified），
  同時證明新的相對路徑解析正確。
- **驗收標準是負向的，「頁面還打得開」測不到這一項**：實際啟動 server（PORT=3124）
  雙向確認——`/`、`/css/main.css`、`/js/main.js` 三者回 200；
  `/package.json`、`/package-lock.json`、`/scss/main.scss`、`/scss/components/_report.scss`
  四者回 404。只有後面那組成立才代表這一項做完。
  404 走的是 Express 預設處理，`index.js` 的錯誤處理 middleware 只接例外，未改動。
- **SCSS 裡沒有任何 `url()`**（已 grep 確認），所以編譯後的 CSS 多一層目錄不會弄壞相對資源路徑。
- 驗證：`npm test` → `# pass 97 / # fail 0`（測試數不變——沒有任何測試引用 client 路徑，
  這次跑測試是回歸把關，不是目標）。
- **本檔內所有指向這三支檔案的路徑一併更新為新位置**，包含「已完成」區塊裡的舊紀錄
  （2026-08-06 的「HTTP 4xx/5xx 錯誤頁警示」與「追蹤的 AI 爬蟲清單」兩則）。
  取捨是「路徑可以直接點開」勝過「保留當時的原文」；各則開頭的
  「完成時列為待辦第 N 項」仍然記錄當時的狀態，沒有改。
  `client/scss/` 沒有搬動，指向 scss 的路徑一律維持原樣。
- **未涵蓋的部分**：沒有實際開瀏覽器目視確認頁面；上述 200 只證明檔案送得出去，
  不證明畫面正常。三支檔案的內容一個位元組都沒改，風險僅限於路徑接錯，而路徑已由 200 證實。

2026-08-06，`/api/analyze` 的速率限制與錯誤訊息外洩（完成時列為待辦第 1 項）已修復並實測驗證：

- **速率限制：每個來源 IP 每 60 秒 10 次**（`server/lib/rate-limit.js`、`server/index.js`）
  固定視窗計數，超過回 429 並帶 `Retry-After`（秒數是視窗真正的剩餘時間，不是固定值）。
  沒有引入 `express-rate-limit` 之類的依賴——這個限制器連註解共約 60 行，
  用套件反而要為了本機單機工具多背一棵依賴樹。
  **只掛在 `/api`，不掛靜態檔案**：開一次頁面就會抓走 HTML、CSS、JS 好幾個檔案，
  算進同一份額度會讓正常使用者一進站就被擋。
  額度取 10 次/分鐘的理由：手動輸入網址再看報告，一分鐘做不到十次；
  但一次分析最多發出三個外部請求（HTML、robots.txt、llms.txt）各逾時 10 秒，
  壓到這個速度後拿它當 SSRF 掃描器已經沒有實用價值。
  **刻意沒有開 `trust proxy`**（已寫進 `index.js` 註解）：開了之後 `req.ip` 改讀
  `X-Forwarded-For`，那個 header 誰都能自己填，速率限制會直接被繞過。
  之後真要放到反向代理後面，要指定信任層數或代理位址，不要用 `true`。
  過期項目的清理綁在請求路徑上、每個視窗最多清一次，不用 `setInterval`，
  避免一個背景計時器影響 process 生命週期與測試收尾。
- **錯誤訊息收斂：三種網路層失敗對外變成同一句**（`server/lib/public-error.js`、
  `server/routes/analyze.js`、`ssrf-guard.js`、`fetch-page.js`）
  **分界線不是「錯不錯」而是「這句話有沒有洩漏內網資訊」**。新增 `publicError()`
  在錯誤上標記 `expose: true`（沿用 http-errors 的屬性慣例），路由只把標記過的原文回給前端。
  可公開：URL 格式無效、協定不支援、不允許存取 localhost（純粹描述輸入字串），
  以及重導向次數超過上限、回應內容超過大小上限、重導向沒給 Location——
  **後三者能發生就代表連線已經通過 `safeLookup` 的網段檢查，對方必定是攻擊者自己也連得到的
  公開主機，講出來不多給他任何情報**。
  不可公開：DNS 解析失敗、目標落在私有網段、連線被拒或逾時。這三種一律換成
  「無法連線到該網址,請確認網址正確且可從公開網路存取」。
  真正的原因寫進 `console.warn`，本機使用照樣查得到，只是不再從 HTTP 回應外流。
- **順手擋掉自己引入的一個新問題**：`console.warn` 原本會把使用者輸入的網址原樣寫進 log，
  而網址可能帶 basic-auth 憑證（`https://user:pass@host`），等於把密碼落地留存。
  已加 `redactCredentials()` 清掉帳密欄位再寫，主機與路徑保留（否則 log 失去除錯價值）。
- **前端未改動**：`main.js` 本來就是讀 `data.error` 顯示，429 的 JSON 走同一條路徑自動顯示。
- `test/rate-limit.test.js` 六個測試（額度內放行、超額回 429 與 Retry-After、
  Retry-After 隨剩餘時間遞減、不同 IP 各自計數、視窗過期後重置、取不到 IP 時共用額度）。
  時間用 `t.mock.method(Date, 'now', ...)` 接管，不靠 sleep，所以不會有時序不穩。
  `test/error-exposure.test.js` 七個測試，其中四個真的起一台 express server 走完整條路由——
  這一項驗的是「HTTP 回應裡看得到什麼」，直接呼叫函式看不出來。
  **核心驗收標準是「私有網段與 DNS 失敗兩種回應的字串完全相等」**，不是「有換成通用訊息」；
  只要措辭留下任何差異，oracle 就還在。
- 驗證：`npm test` → `# pass 97 / # fail 0`（測試數從 84 增為 97）。
  **問題重現**：把路由改回 `error: err.message` 重跑，`error-exposure.test.js` 第 5 條
  由 pass 轉 fail，確認這條測試鎖得住的是真的缺口。
  **已做真實端對端確認**：實際啟動 server（PORT=3123），連送 12 次請求確認第 11 次起回 429、
  `Retry-After` 隨剩餘時間回 10；連抓 15 次 `index.html` 全部 200（靜態檔案確實不受限）；
  `https://example.com/` 照常回完整報告（`overallScore = 50`、18 支爬蟲）；
  伺服器 log 確認留有「目標位址位於私有或保留網段」的完整原因。
- **未涵蓋的部分**：計時側通道沒有處理（DNS 解析失敗與私有網段判定都在毫秒級完成，
  兩者的耗時差異不足以區分，但沒有實際量測過）；記憶體裡過期項目的清理沒有單元測試——
  清掉與沒清掉的對外行為完全相同，要測就得為測試開放內部狀態，判斷不值得。
  全域併發上限與多 process 共用計數兩件事屬於公開部署才需要，見上方「公開部署時的重新排序」。

2026-08-06，DNS rebinding（TOCTOU）完整防護（完成時列為待辦第 1 項）已實作並實測驗證：

- **關鍵不是「把預檢解析到的 IP 帶去連線」，而是「讓連線那一次解析就是被檢查的那一次」**
  （`server/lib/ssrf-guard.js`、`server/lib/fetch-page.js`）
  原待辦寫的修法是「用 undici 自訂 Agent 指定已解析的 IP，同時保留原 hostname 於 Host header
  與 TLS SNI」。實際採用的是同一個工具但更直接的做法：`ssrf-guard.js` 新增 `safeLookup`，
  以 `connect: { lookup }` 掛進 undici 的 `Agent`，成為 `net.connect` / `tls.connect` 實際使用的
  DNS 解析函式。解析結果就是 socket 連過去的位址，中間沒有第二次解析，所以根本不存在空窗，
  也不需要手動改寫 URL 再補 Host header 與 servername（那條路要自己維護 SNI，容易出錯）。
  hostname 仍由 undici 用來組 Host header 與 TLS SNI，只有「連到哪個 IP」被接管。
- **`fetch` 改為來自 `undici` 套件而不是全域 fetch**（`server/lib/fetch-page.js`）
  全域 fetch 雖然也接受 `dispatcher`，但那個 Agent 必須與 Node 內建的 undici 同源；
  直接用 `require('undici')` 的 `fetch` 與 `Agent` 才保證是同一份實作。
  `safeAgent` 是模組層的單例，`safeFetch` 每一次呼叫都帶 `dispatcher: safeAgent`。
- **`assertSafeUrl` 保留，但 JSDoc 改寫為「這是預檢，不是最終防線」**
  它仍然負責擋協定與 `localhost`、並給出中文錯誤訊息（連線層拋的錯會被包成
  `抓取失敗: fetch failed`，細節在 `err.cause` 裡，對使用者沒有意義）。
  代價是每個 URL 會解析兩次 DNS，這是刻意換來的錯誤訊息品質。
- **任一位址不安全就整批拒絕，不是濾掉後留下其餘位址**：Node 22 的 `net.connect` 預設開啟
  `autoSelectFamily`，會以 `all: true` 呼叫 lookup 並輪流嘗試多個位址；而且一個網域同時
  回公開 IP 與內網 IP 本身就是攻擊特徵。`safeLookup` 因此一律以 `all: true` 向 `dns.lookup`
  取得完整清單，全部通過才依呼叫端要的形狀（陣列或單一位址 + family）回傳。
- **`undici` 從 cheerio 的間接依賴提升為 `server/package.json` 的直接依賴**：
  版本 `^7.29.0`，與原本就在依賴樹裡的完全相同。已比對 `package-lock.json`，
  92 個套件數量不變、沒有新增或移除任何套件，唯一的語意變動是根層 `dependencies` 多一行。
- `test/ssrf-guard.test.js` 新增五個 `safeLookup` 測試（`all` 兩種形狀、私有網段拒絕、
  混合公開與內網位址整批拒絕、解析失敗與空結果）；新增 `test/dns-rebinding.test.js` 兩個測試。
- **端對端測試怎麼模擬攻擊**：開一台只聽 `127.0.0.1` 的 HTTP server 當內網服務，
  把 `dns.promises.lookup`（預檢走的）換成回公開 IP、`dns.lookup`（連線走的）換成回 `127.0.0.1`，
  等同攻擊者把 TTL 設為 0 後換掉 DNS 答案。**驗收標準是「內網服務收到的請求數為 0」而不是
  「fetch 拋錯」**——TCP 連線建立之後才失敗一樣算漏。
  測試檔內另附一個對照組，同一情境改用全域 fetch，斷言它確實連進了內網服務；
  少了對照組，第一條有可能因為別的原因（例如網域根本解析不到）而假性通過。
  這是專案裡唯一允許出現全域 fetch 的地方，已寫進該測試的註解。
- 驗證：`npm test` → `# pass 84 / # fail 0`（測試數從 77 增為 84）。
  **問題重現**：暫時移除 `dispatcher: safeAgent` 後重跑，`dns-rebinding.test.js`
  第一條由 pass 轉為 fail（內網服務收到請求），確認這條測試鎖得住的是真的缺口。
- **已做真實網路端對端確認**（前幾項待辦沒做到的部分，這次補上）：
  `https://www.wikipedia.org/` 回 200、118282 字元；`http://github.com/` 經一次重導向到 https
  後回 200；`robots.txt` 抓到 28028 字元——確認 HTTPS 的 SNI、gzip 解壓縮、
  手動重導向鏈在換掉 dispatcher 之後全部照常。實際啟動 server 打 `/api/analyze`
  也拿到完整報告（`overallScore = 47`）。
  同時確認 `http://169.254.169.254/`、`http://127.0.0.1:3000/`、`http://localhost/`
  三種輸入仍分別被擋在「私有或保留網段」與「不允許存取 localhost」。
- **仍未涵蓋的情況**：`safeLookup` 只在建立新連線時被呼叫，undici 的連線池若重用既有 socket
  就不會再解析——但那條 socket 當初已經通過檢查，重用不構成新的風險。
  另外，本次沒有處理「`/api/analyze` 的速率限制與錯誤訊息外洩」那一項，那是獨立的一項
  （寫這則時它還在待辦清單上，當時是第 1 項，同日稍晚完成，見上方該則已完成紀錄）。

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
  自動出現，不需要動 `client/public/js/main.js` 或 HTML。
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

- **錯誤頁照樣被評分卻沒有任何警示**（`client/public/index.html`、`client/public/js/main.js`、
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
  實際防護見上方「DNS rebinding（TOCTOU）完整防護」那則已完成紀錄
  （寫這則時它還在待辦清單上，當時是第 2 項，同日稍晚完成）。
- **輔助檔案的 body 無大小上限**（`server/lib/fetch-page.js`）
  `readBodyWithLimit` 改為接受 `maxBytes`：HTML 5MB、robots.txt / llms.txt 512KB。
  驗證：4MB 回應被中止，heapUsed 停在 8MB。

附帶的行為變更：

- timeout 現在涵蓋 body 讀取（原本在 fetch resolve 後就 clearTimeout，慢速 body 可無限佔用資源）。
- 輔助檔案上限從「200,000 字元」改為「512KB bytes」（對齊 Google robots.txt 解析上限，
  真實世界的 robots.txt 不會被截斷）。
- `assertSafeUrl` 不再有回傳值（已確認無呼叫端使用，非 breaking change）。
