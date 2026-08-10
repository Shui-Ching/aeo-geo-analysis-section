# TODO

AEO/GEO 檢測工具的待辦清單。建立於 2026-08-06。

排序基準：影響工具核心價值的程度 × 觸發機率，同分時以修復成本判斷。

**2026-08-10 起前提改變——本工具已部署到 Render 公開網址**，不再是本機單機工具。
2026-08-06 到 08-07 那批待辦是在「本機單機」前提下排序的，但它們已全部完成，
所以前提改變不影響任何既有結論；文末「公開部署」一節（原名「公開部署時的重新排序」）
已依實際部署狀況改寫。

**下方 2026-08-10 新增的五項改以「執行順序」編號，不是重要性順序**，與本檔原本的
排序基準不同，理由寫在該節開頭。

---

## 待辦（2026-08-10 新增，編號 = 執行順序）

2026-08-07 最後一項（HTTP 410 與 404 共用同一段警示文案）完成後，這份清單建立時列出的
項目已全部處理完畢，見下方「已完成」。**下面五項來自 2026-08-10 對公開部署後現況的重新檢視。**

**2026-08-10 執行進度**：五項的程式碼全部寫完並各自 commit（`ef7aaaa`、`5daef5e`、
`790d5ca`、`eeb2046`、`965a533`）。

**2026-08-10 稍晚更新——這五個 commit 已經在線上了。** 本段原本寫「尚未 push，所以
線上還是舊版」，那句話現在是錯的，已刪除。**我驗證過的**：`git fetch` 後
`git rev-list --left-right --count origin/main...main` 為 `0 0`，本地與遠端同一個
commit；把線上的 `/`、`/css/main.css`、`/js/main.js` 三支抓下來，正規化 CRLF 之後
與 repo 裡的檔案**逐位元組相同**。所以「線上跑的就是這份 repo」是驗證過的。
**我沒有驗證的是誰在什麼時候 push 的**——回應標頭的 `last-modified` 是 Render 取出
原始碼的時間，不是 push 時間，不能拿來推論。

**2026-08-10 再更晚的一次靜態複查**（沒有任何程式碼改動，只是對帳）：
在 `8e7e02b` 這個 commit 上重跑 `server/` 的 `npm test`，仍是 `# pass 97 / # fail 0`。
另外用 grep 對**編譯後**的 `client/public/css/main.css` 確認第 3 項那條字體外溢的補救確實
進了產物——`.category-card-heading-wrap` 同時有 `font: inherit` 與 `letter-spacing: normal`
（`main.css:742-745`），`.category-card-title` 也逐項重新宣告了 font-family／font-weight／
line-height／letter-spacing（`main.css:767-773`）。**這只證明 CSS 規則存在，不證明畫面
正常**，第 3 項「待你驗收」第 4 點的目視確認仍然要做。
順帶量了一次線上首頁的回應時間（`time_starttransfer` 0.36 秒，HTTP 200），**代表當下實例
是醒著的，所以第 4 項要的冷啟動秒數這次沒有量到，維持未測**——那個數字只有在實例真的
休眠之後掃第一次才拿得到。

第 1、2 項已完整結案，移到下方「已完成」。**第 3、4、5 項留在這裡**，因為它們剩下的
驗收條件需要瀏覽器、螢幕閱讀器或 1–2 天的觀察窗；各項下方改寫成
「程式碼已完成 / 驗收未完成」，剩下要做什麼寫在該項的「待你驗收」段落。
編號維持原本的 3、4、5 沒有重排，方便對照 commit 訊息。

**2026-08-10 最後一次更新——用無頭 Chrome 跑完了一輪實機驗收。** 前一段寫的
「只有你做得到」對其中大部分項目已經不成立：用 Playwright 驅動本機安裝的
Chrome 151.0.7922.76，在真實瀏覽器裡完成了第 3 項的鍵盤與視覺驗收、第 4 項的離線驗收，
以及第 5 項五項觀察裡的四項。工具只裝在暫存資料夾（`playwright-core`），
**`client/` 與 `server/` 的 `package.json` 一個字都沒有動，repo 沒有新增任何依賴**；
驗證腳本是跑完就丟的一次性腳本，沿用先前幾則的做法。

第 4 項原本以為非得等實例休眠才驗得到的分支（502 的 HTML 錯誤頁、5 秒喚醒提示、
`clearTimeout`），改用瀏覽器攔截回應也全部驗掉了，剩下的只有「實際冷啟動秒數」這個數字。

這一輪**沒有任何程式碼改動**（所以沒有 `?v=`、沒有 `build:css`），但**查出兩件事，
其中一件是真問題**：

1. **CSP 的 `connect-src` 少了 `https://gateway.umami.is`，照現在的政策切成強制模式，
   統計會立刻歸零。** Umami 的 script 從 `cloud.umami.is` 載入沒錯，但它送資料的
   端點是 `gateway.umami.is`，政策裡沒有這個網域。這正是原待辦第 5 項寫的
   「只寫前者會讓統計靜默歸零」那個坑，只是網域名稱猜錯了一個。細節與修法在第 5 項。
2. 原本靜態稽核推論「下載報表用的那段 `<style>` 不會觸發 CSP 違規」**是錯的**，
   實測會觸發 `style-src-elem`。但**下載功能與報表樣式都不受影響**（同樣是實測），
   代價只是每次下載會在 Console 留一則錯誤訊息。細節同樣在第 5 項。

**第 5 項第 4 步（切成正式強制）因此不能做**，理由有兩個：`connect-src` 要先補、
觀察窗也還沒滿。而且那是對線上網站的對外變更，要你點頭才動。

**編號是執行順序，不是重要性順序**，與本檔開頭的排序基準刻意不同，原因有三個：
第 1 項可能零成本結案，先做它有機會讓後面少一件事；第 2、3 項改完立刻看得到結果；
第 4、5 項的驗收都要等（實例休眠 15 分鐘、CSP 觀察 1–2 天），放後面不會卡住其他進度。
**若改以重要性排，第 4 項才是第一名**——它是這五項裡唯一的真 bug，其餘四項分別是
設定確認、可信度、無障礙與防禦深度。

貫穿五項的三件事，漏掉任何一件後面會白做：

- **改動 `client/public/js/main.js` 或 `main.css` 之後，一定要更新 `client/public/index.html`
  裡的 `?v=` 版本號**，否則回訪使用者拿到瀏覽器快取裡的舊檔，會誤以為改動沒生效。
  第 3、4 項都會踩到。**行號已於 2026-08-10 稍晚更新**：本節原文寫的 `index.html:9`
  與 `index.html:127` 是第 2 項加入 JSON-LD 與 Open Graph 之前的位置，現在分別是
  `client/public/index.html:57`（`css/main.css`）與 `index.html:183`（`js/main.js`）。
  下方第 3 項修法步驟 5 引用的也是舊行號，同樣以這裡為準。
- 每項結束在 `server/` 跑一次 `npm test`，確認仍是 `# pass 97 / # fail 0`。這是回歸把關，不是驗收標準。
- 每項獨立 commit。第 3 項含兩個不相干的改動，拆成兩個 commit。

---

（第 1、2 項已完成，紀錄移到下方「已完成」。）

---

### 3. 分類卡片改用 button，補鍵盤操作與 aria（程式碼與瀏覽器驗收皆已完成，只剩 NVDA 未驗）

`client/public/js/main.js:296` 把 click 事件掛在一個 `<div>` 上，沒有 `tabindex`、
沒有 `role`、沒有 `aria-expanded`；而 `main.js:262` 只給 `index === 0` 加 `is-open`。
兩件事合起來的後果是：**鍵盤與螢幕閱讀器使用者只看得到第一個分類，另外兩個分類的所有
檢查項完全無法展開**——那是這個工具八成的產出內容。

**先看清楚這個會做到一半卡住的結構問題**：現在的 header 裡包著
`<h3 class="category-card-title">`，而 `<button>` 的內容模型只允許 phrasing content，
**`<h3>` 放進 `<button>` 是無效巢狀**（這是讀 HTML 規範的內容模型推得的，**未實測瀏覽器**；
瀏覽器多半照樣算繪，但驗證器會報錯、語意也不對）。W3C ARIA 官方的 accordion 模式是反過來包：

```
<h3 class="category-card-heading-wrap">
  <button type="button" class="category-card-header" aria-expanded="false">
    分類名稱 ／ 6/6 項適用 ／ 分數 ／ chevron
  </button>
</h3>
```

副作用是螢幕閱讀器會把分數一起念進標題。**這其實是好事**——使用者一次聽到
「結構化資料，83 分」，不用再往下找。

修法步驟：

1. 依上述結構改 `main.js:264-295`：新增 `h3` 外層、header 改 `<button type="button">`、
   原本 title 那個 `h3` 降成 `<span>`。
2. click handler 同時切換 class 與 aria：
   `const open = card.classList.toggle('is-open'); header.setAttribute('aria-expanded', String(open));`
   初始值依 `index === 0` 設定。
3. 改 `client/scss/components/_report.scss:172-184`：`.category-card-header` 補 `width: 100%`
   與 `text-align: left`（button 不會自動撐滿寬度、文字預設置中）。`cursor: pointer` 可拿掉，
   `_reset.scss:34-38` 已替所有 button 設過。新的 `h3` 外層通常不需額外樣式，reset 已清掉 margin。
4. 在 `client/` 跑 `npm run build:css`，用 `git diff --stat` 確認 `main.css` 只有預期的那幾行變動。
5. **更新 `index.html:9` 與 `index.html:127` 的 `?v=` 版本號。**
6. `index.html:44-46` 的 `#scan-status` 加 `role="status"`、`index.html:41` 的 `#scan-error`
   加 `role="alert"`。**這裡有個陷阱**：live region 若在內容變更當下是 `hidden`，多數螢幕
   閱讀器不會播報，而目前流程正是「先設 `textContent`，再拿掉 `hidden`」這個不會播報的順序。
   安全做法是讓元素永遠不 hidden、改用空字串控制顯示，或先移除 `hidden` 再設文字。
   （**依 live region 一般規則推得，需用螢幕閱讀器實測確認**；Windows 上 NVDA 免費。）
7. 順手做完一件不相干的小改動：`server/index.js:38` 的錯誤處理中介層改成尊重 `err.status`。
   目前它一律回 500 並 `console.error`，但 `express.json()` 遇到格式錯誤的 request body 時
   拋出的錯誤帶 `status: 400`、`expose: true`，那是使用者輸入問題，現在會被記成伺服器故障。
   **那個沒用到的 `next` 參數留著不要動**——Express 4 靠參數個數辨識錯誤處理器，
   拿掉會讓整層錯誤處理靜默退化成普通中介層。

**已完成的實作**（commit `5daef5e` 與 `790d5ca`，2026-08-10）：

- 結構照上述 accordion 模式改完，`?v=` 更新為 `20260810`（favicon 那條沒動，圖沒變）。
- **第 3 步比原本寫的多做了一件事**：`_base.scss` 有一條 `h1, h2, h3` 的全域規則
  （Fraunces、`font-weight: 600`、`line-height: 1.15`、`letter-spacing: -0.01em`）。
  改動前那個 `h3` 只包住標題文字，改動後它把 count 與 score 一起包進去了，
  所以新的 `.category-card-heading-wrap` 必須寫 `font: inherit` **加上**
  `letter-spacing: normal`（`font` 簡寫不含 letter-spacing），否則襯線字與負字距
  會外溢到分數與計數；原本靠全域規則拿到的四項標題樣式，也要逐項改寫在
  `.category-card-title` 這個 `span` 上。**原待辦寫的「h3 外層通常不需額外樣式」是錯的。**
- **第 6 步沒有照原文做，改用更保險的做法**：`#scan-status` 是一個有 padding、邊框與
  掃描線動畫的面板，不可能「永遠不 hidden」；而它最重要的一則訊息其實是「掃描完成」，
  偏偏那一刻它正被隱藏，role 加在它身上永遠播不到。改成在 `index.html` 新增兩個
  **永遠存在、永遠不 hidden** 的 sr-only 元素（`#sr-status` 是 `role="status"`、
  `#sr-alert` 是 `role="alert"`），由 `main.js` 的 `announce()` 與 `showError()` 寫入。
  視覺元素維持原本的 hidden 行為，一個位元組都沒動。
- 第 7 步的錯誤中介層另外做了兩件原文沒寫的事：`console.error` 只留給 5xx（4xx 改用
  `console.warn`），以及 4xx 的回應訊息固定為中文「請求格式錯誤」而不是 `err.message`
  ——body-parser 的原文是英文的解析器內部訊息，放進中文介面既突兀也洩漏實作細節。

**我驗證過的**：

- vm 沙箱加 DOM stub 的一次性腳本（沿用 2026-08-06／08-07 那兩則的手法），三張卡片
  逐一確認 `h3` → `button` → `span` 結構、button 內沒有任何標題元素（內容模型合法）、
  `aria-expanded` 初始值 `true`／`false`／`false`、點擊一次 class 與 aria 同步反轉、
  再點一次回到初始值，39 項全過。
- `npm run build:css` 後 `git diff` 確認 `main.css` 只有預期的 11 行新增、1 行刪除。
- 實際啟動 server（PORT=3126）送壞掉的 JSON body：回 **400** 與
  `{"error":"請求格式錯誤"}`，log 是 `console.warn` 的
  `[POST /api/analyze] 400: Unexpected end of JSON input`，不是 `console.error`。
- `npm test` → `# pass 97 / # fail 0`。
- **2026-08-10 稍晚補驗（線上，不是本機）**：對正式網址送壞掉的 JSON body
  （`--data-binary '{"url":'`）同樣回 **400** 與 `{"error":"請求格式錯誤"}`，
  確認這一段在 Render 的反向代理後面行為一致。線上的 `/js/main.js` 與 `/css/main.css`
  也與 repo 逐位元組相同，所以第 3 項的 accordion 結構與 CSS 改動確實已經上線
  ——**但這只證明檔案送得出去，不證明畫面正常，下面四項驗收一項都沒有被取代。**

**原訂的四項驗收，2026-08-10 用無頭 Chrome（151.0.7922.76）跑完三項**。做法是本機起
server（PORT=3131），用 Playwright 把 `/api/analyze` 換成一份固定的 API 回應
（先前對 `https://example.com` 掃出來的真實回應），確保每次比較的輸入完全相同：

1. **已驗證——鍵盤可達性。** 從 `#url-input` 開始一路按 `Tab`，焦點順序是
   `#scan-button` → `#download-report` → 三個 `.category-card-header`，
   **三張卡片依序都走得到**。第二張按 `Enter`、第三張按 `Space` 都能展開，再按一次收合。
   判定不是看 class，而是量 `.category-card-body` 的 `getBoundingClientRect().height`
   ——**內容真的算繪出來了才算展開**。三張卡片的檢查項列數分別是 1 / 6 / 5，
   確認展開的是真內容不是空殼。這一項原本最沒把握，因為 `<button>` 對 `Enter`／`Space`
   的原生啟動行為正是 DOM stub 測不到的東西。
2. **已驗證——`aria-expanded` 在真實瀏覽器裡同步切換**：初始 `true`／`false`／`false`，
   展開收合各一次後回到初始值，`is-open` class 與 aria 屬性一致。
   另外用 CDP 的 `Accessibility.getFullAXTree` 看無障礙樹，三個按鈕的可及名稱是
   「結構化資料 1/1 項適用 0」「語意化內容結構 6/6 項適用 75」「內容可信度訊號 2/5 項適用 75」，
   `expanded` 狀態正確帶出，`#sr-status`／`#sr-alert` 也確實以 `status`／`alert` 兩個 role
   出現在樹上。**這不是螢幕閱讀器測試**，只是比讀 DOM 屬性強一階的旁證。
3. **仍然未驗證——NVDA。** 上面的無障礙樹只證明「role 與狀態暴露正確」，
   不證明 NVDA 會唸出來。live region 的播報時機（內容變更當下元素是否 hidden、
   同一段文字連寫兩次會不會重播）只有真的開螢幕閱讀器才測得到，
   而那正是第 3 項改動的核心。**這一項請你自己用 NVDA 掃一次**：確認
   「掃描完成，總分 XX 分」與錯誤訊息都有播報。
4. **已驗證——字體與字距與改動前完全相同。** 用 `git worktree` 把改動前的
   `ef7aaaa` 拉出來跑在 PORT=3132，與現在的版本餵同一份 API 回應、同樣的
   viewport（1280×900、DPR 2、`reducedMotion: reduce`），逐一比對三張卡片的
   標題／計數／分數共 9 個元素、每個元素 14 個屬性（`fontFamily`、`fontSize`、
   `fontWeight`、`fontStyle`、`letterSpacing`、`lineHeight`、`color`、`textTransform`、
   `fontStretch`、`fontVariationSettings`、`tag`、`text`、`width`、`height`）。
   **126 個比對值裡只有 3 個不同，就是三個標題的 tag 由 `H3` 變成 `SPAN`，那是這次改動的目的本身。**
   標題實測值為 Fraunces / 20px / 600 / `letter-spacing: -0.2px` / `line-height: 23px` /
   寬 99.02px，改動前後逐位元相同——**所以那條「字體外溢」的補救確實有效，
   而且沒有補過頭。** 另外截了兩張 `#category-list` 的圖並實際看過，版面一致。

---

### 4. 前端錯誤處理與冷啟動提示（程式碼已完成，離線驗收完成，冷啟動仍未測）

**這五項裡唯一的真 bug。** `client/public/js/main.js:44-49` 在檢查 `response.ok` 之前就
`await response.json()`。當回應不是 JSON 時——Render free plan 冷啟動期間的 502／504 錯誤頁
就是 HTML——解析會拋錯，落進外層 `catch`，畫面顯示「無法連線到分析伺服器」。

**free plan 閒置 15 分鐘後會休眠，冷啟動約 30–60 秒，所以這是真實使用者最可能遇到的
那一種失敗，而顯示的訊息是錯的、也無法據以行動。** 同一個問題還有第二半：`fetch` 沒有
`AbortController`，伺服器不回應時「正在抓取並分析」會永遠轉下去。

只動 `main.js:38-62`。修法步驟：

1. **調換順序**：先判 `response.ok`，再解析 JSON。非 2xx 時先看 `content-type` 有沒有
   `application/json`，有才 `.json()` 取 `data.error`；沒有就依狀態碼給文案——
   502／503／504 是「伺服器正在啟動或暫時無法回應，請 30 秒後再試一次」，
   其餘是「掃描失敗（HTTP xxx）」。
2. **加 `AbortController`，逾時設 90 秒。** 算法：後端最壞是 HTML 抓取 10 秒，加上
   robots.txt 與 llms.txt 並行的 10 秒，約 20 秒；冷啟動一般回報值 30–60 秒，兩者相加取保守值。
   （**冷啟動那個數字未實測**，是業界普遍回報值。本項驗收會順便量到實際秒數，屆時可回頭調。）
3. `catch` 裡分辨 `err.name === 'AbortError'`，給「等待超過 90 秒仍無回應」的專屬文案，
   不要跟「無法連線」混在一起。
4. 送出後起一個 5 秒的 `setTimeout`，時間到就把狀態文字換成「伺服器可能正在從休眠中喚醒，
   第一次掃描約需 30–60 秒，請稍候」。**`finally` 區塊記得 `clearTimeout`**，
   否則掃描結束了提示還會跳出來。
5. **更新 `?v=` 版本號。**

**已完成的實作**（commit `eeb2046`，2026-08-10）：五個步驟全部照原文做完。
非 2xx 的文案抽成 `readErrorMessage()`；逾時與喚醒提示的秒數抽成
`REQUEST_TIMEOUT_MS`／`WAKE_HINT_DELAY_MS` 兩個常數放檔案開頭，方便量到實際冷啟動
秒數之後回頭調。喚醒提示同時寫進第 3 項新增的 `#sr-status`，螢幕閱讀器也聽得到。
`?v=` 沿用第 3 項已經改好的 `20260810`，沒有再動一次。

**我驗證過的**（vm 沙箱加 DOM stub 的一次性腳本，17 項全過）：

- 502 回 HTML 錯誤頁時顯示「伺服器正在啟動或暫時無法回應…」，
  **確認不再誤報成「無法連線到分析伺服器」**——這是這一項的核心。503、504 走同一分支。
- 後端自己回的 JSON 錯誤（例如 400 的 SSRF 通用訊息）仍原樣沿用 `data.error`。
- 非 JSON 的 404 帶出「掃描失敗(HTTP 404)」；標了 `application/json` 卻解析失敗時
  會退回狀態碼分支，不會炸到外層 catch。
- `AbortError` 有自己的逾時文案，真正的網路失敗才顯示「無法連線」。
- `fetch` 確實帶了 `AbortSignal`，送出當下 `aborted` 為 false。
- 5.6 秒的慢回應會把狀態文字換成喚醒提示；快回應結束後再等 6 秒，
  提示**沒有**跳出來（`clearTimeout` 有效）。
- 另用本機 server 對 `https://example.com` 掃出的**真實 API 回應**走完 `renderReport`，
  成功路徑 8 項全過（三張卡片、18 列爬蟲表、分數 50、完成播報、快照寫入 localStorage），
  確認調換順序沒有弄壞 happy path。
- `npm test` → `# pass 97 / # fail 0`。

**2026-08-10 補做——原本以為只能靠休眠實例驗的東西，用瀏覽器攔截回應就驗得到了**
（無頭 Chrome 151，本機 server，把 `/api/analyze` 的回應換成想要的形狀，13 項全過）：

- **502 帶 HTML 錯誤頁**（Render 冷啟動的真實形狀，`content-type: text/html`）：
  畫面顯示「伺服器正在啟動或暫時無法回應,請 30 秒後再試一次」，`#sr-alert` 同步寫入，
  **確認不會誤報成「無法連線到分析伺服器」——這一項的核心在真實瀏覽器裡成立。**
- **404 帶 HTML**：顯示「掃描失敗(HTTP 404),請稍後再試一次」。
- **400 帶 JSON**：原樣沿用後端的 `data.error`。
- **慢回應 6.5 秒**：喚醒提示在**第 5.02 秒**出現（設定值 5 秒），文字與 `#sr-status`
  都正確，之後仍成功出報告、分數 50、`#scan-error` 全程隱藏。
- **快回應後再等 6.5 秒**：狀態面板維持收起、文字沒有被換成喚醒提示、
  `#sr-status` 停在「掃描完成,總分 50 分,報告已顯示在下方」，**`clearTimeout` 在真實
  瀏覽器裡確實有效。**

**待你驗收**（需要休眠中的線上實例，我做不到）：

1. 讓實例閒置滿 15 分鐘進入休眠（或在 Render 儀表板手動 restart），然後掃一次，
   確認第 5 秒出現喚醒提示、最終成功出報告，**而不是那句錯誤的「無法連線到分析伺服器」**。
   **上面那一輪已經用攔截回應的方式驗過同一段程式碼的每一條分支**，所以這一步真正
   還沒被涵蓋的只有「線上實例休眠後的真實行為」，也就是下面第 2 點要量的那個數字。
2. **記下實際冷啟動秒數**——90 秒這個逾時值裡的 30–60 秒是業界回報值，本站未實測。
   量到之後可以回頭調 `REQUEST_TIMEOUT_MS`。

   **2026-08-10 稍晚試過一次，量測作廢，沒有取得數字。** 做法是刻意安靜 17 分鐘
   不發任何請求，然後送一次計時的 `GET /`。結果是 `time_total=0.297` 秒、HTTP 200
   （UTC 04:49:06 送出）。**0.3 秒代表實例當時是醒著的，所以這次量到的不是冷啟動，
   而是「量測無效」——不可以拿它當成「冷啟動很快」的證據。**
   `render.yaml:6` 確認 `plan: free`，休眠機制成立，所以無效的原因只可能是安靜視窗
   被別的流量打斷：這是公開網址，我自己不發請求不等於沒有人發（你自己開頁面、
   搜尋引擎爬蟲、任何外部連線都算）。**這兩個原因我都沒有辦法區分，未查證。**

   下次要量，最可靠的做法是先去 Render 儀表板的 Events 確認實例真的進入
   `Autoscaling`／spin-down 狀態（或直接手動 restart），再馬上送一次請求並計時，
   不要靠「我沒動它」來推斷它睡著了。
3. **已驗證（2026-08-10，無頭 Chrome）**：用 Playwright 的 `context.setOffline(true)`
   把瀏覽器切成離線再送出掃描，畫面顯示的是
   「無法連線到分析伺服器,請確認網路連線後再試一次」，`#sr-alert` 也寫入同一句話，
   0.13 秒內回覆，**沒有誤報成「等待超過 90 秒」的逾時文案**；掃描狀態面板正確收起、
   按鈕解除鎖定。這一項結案。

   （`context.setOffline()` 底層走的是 CDP 的 `Network.emulateNetworkConditions`，
   **我推測**與 DevTools 面板上的 Offline 勾選是同一條路徑，但沒有查證兩者的實作，
   所以要不要再手動勾一次由你決定。）

---

### 5. 加上 Content-Security-Policy（Report-Only 已完成，觀察已做完，切正式前要先修 `connect-src`）

放最後是刻意的：第 2 項加了 JSON-LD、第 3、4 項改了 JS，先讓頁面定型再寫政策，不用改兩次。

**這是防禦深度，不是補洞。** 目前整套 XSS 防禦只有一層：`main.js` 全面用 `textContent`
的約定（見該檔開頭註解）。這層約定經逐檔確認目前沒有破口，但它沒有機制強制——
只要日後有人寫錯一次 `innerHTML`，被檢測網站的 `<title>` 就能對這個工具下 XSS。
第二個理由是 `index.html:10` 那支第三方 Umami script（`cloud.umami.is`，無 SRI）：
若上游被入侵，目前沒有任何東西限制它能做什麼。

規模感（不誇大）：本站沒有登入、沒有密碼、沒有付款，最壞情況外流的是使用者剛貼進去的
網址與 localStorage 裡的掃描紀錄。不是無害，但不是帳號或金流等級。

修法步驟：

1. 在 `server/index.js` 的 `express.static` **之前**加一個設定標頭的 middleware。政策草案：

   ```
   default-src 'self';
   script-src 'self' https://cloud.umami.is;
   connect-src 'self' https://cloud.umami.is;
   style-src 'self';
   img-src 'self' data:;
   font-src 'self';
   object-src 'none';
   base-uri 'self';
   frame-ancestors 'none';
   form-action 'self'
   ```

   **`script-src` 與 `connect-src` 兩條都要有 Umami**：前者讓它載得進來，後者讓它送得出去。
   只寫前者會讓統計靜默歸零。
2. **第一次部署一律用 `Content-Security-Policy-Report-Only` 標頭**，不要直接上正式的。
   Report-Only 只在 Console 報告違規、不真的擋，壞掉也不影響使用者。
3. 觀察 1–2 天，逐項確認**五**件事（比原本多一項，理由見第五點）：
   - Chrome DevTools Console 零 CSP violation。
   - **第 2 項加的那段 JSON-LD 有沒有被回報違規。** 理論上 `<script type="application/ld+json">`
     是 data block、不會被 `script-src` 攔，但**這一點未實測，是這份政策裡最需要親眼確認的一項**。
     真的被擋就補 nonce。
   - **Umami 後台看得到新的訪問資料。** 這是最容易靜默壞掉的地方，一定要看後台，
     不要只看 Console 沒紅字就當作沒事。
   - 下載報表功能正常（`blob:` URL 的下載）。
   - **分數圓環與長條的動畫正常，且 Console 沒有 `style-src` 違規。**（2026-08-10 補上這一項）
     那兩個動畫是用 CSSOM 寫的（`main.js` 的 `fillEl.style.strokeDashoffset`、`fill.style.width`）。
     依 CSP 規範，`style-src` 管的是 `<style>` 元素與 markup 裡的 `style` 屬性，
     CSSOM 寫入不在管轄範圍內——**但這一點和 JSON-LD 那一點一樣是讀規範推得的，未實測**。
     真的被擋就補 `style-src-attr`，或改成切換 class、用 CSS 變數帶值。

**第 1、2 步已完成**（commit `965a533`，2026-08-10）：中介層放在 `express.static` 之前，
政策內容與上面的草案逐字相同，標頭名稱是 `Content-Security-Policy-Report-Only`。
**我驗證過的**：實際啟動 server（PORT=3128），首頁與 `/css/main.css` 的回應都帶有
Report-Only 標頭，且**沒有**下正式的強制標頭；`npm test` → `# pass 97 / # fail 0`。
2026-08-10 稍晚另外確認**線上**的首頁回應帶著同一份 Report-Only 標頭，字串與草案逐字相同。
（**這段當時寫的「沒有開瀏覽器看過 Console，五項觀察全部還沒做」已經過時**，
觀察結果見本項最後一段。）

**2026-08-10 稍晚做的靜態稽核（可以先排除一部分風險，但不能取代 Console 觀察）**：

- 線上 `index.html` 裡的外部資源只有兩個：canonical／`og:url` 指向本站自己，
  以及 `https://cloud.umami.is/script.js`。政策的 `script-src` 與 `connect-src` 都涵蓋了它，
  沒有第三個漏網的網域。
- **`index.html` 裡沒有任何 `<style>` 元素，也沒有任何 `style="…"` 屬性**（已 grep 整個
  `client/public/`）。`main.js` 裡也沒有 `setAttribute('style', …)` 或 `.style.cssText = …`
  ——**這兩種是屬性寫入，會被 `style-src-attr` 管到，和逐屬性的 CSSOM 寫入不同**，
  原本第五項觀察只想到 CSSOM，這裡把真正會違規的兩種寫法一併排除了。
- **唯一的 `<style>` 在 `main.js:930` 的 `REPORT_STYLESHEET`，它不會觸發違規**
  ——**⚠️ 這一整段的結論已被實測推翻，正確的說法見本項最後一段「查到的第二件事」。
  保留原文是為了留下「靜態推論在哪裡失準」的紀錄。** 原文如下：那段樣式
  是組進「下載後的單一 HTML 檔」的字串，走的是 `new Blob(...)` → `URL.createObjectURL` →
  `<a download>` 的下載路徑（`main.js:1331-1350`），從頭到尾沒有插進本站的文件裡，
  下載完是從 `file://` 開啟、不受本站政策管轄。**這是讀程式碼推得的，未實測**，
  所以下載報表那一項觀察仍然要做。

**2026-08-10 最後一次更新——五項觀察用無頭 Chrome 跑完了四項，查到兩件事。**
做法是用 Playwright 開 Chrome 151 連到**線上網址**，同時收兩個管道的證據：
頁面裡註冊 `document.addEventListener('securitypolicyviolation', …)` 拿結構化的
`violatedDirective`／`blockedURI`，以及 Console 的 `[Report Only] …` 文字訊息
——兩邊涵蓋範圍不同，所以都收。流程走完整的一輪：載入首頁、掃描 `https://example.com`、
下載報表、展開三張卡片。

逐項結果：

- **✅ Console 只有下面兩類違規，沒有其他紅字**，頁面本身的 JS 沒有任何錯誤。
- **✅ JSON-LD 沒有被 `script-src` 攔**。這是原待辦裡「最需要親眼確認」的一項：
  在**強制模式**的預演下（做法見下），`<script type="application/ld+json">` 仍然
  讀得到、`JSON.parse` 成功、`@graph` 裡的 `WebSite` 與 `WebApplication` 都在，
  違規清單裡也沒有 `script-src`。**確認它是 data block，不受 `script-src` 管轄，
  不需要補 nonce。**
- **✅ 分數圓環與長條的 CSSOM 動畫沒有被 `style-src` 攔**。強制模式下實測，
  圓環的 `strokeDashoffset` computed 值是 251.327px（總分 50 對應的正確值），
  三條長條的 computed 寬度是 0px / 312.891px / 312.891px，
  違規清單裡沒有 `style-src-attr`。**逐屬性的 CSSOM 寫入確實不在 `style-src` 管轄範圍，
  這一點從推論升級為實測。**
- **✅ 下載報表功能正常**，但**觸發了一則原本預期不會發生的違規**，見下方第 2 件事。
- **❌ Umami 後台的訪問資料——仍然未驗證。** 這需要登入 Umami 後台，我沒有帳號。
  不過下面第 1 件事已經先一步證明了：照現在的政策切成強制，後台一定看不到新資料。

**查到的第一件事（真問題，切正式前必須先修）：`connect-src` 少了 `gateway.umami.is`。**

- 線上實測，Umami 的 script 從 `https://cloud.umami.is/script.js` 載入（HTTP 200，
  `script-src` 這條寫對了），但它**送統計資料的端點是
  `POST https://gateway.umami.is/api/send`**，政策裡沒有這個網域。
  Report-Only 之下每次載入都會記兩筆
  `connect-src` 違規，`blockedURI` 就是 `https://gateway.umami.is/api/send`。
- **不是只有 Console 有訊息而已——已用強制模式預演證實它真的會被擋死。**
  做法是本機起 server，用瀏覽器端的攔截把回應標頭換成同一份政策的**強制版**
  （`Content-Security-Policy`，內容逐字相同），不動任何專案檔案。結果是
  `disposition` 從 `report` 變成 `enforce`，Console 出現
  `Fetch API cannot load https://gateway.umami.is/api/send. Refused to connect…`，
  而第三方回應清單裡**只剩 `cloud.umami.is/script.js`，`gateway.umami.is` 一筆都沒有**。
  **統計會靜默歸零，而且使用者與你都不會看到任何徵兆。**
- **修法**（`server/index.js:43`，一行）：
  `"connect-src 'self' https://cloud.umami.is https://gateway.umami.is"`。
  上面那行註解「script-src 與 connect-src 兩條都要有 Umami」的判斷是對的，
  錯的只是網域名稱——資料端點與 script 端點在 Umami Cloud 是兩個不同的網域。
- **這一行改法已經實測會通，不是紙上推論**：拿補好的政策再跑一次同一支強制模式預演，
  第三方回應清單裡出現 `200 https://gateway.umami.is/api/send`，
  違規清單裡的 `connect-src` **歸零**，只剩下面第二件事那一則 `style-src-elem`。
  JSON-LD、CSSOM 動畫、字型、下載報表在補丁後的政策下同樣全部正常。
  **但改動本身還沒做，等你確認。**

**查到的第二件事（不影響功能，但要更正一則錯誤的推論）：下載報表會觸發
`style-src-elem` 違規。**

- 本檔上一則靜態稽核寫「`main.js` 的 `REPORT_STYLESHEET` 不會觸發違規，因為它從頭到尾
  沒有插進本站的文件裡」——**這個推論是錯的，已由實測推翻**。違規確實發生，
  `violatedDirective` 是 `style-src-elem`、`blockedURI` 是 `inline`、行號指向
  `main.js:1246`，也就是 `doc.head.append(style)` 那一行。原因是
  `document.implementation.createHTMLDocument()` 造出來的文件會**繼承母文件的 CSP**，
  「沒有插進顯示中的頁面」不等於「不受政策管轄」。
- **但功能完全不受影響，這一點也是實測的**：強制模式下按下載，檔案照樣產出
  （11,569 bytes），HTML 裡的 `<style>` 區塊仍然完整帶著 2,741 個字元的樣式
  ——CSP 擋的是「把樣式套用到那份離屏文件」，不是「把元素序列化成字串」。
  把下載到的檔案用 `file://` 開起來看，`.doc-title` 的 computed 字級是 28px、
  文字色 `rgb(16, 20, 28)`、頁面底色 `rgb(244, 246, 250)`、表格 44 列，
  **樣式完整生效，Console 零錯誤**（下載後的檔案不受本站政策管轄，這一半原本的推論是對的）。
- **所以這件事的實際代價只有一項：每次下載報表會在 Console 留一則錯誤訊息。**
  三個選項，我沒有動手，等你決定：
  1. **不處理**（推薦）。功能無損，訊息只有按下載的人看得到。
  2. 政策放寬到 `style-src 'self' 'unsafe-inline'`。**不建議**——為了一則 Console 訊息
     把整條 `style-src` 的防護拿掉，划不來。
  3. 改寫 `buildReportHtml`，改成序列化之後再用字串把 `<style>` 拼進去，避開 DOM 插入。
     這會動到下載那條路徑的程式碼，屬於另一件事，要做的話應該獨立一項。

**第 4 步（切成正式強制）現在還不能做**，三個前提：

1. `connect-src` 要先補上 `gateway.umami.is`（改法已實測會通），否則切過去統計就死了。
2. 觀察窗還沒滿。`965a533` 是 2026-08-10 才上線的，原訂 1–2 天。
   上面這一輪是「一次載入的完整流程」，證據力比「掛著跑兩天」窄——
   例如錯誤頁、410 警示、與上次掃描比較面板這些分支，這一輪沒有全部走到。
3. 這是對線上網站的對外變更，要你同意才推。

**Commit 拆兩個**：

**Commit 拆兩個**：
`feat: 加上 Content-Security-Policy，先以 Report-Only 觀察`（已完成，`965a533`）
`feat: CSP 從 Report-Only 切換為正式強制`（待觀察窗結束後再做）

---

### 2026-08-10 檢視後刻意不做的三項

這三項是同一次檢視提出來、經評估後決定不做的，記在這裡是為了避免日後重複提案：

- **壓縮與快取標頭**：`server/` 沒掛任何壓縮 middleware，但 Render 邊緣層是否自行 gzip
  無法從 repo 判斷。用 `curl -sI -H 'Accept-Encoding: gzip' https://<網址>/css/main.css`
  看有沒有 `content-encoding` 即可，同一招也看得到 `cache-control`。
  就算沒做 gzip，`main.css` 只有 16.7 KB，投入產出不成比例。
  **若日後真要調快取，陷阱是不能對 `express.static` 下統一的 `maxAge`**——那會連
  `index.html` 一起長期快取。要用 `setHeaders` 分開：六個 woff2 檔名已帶版本號
  （`fraunces-v38-…`），可安全設一年；HTML 不行。
- **全域併發上限**：本節下方「公開部署」一節原本列了這一項。實際部署後評估認為
  目前沒有任何證據顯示流量會到那個量級，屬於為不會發生的情況做準備。有實際壅塞證據再說。
- **為 `semantic-html.js` 與 `content-trust.js` 補測試**：不值得當獨立任務。
  下次真的要改這兩支時，先寫會失敗的測試再改，那時它才有意義。
  （這一項在 2026-08-07「冗餘 selector」那則已完成紀錄裡也提過，此處是再次確認維持不做。）

各則已完成紀錄裡的「未列入待辦」段落另記錄了幾個刻意不做的提案（例如補 README、
`Organization` 去重、自架中文字型），那些是可以後續再決定的事，不是遺漏。

---

## 公開部署（已發生，2026-08-10 改寫本節）

本節原本是「若將來公開部署，順序要怎麼重排」的假設性規劃。**部署已經發生**
（Render，設定見 `render.yaml`），所以改寫成部署後的實際狀況。

公開之後，此 endpoint 等同「任何人都能免費驅動、去抓任意網址」的代理，會被拿來當
SSRF 掃描器與流量放大器。原本排在這一節的三項——DNS rebinding 防護、速率限制／
錯誤訊息外洩、`express.static` 目錄收斂——均已完成，見「已完成」（前兩項於 2026-08-06，
`express.static` 目錄收斂於 2026-08-07）。**這三道防護是這次公開部署的前提，仍然成立。**

原本列在這裡、標記為「公開部署前另外要處理」的兩件事，實際部署後的結論：

- **沒有全域併發上限**：速率限制是「每個 IP 每分鐘幾次」，擋不住大量不同來源同時打進來；
  且 `routes/analyze.js:68` 的 `cheerio.load()` 解析最大 5 MB HTML 是同步的，會佔住 event loop，
  free plan 只有 0.1 CPU。**經評估決定暫不處理**，理由與做法見上方「2026-08-10 檢視後
  刻意不做的三項」。有實際壅塞證據再重新提案。
- **速率限制的計數存在單一 process 的記憶體裡**：Render free plan 是單一實例單一 process，
  所以「多開 process 各算各的」這個問題目前不成立。**日後若升級方案並開多個實例，
  這一項會立刻變成真問題**，屆時額度等於乘以實例數，要改成共用的計數存放（例如 Redis）。
  現在不做。

部署後新發現、與公開身分直接相關的兩項原本列為待辦第 1 項與第 5 項：`TRUST_PROXY_HOPS`
的設定確認（沒設對的話速率限制會變成全站共用一份額度）與 CSP（公開站 + 第三方 Umami script）。
2026-08-10 的執行結果——前者確認儀表板上的值是 `1`，雙 IP 實測未做，紀錄移到「已完成」；
後者的 Report-Only 已上，觀察與切正式仍留在待辦第 5 項。

---

## 已完成

2026-08-10，首頁補上 JSON-LD、canonical 與 Open Graph（完成時列為待辦第 2 項）已完成並實測驗證：

- **正式網址是實測確認的，不是照服務名推的**：`curl` 打
  `https://aeo-geo-analysis-section.onrender.com/` 回 200 且內容就是本站的
  `index.html`（`<title>AEO/GEO 訊號掃描器</title>`），canonical 與 `og:url` 都用這個。
  日後若綁自訂網域，這兩處要一起改。
- **基準分數是實測的 50，不是推算的 50**：對線上網址打一次 `/api/analyze`，
  `overallScore = 50`，三類分別是結構化資料 0、語意化內容結構 100、內容可信度訊號 50，
  與原待辦逐項推算的完全相同。
- **改完之後的 94 也是實測的**：寫了一支一次性腳本，把修改後的 `client/public/index.html`
  丟進 `cheerio.load()` 再跑三支 analyzer 與 `buildScoreSummary`，得到
  `overallScore = 94`（結構化資料 83、語意化 100、可信度 100），與推算相符。
  逐項輸出也對得上：JSON-LD 找到 1 個可解析區塊（pass）、偵測到 `WebSite`（pass）、
  內容型別仍是 warn（`WebApplication` 不在 `CONTENT_TYPES` 名單裡），
  可信度那五項是 canonical pass、其餘四項維持 na。
- **`og:image` 決定先跳過**：需要一張 1200×630 的圖，目前沒有。缺這張圖只影響社群分享
  的預覽外觀，**對任何檢測項目的判定都沒有影響**（已由上面的 94 分證實）。
  這一點寫進了 `<head>` 的註解，避免日後有人以為是漏掉的。
- **刻意沒有宣告 `FAQPage`、`author` 或 `datePublished`**：頁面上沒有 FAQ、沒有署名、
  沒有發布日期。特別注意 `content-trust.js:16` 與 `:32` 會直接讀 JSON-LD 節點的
  `author` 與 `datePublished` 欄位，隨手加上去就會讓那兩項從 na 變成 pass ——
  分數不會變（na 本來就不計分），但那會是宣告不存在的東西，正是這個工具要勸阻的行為。
  94 是誠實的天花板。
- **只動 `<head>`，沒有動 JS 與 SCSS，所以沒有更新 `?v=` 版本號**（版本號後來因為
  第 3 項才改成 `20260810`）。
- 驗證：`npm test` → `# pass 97 / # fail 0`（測試數不變——沒有任何測試引用
  `client/public/index.html`，這次跑測試是回歸把關，不是目標）。
- **「推上線之後再掃一次確認一致」已完成**（2026-08-10 稍晚）：對正式網址打一次
  `/api/analyze`，`overallScore = 94`，三類分別是結構化資料 83、語意化內容結構 100、
  內容可信度訊號 100，`httpStatus` 200、爬蟲表 18 列。逐項狀態也與本機那次相同——
  結構化資料是 `pass, pass, warn`（內容型別仍是 warn），可信度是 `pass, na, na, na, na`。
  **線上與本機檔案算出來的分數一致，這一項不再是推論。** 基準分數 50 → 94 的提升確認生效。
- **未涵蓋的部分**：沒有開瀏覽器目視確認，也沒有用 Facebook／Twitter 的分享偵錯工具
  實際看過 Open Graph 的算繪結果。

2026-08-10，`TRUST_PROXY_HOPS` 的設定確認（完成時列為待辦第 1 項）——**第 1 步已確認，
第 2 步的實測還沒做**：

- Render 儀表板的 Environment 頁面顯示 `TRUST_PROXY_HOPS` **存在，值是 `1`**
  （由截圖確認）。所以原待辦擔心的「未設定或為 0，全站共用一份額度」這個最壞情況不成立。
- **但這還不等於設定正確**。層數對不對取決於 Render 實際加了幾層代理，只有雙 IP 實測
  才證明得了：用筆電對線上網址**在 60 秒內**連送 11 次掃描（固定視窗會重置，慢了測不準），
  第 11 次應回 429；接著**立刻**用手機切行動網路送 1 次——手機也 429 代表額度共用、
  設定錯誤（要往上加到 `2`，一次加一階）；手機正常出報告代表設定正確。
- **這一步沒有做，因為需要第二個公網 IP。** 驗收條件（兩個不同公網 IP 各自擁有獨立的
  10 次額度）目前是**未驗證**狀態。
- 無程式碼改動，沒有 commit。

2026-08-07，HTTP 410 與 404 共用同一段警示文案（完成時列為待辦第 1 項）已拆開並實測驗證：

- **410 從 404 的分支獨立出來，標題與說明兩欄都改**（`client/public/js/main.js:102-134`）
  原本的條件是 `status === 404 || status === 410`，所以**不能只在後面追加一個 410 分支**——
  410 會先被 404 那條攔下，新分支變成永遠走不到的死碼。實際做法是把原條件收斂成
  `status === 404`，再新增獨立的 410 分支。
- **標題也要改，不只是說明文字**：原標題「頁面不存在」對 410 是錯的說法。
  410 Gone 的語意是「這個資源曾經存在，站方現在明確宣告它永久移除」，比「不存在」更強；
  新標題寫成「站方表明此頁面已永久移除」。說明文字則明講網址通常沒有打錯，
  該做的是把站內外指向它的連結改掉或移除。
- **刻意沒有寫「AI 引擎會在多久內把這個網址從索引移除」**：原待辦寫的修法包含
  「這對 AI 引擎既有索引的影響」，但各家引擎多快、以什麼方式淘汰一個已下架的網址，
  我無法查證，寫進去會變成沒有依據的斷言。文案因此只留可驗證的那一半——
  狀態碼的語意，以及使用者該採取的動作。
- **`statusBannerCopy` 上方的註解一併更新**：原註解只列了 403 與 404 兩種行動，
  改動後會過時，補上 410 那一句。這是自己這次改動造成的，屬於同一次修改的範圍。
- **這一項是純前端**：動手前先 grep 整個 `server/` 與 `client/`，當時 `410` 這個字串在原始碼裡
  只有 `main.js` 那一條分支條件這唯一一處命中，`server/` 與 SCSS 都是零命中，
  後端至今仍未讀 `page.status`（改完之後 `410` 自然多出註解、分支條件與文案三處）。
  `renderStatusBanner` 只寫 `textContent` 與 `hidden`，不加任何依狀態碼而異的 class，
  所以**沒有 SCSS 改動，也沒有跑 `npm run build:css` 的理由**（`main.css` 一個位元組都不需要動）。
- **新文案長度大約是其他分支的兩倍，已確認不會被切掉**：`.status-banner-desc` 的規則只有
  `font-size`／`color`／`line-height` 三條，`.status-banner:not([hidden])` 是 flex 容器、
  圖示那格 `flex-shrink: 0`，文字區塊自然換行、容器跟著長高
  （`client/scss/components/_report.scss:39-75`）。整段沒有 `max-height`、`line-clamp`、
  固定 `height` 或 `white-space: nowrap`，所以長文案不會被截斷——**這是讀 CSS 規則確認的，
  不是開瀏覽器看到的**。
- **驗收標準是「只有 410 那一列變了」，不是「410 有新文案」**：後者不能證明 404 沒被弄壞。
  沿用 2026-08-06 那則已完成紀錄裡的 vm 沙箱加 DOM stub 手法，寫了一支一次性腳本，
  對十個狀態碼（200／204／304／401／403／404／410／418／500／503）輸出
  `hidden`、`title`、`desc` 三欄的完整快照，並對 `git show HEAD` 的修改前版本跑同一支腳本。
  兩份快照 `diff` 只有 410 的 title 與 desc 兩行不同，其餘八個狀態碼逐字元相同。
  另確認 200／204／304 仍為 `hidden=true`，418 仍落在最後的通用分支。
- 驗證：`npm test` → `# pass 97 / # fail 0`（測試數不變——沒有任何測試引用 client 的前端程式碼，
  這次跑測試是回歸把關，不是目標）。
- **未涵蓋的部分**：沒有開瀏覽器目視確認。DOM stub 的 `getElementById` 對任何 id 都會回傳節點，
  所以上述快照證明的是文案分支與 `hidden` 開關，不是 id 有沒有接對——
  但這次沒有新增或更名任何 id，接線與 2026-08-06 那次逐一比對過的完全相同。
  也沒有實際掃描一個真的回 410 的線上網址（410 在真實世界極少見，多數站方直接回 404），
  `httpStatus` 是從 API 回應原樣帶進來的，這條路徑在 404 的實測裡已經走過。
  `client/public/js/main.js` 至今沒有常設測試，兩次驗證用的都是跑完就丟的一次性腳本；
  要不要替前端建立常設測試是獨立的一件事，未列入待辦。

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
  全域併發上限與多 process 共用計數兩件事屬於公開部署才需要，見上方「公開部署」一節
  （2026-08-10 部署後兩者均評估為暫不處理，理由記在該節）。

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
