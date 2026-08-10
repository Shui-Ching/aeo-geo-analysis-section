'use strict';

// 所有動態內容一律用 textContent 寫入 DOM,不用 innerHTML。
// 原因:evidence / title / meta description 等文字來自「被檢測的第三方網頁」,
// 若該網頁刻意在 <title> 塞入 <script> 之類內容,innerHTML 會直接執行,等同讓
// 對方網站對這個檢測工具下 XSS。

const STATUS_LABEL = { pass: '通過', warn: '警告', fail: '未通過', na: '不適用' };

// 逾時 90 秒 = 後端最壞情況約 20 秒(HTML 抓取 10 秒,robots.txt 與 llms.txt
// 並行的 10 秒)加上休眠實例冷啟動的 30–60 秒,兩者相加取保守值。
// 冷啟動那個數字是業界普遍回報值,尚未在本站實測。
const REQUEST_TIMEOUT_MS = 90000;
// 5 秒還沒回來就提示可能在喚醒。正常掃描約 2–5 秒,設得更短會讓每次掃描都跳提示。
const WAKE_HINT_DELAY_MS = 5000;

const form = document.getElementById('scan-form');
const urlInput = document.getElementById('url-input');
const scanButton = document.getElementById('scan-button');
const errorEl = document.getElementById('scan-error');
const statusSection = document.getElementById('scan-status');
const statusText = document.getElementById('scan-status-text');
const reportSection = document.getElementById('report');
const downloadButton = document.getElementById('download-report');
const backToTopButton = document.getElementById('back-to-top');
// 螢幕閱讀器專用的即時區域,永遠存在也永遠不 hidden,理由見 index.html 該處註解。
const srStatus = document.getElementById('sr-status');
const srAlert = document.getElementById('sr-alert');

// 下載報表時要用到的是「畫面上這一份」報告,而不是重新打一次 API,
// 所以把本次結果與比較基準留在這裡,交給下載按鈕的事件處理器讀取。
let currentReport = null;

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) {
        showError('請輸入要檢測的網址');
        return;
    }

    hideError();
    reportSection.hidden = true;
    statusText.textContent = `正在抓取並分析 ${url}`;
    statusSection.hidden = false;
    scanButton.disabled = true;
    announce(`正在抓取並分析 ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // 伺服器在 free plan 上閒置 15 分鐘會休眠,第一次掃描要先等它醒過來。
    // 這段等待期間畫面上只有「正在抓取並分析」在轉,使用者無從判斷是慢還是壞了。
    const wakeHintId = setTimeout(() => {
        const hint = '伺服器可能正在從休眠中喚醒,第一次掃描約需 30–60 秒,請稍候';
        statusText.textContent = hint;
        announce(hint);
    }, WAKE_HINT_DELAY_MS);

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: controller.signal,
        });

        // 一定要先判 response.ok 再解析 JSON,順序不能反過來:
        // 回應不是 JSON 的時候(Render 冷啟動期間的 502 / 504 錯誤頁就是 HTML),
        // 提早呼叫 response.json() 會拋錯並落進外層 catch,畫面顯示「無法連線到
        // 分析伺服器」—— 那句話是錯的,伺服器明明回應了,而且使用者無法據以行動。
        if (!response.ok) {
            showError(await readErrorMessage(response));
            return;
        }

        const data = await response.json();

        // 先讀出上一次的快照,再存入這一次 —— 順序反過來的話,
        // 比較基準會變成「本次自己」,差異永遠是零。
        const previous = loadSnapshot(data.finalUrl);
        renderReport(data, previous);
        saveSnapshot(buildSnapshot(data));
        reportSection.hidden = false;
        // 掃描完成是最重要的一則播報:視覺上報告直接出現,但螢幕閱讀器的焦點
        // 還停在輸入框,不主動播報的話使用者不會知道結果已經出來了。
        announce(`掃描完成,總分 ${data.overallScore} 分,報告已顯示在下方`);
    } catch (err) {
        if (err.name === 'AbortError') {
            showError(`等待超過 ${REQUEST_TIMEOUT_MS / 1000} 秒仍無回應,伺服器可能正忙或已停止服務,請稍後再試一次`);
        } else {
            showError('無法連線到分析伺服器,請確認網路連線後再試一次');
        }
    } finally {
        // 兩個計時器都必須清掉:逾時計時器留著會在下一次掃描途中誤觸 abort,
        // 喚醒提示留著則會在報告都出來之後才跳出來。
        clearTimeout(timeoutId);
        clearTimeout(wakeHintId);
        statusSection.hidden = true;
        scanButton.disabled = false;
    }
});

/**
 * 把非 2xx 的回應轉成一句使用者看得懂、而且能據以行動的訊息。
 *
 * 只有在 content-type 確實是 JSON 時才解析 —— 冷啟動期間 Render 回的是 HTML
 * 錯誤頁,對它呼叫 .json() 只會拋出一個與真正問題無關的解析錯誤。
 */
async function readErrorMessage(response) {
    if ((response.headers.get('content-type') || '').includes('application/json')) {
        try {
            const data = await response.json();
            if (data && data.error) return data.error;
        } catch {
            // 標了 JSON 卻解析不出來,往下走狀態碼的分支
        }
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
        return '伺服器正在啟動或暫時無法回應,請 30 秒後再試一次';
    }
    return `掃描失敗(HTTP ${response.status}),請稍後再試一次`;
}

function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    srAlert.textContent = message;
}

function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
    srAlert.textContent = '';
}

// 寫進 role="status" 的即時區域。同一段文字連續寫兩次不會觸發第二次播報,
// 但本站每則訊息都帶著網址或分數,不會出現重複的內容。
function announce(message) {
    srStatus.textContent = message;
}

function renderReport(data, previous) {
    const diff = previous ? diffReports(data, previous) : null;
    currentReport = { data, previous, diff };

    renderMeta(data);
    renderStatusBanner(data);
    renderGateBanner(data.crawlerAccess);
    renderScoreGauge(data.overallScore);
    renderScoreBreakdown(data.categories);
    renderComparePanel(data, previous, diff);
    renderCategoryList(data.categories);
    renderCrawlerTable(data.crawlerAccess);
}

function metaItem(label, value) {
    const wrap = document.createElement('div');
    wrap.className = 'report-meta-item';
    const labelEl = document.createElement('span');
    labelEl.className = 'report-meta-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'report-meta-value';
    valueEl.textContent = value;
    wrap.append(labelEl, valueEl);
    return wrap;
}

function renderMeta(data) {
    const container = document.getElementById('report-meta');
    container.replaceChildren();
    container.append(metaItem('請求網址', data.requestedUrl));
    if (data.finalUrl !== data.requestedUrl) {
        container.append(metaItem('最終網址', data.finalUrl));
    }
    container.append(metaItem('HTTP 狀態', String(data.httpStatus)));
    container.append(metaItem('編碼', data.charset));
    if (data.redirectChain.length > 0) {
        container.append(metaItem('重導向次數', String(data.redirectChain.length)));
    }
}

// HTTP 錯誤狀態的說法。分開寫是因為使用者要採取的行動完全不同:
// 403 要調整站方的 bot 防護規則,404 要檢查網址有沒有打錯,
// 410 的網址沒打錯,該做的是把站內外指向它的連結拿掉。
function statusBannerCopy(status) {
    if (status === 401 || status === 403) {
        return {
            title: `伺服器以 HTTP ${status} 拒絕了這次請求`,
            desc: '通常是 Cloudflare 之類的 bot 防護把本工具的 User-Agent 擋下來了。抓到的是那張拒絕頁面，不是你要檢測的內容。',
        };
    }
    if (status === 404) {
        return {
            title: '這個網址回傳 HTTP 404，頁面不存在',
            desc: '請先確認網址有沒有打錯、或該頁面是不是已經下架。抓到的是站方的錯誤頁面，不是你要檢測的內容。',
        };
    }
    if (status === 410) {
        return {
            title: '這個網址回傳 HTTP 410，站方表明此頁面已永久移除',
            desc: '410 與 404 不同，它是站方主動宣告「這個頁面永久不會再回來」，所以網址通常沒有打錯，要做的是把站內外指向它的連結改掉或移除，避免 AI 引擎與使用者一再走進死路。抓到的是站方的下架頁面，不是你要檢測的內容。',
        };
    }
    if (status >= 500) {
        return {
            title: `伺服器回傳 HTTP ${status} 錯誤`,
            desc: '對方伺服器目前有問題，過一段時間再掃一次。抓到的是錯誤頁面，不是你要檢測的內容。',
        };
    }
    return {
        title: `這個網址回傳 HTTP ${status}`,
        desc: '這不是正常的成功狀態碼，抓到的內容很可能不是你要檢測的頁面。',
    };
}

// 錯誤頁照樣分析、照樣給分,但必須在最上方講清楚分數的對象是誰。
// 不直接擋下不分析的理由:robots.txt 與 llms.txt 抓的是 origin 層級的檔案,
// 就算這個路徑 404,「AI 爬蟲存取權限明細」那一段的結論仍然完全成立。
function renderStatusBanner(data) {
    const banner = document.getElementById('status-banner');
    const status = data.httpStatus;
    if (!Number.isInteger(status) || status < 400) {
        banner.hidden = true;
        return;
    }

    const { title, desc } = statusBannerCopy(status);
    document.getElementById('status-banner-title').textContent = title;
    document.getElementById('status-banner-desc').textContent =
        `${desc}下方三大分類分數描述的是這張錯誤頁面本身的內容品質，不代表你原本想檢測的頁面。`;
    banner.hidden = false;
}

function renderGateBanner(crawlerAccess) {
    const banner = document.getElementById('gate-banner');
    if (!crawlerAccess.gateTriggered) {
        banner.hidden = true;
        return;
    }
    banner.hidden = false;
    const desc = document.getElementById('gate-banner-desc');
    desc.textContent = `以下 AI 爬蟲被 robots.txt 明確擋在門外,代表這些答案引擎的訓練或即時檢索都讀不到這個頁面。下方三大分類分數描述的是「解除封鎖後」這個頁面的內容品質,不代表目前實際會被引用。`;

    const list = document.getElementById('gate-banner-list');
    list.replaceChildren();
    for (const bot of crawlerAccess.blockedBots) {
        const tag = document.createElement('span');
        tag.className = 'gate-banner-tag';
        tag.textContent = `${bot.ua}(${bot.vendor})`;
        list.append(tag);
    }
}

function scoreStatusClass(score) {
    if (score === null) return 'na';
    if (score >= 80) return 'pass';
    if (score >= 50) return 'warn';
    return 'fail';
}

function renderScoreGauge(overallScore) {
    const valueEl = document.getElementById('score-value');
    const fillEl = document.getElementById('score-gauge-fill');
    const circumference = 2 * Math.PI * 80;

    valueEl.textContent = overallScore === null ? 'N/A' : String(overallScore);

    fillEl.classList.remove('is-pass', 'is-warn', 'is-fail');
    const statusClass = scoreStatusClass(overallScore);
    if (statusClass !== 'na') fillEl.classList.add(`is-${statusClass}`);

    const ratio = overallScore === null ? 0 : overallScore / 100;
    const offset = circumference * (1 - ratio);
    // 先重置到滿圈,下一個 frame 再設定目標值,確保 transition 每次都會重新播放
    fillEl.style.transition = 'none';
    fillEl.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => {
        fillEl.style.transition = '';
        fillEl.style.strokeDashoffset = String(offset);
    });
}

function renderScoreBreakdown(categories) {
    const container = document.getElementById('score-breakdown');
    container.replaceChildren();
    for (const key of Object.keys(categories)) {
        const cat = categories[key];
        const row = document.createElement('div');
        row.className = 'score-breakdown-row';

        const label = document.createElement('span');
        label.className = 'score-breakdown-label';
        label.textContent = cat.label;

        const track = document.createElement('div');
        track.className = 'score-breakdown-bar-track';
        const fill = document.createElement('div');
        fill.className = 'score-breakdown-bar-fill';
        fill.style.width = '0%';
        track.append(fill);
        requestAnimationFrame(() => {
            fill.style.width = `${cat.score === null ? 0 : cat.score}%`;
        });

        const value = document.createElement('span');
        value.className = 'score-breakdown-value';
        value.textContent = cat.score === null ? 'N/A' : String(cat.score);

        row.append(label, track, value);
        container.append(row);
    }
}

function badgeEl(status) {
    const badge = document.createElement('span');
    badge.className = `badge badge-${status}`;
    badge.textContent = STATUS_LABEL[status] || status;
    return badge;
}

function renderCategoryList(categories) {
    const container = document.getElementById('category-list');
    container.replaceChildren();

    Object.values(categories).forEach((cat, index) => {
        const card = document.createElement('div');
        card.className = 'category-card';
        const isOpen = index === 0;
        if (isOpen) card.classList.add('is-open');

        // W3C ARIA 的 accordion 模式:標題在外、可操作的觸發器(button)在內。
        // 不能反過來把 h3 塞進 button —— button 的內容模型只允許 phrasing content,
        // 那是無效巢狀。副作用是螢幕閱讀器會把分數一起念進標題,這是好事:
        // 使用者一次聽到「結構化資料,83 分」,不用再往下找。
        const headingWrap = document.createElement('h3');
        headingWrap.className = 'category-card-heading-wrap';

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'category-card-header';
        header.setAttribute('aria-expanded', String(isOpen));

        const heading = document.createElement('div');
        heading.className = 'category-card-heading';
        const title = document.createElement('span');
        title.className = 'category-card-title';
        title.textContent = cat.label;
        const count = document.createElement('span');
        count.className = 'category-card-count mono';
        count.textContent = `${cat.applicableCount}/${cat.totalCount} 項適用`;
        heading.append(title, count);

        const scoreWrap = document.createElement('div');
        scoreWrap.className = 'category-card-score';
        const scoreValue = document.createElement('span');
        scoreValue.className = `category-card-score-value is-${scoreStatusClass(cat.score)}`;
        scoreValue.textContent = cat.score === null ? 'N/A' : String(cat.score);
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('viewBox', '0 0 20 20');
        chevron.setAttribute('fill', 'none');
        chevron.classList.add('category-card-chevron');
        const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        chevronPath.setAttribute('d', 'M5 7.5L10 12.5L15 7.5');
        chevronPath.setAttribute('stroke', 'currentColor');
        chevronPath.setAttribute('stroke-width', '1.8');
        chevronPath.setAttribute('stroke-linecap', 'round');
        chevronPath.setAttribute('stroke-linejoin', 'round');
        chevron.append(chevronPath);
        scoreWrap.append(scoreValue, chevron);

        header.append(heading, scoreWrap);
        header.addEventListener('click', () => {
            const open = card.classList.toggle('is-open');
            header.setAttribute('aria-expanded', String(open));
        });
        headingWrap.append(header);

        const body = document.createElement('div');
        body.className = 'category-card-body';
        const bodyInner = document.createElement('div');
        bodyInner.className = 'category-card-body-inner';

        for (const check of cat.checks) {
            bodyInner.append(checkRowEl(check));
        }
        body.append(bodyInner);

        card.append(headingWrap, body);
        container.append(card);
    });
}

function checkRowEl(check) {
    const row = document.createElement('div');
    row.className = 'check-row';

    const head = document.createElement('div');
    head.className = 'check-row-head';
    const label = document.createElement('span');
    label.className = 'check-row-label';
    label.textContent = check.label;
    head.append(label, badgeEl(check.status));

    const evidence = document.createElement('p');
    evidence.className = 'check-row-evidence';
    evidence.textContent = check.evidence;

    const why = document.createElement('p');
    why.className = 'check-row-why';
    why.textContent = check.why;

    row.append(head, evidence, why);
    return row;
}

function renderCrawlerTable(crawlerAccess) {
    const tbody = document.getElementById('crawler-table-body');
    tbody.replaceChildren();

    for (const bot of crawlerAccess.bots) {
        const tr = document.createElement('tr');

        const tdBot = document.createElement('td');
        tdBot.className = 'crawler-table-bot mono';
        tdBot.textContent = bot.ua;

        const tdVendor = document.createElement('td');
        tdVendor.className = 'crawler-table-vendor';
        tdVendor.textContent = bot.vendor;

        const tdPurpose = document.createElement('td');
        tdPurpose.className = 'crawler-table-purpose';
        tdPurpose.textContent = bot.purpose;

        const tdStatus = document.createElement('td');
        tdStatus.append(badgeEl(bot.blocked ? 'fail' : 'pass'));

        tr.append(tdBot, tdVendor, tdPurpose, tdStatus);
        tbody.append(tr);
    }

    const llmsNote = document.getElementById('llms-note');
    llmsNote.textContent = crawlerAccess.llmsTxtExists
        ? '此網站有提供 llms.txt。這是社群提出的新興標準,尚未被主要 AI 廠商正式採用,僅供參考。'
        : '此網站沒有 llms.txt。這是社群提出的新興標準,尚未被主要 AI 廠商正式採用,缺少不影響分數。';
}

// ============================================================
// 快照儲存
// ============================================================

// 每個網址只留最近一次,新的一次掃描直接覆蓋 —— 使用者要的「前一次」就是這個意思。
// key 用 finalUrl 而不是使用者輸入的字串:example.com、https://example.com、
// 結尾有沒有斜線,指的都是同一個頁面,但輸入原文各不相同,用原文當 key 會比不到基準。
const SNAPSHOT_KEY_PREFIX = 'aeogeo:snapshot:';

function buildSnapshot(data) {
    return { ...data, scannedAt: Date.now() };
}

/**
 * 快照是使用者瀏覽器裡的舊資料,可能來自本工具的舊版本、也可能被手動改壞。
 * 這裡只確認比對程式碼會用到的欄位形狀,不做版本遷移 —— 對不上就當作沒有基準,
 * 頁面退回「第一次掃描」的狀態,不會拋錯把整份報告連帶弄壞。
 */
function isUsableSnapshot(value) {
    return (
        !!value &&
        typeof value === 'object' &&
        typeof value.scannedAt === 'number' &&
        !!value.categories &&
        typeof value.categories === 'object'
    );
}

function loadSnapshot(finalUrl) {
    let raw;
    try {
        raw = localStorage.getItem(SNAPSHOT_KEY_PREFIX + finalUrl);
    } catch {
        return null; // 瀏覽器停用儲存空間時,連 getItem 都會拋
    }
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return isUsableSnapshot(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function saveSnapshot(snapshot) {
    try {
        localStorage.setItem(SNAPSHOT_KEY_PREFIX + snapshot.finalUrl, JSON.stringify(snapshot));
    } catch (err) {
        // 儲存空間被停用,或掃過的網址夠多把配額用滿了。
        // 存不進去的後果只是「下一次沒有比較基準」,不該讓本次報告顯示失敗。
        console.warn(`[aeogeo] 無法儲存本次掃描快照: ${err.message}`);
    }
}

// ============================================================
// 兩次掃描的差異計算
// ============================================================

// pass / warn / fail 是同一把尺上的三個刻度,na 不是 —— 它代表「這項不適用於這個頁面」,
// 跟 na 之間的變化是分母變了,不是變好或變壞,所以另外歸成 shifted 一類據實呈現。
const STATUS_RANK = { fail: 0, warn: 1, pass: 2 };

function changeKind(from, to) {
    if (!(from in STATUS_RANK) || !(to in STATUS_RANK)) return 'shifted';
    return STATUS_RANK[to] > STATUS_RANK[from] ? 'improved' : 'regressed';
}

function normalizeScore(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// 任一邊是 null(整個分類都不適用)時就沒有差值可言,回 null 讓畫面顯示 N/A 而不是算成 0。
function scoreDelta(from, to) {
    return from === null || to === null ? null : to - from;
}

/**
 * 以「分類 + 檢查項 id」為鍵建索引。不能只用 id:兩個分類將來若用了同一個 slug,
 * 只比 id 會把不同分類的項目配成一對。
 */
function indexChecks(report) {
    const map = new Map();
    const categories = report?.categories || {};
    for (const key of Object.keys(categories)) {
        const category = categories[key];
        const checks = Array.isArray(category?.checks) ? category.checks : [];
        for (const check of checks) {
            if (!check || typeof check.id !== 'string') continue;
            map.set(`${key}::${check.id}`, {
                categoryKey: key,
                categoryLabel: category.label || key,
                check,
            });
        }
    }
    return map;
}

/**
 * 檢查項的差異。四種情形都要處理,不是只有「狀態變了」:
 * structured-data 的檢查項是條件式產生的(沒有 JSON-LD 時只有 1 項,有的時候 3 項),
 * 所以「本次才出現」與「本次消失」是真的會發生的正常狀況,不是資料壞掉。
 */
function diffChecks(current, previous) {
    const currentChecks = indexChecks(current);
    const previousChecks = indexChecks(previous);
    const changes = [];

    for (const [key, entry] of currentChecks) {
        const before = previousChecks.get(key);
        if (!before) {
            changes.push({
                kind: 'added',
                categoryLabel: entry.categoryLabel,
                label: entry.check.label,
                from: null,
                to: entry.check.status,
                evidenceFrom: null,
                evidenceTo: entry.check.evidence,
            });
            continue;
        }
        if (before.check.status === entry.check.status) continue;
        changes.push({
            kind: changeKind(before.check.status, entry.check.status),
            categoryLabel: entry.categoryLabel,
            label: entry.check.label,
            from: before.check.status,
            to: entry.check.status,
            evidenceFrom: before.check.evidence,
            evidenceTo: entry.check.evidence,
        });
    }

    for (const [key, entry] of previousChecks) {
        if (currentChecks.has(key)) continue;
        changes.push({
            kind: 'removed',
            categoryLabel: entry.categoryLabel,
            label: entry.check.label,
            from: entry.check.status,
            to: null,
            evidenceFrom: entry.check.evidence,
            evidenceTo: null,
        });
    }

    return changes;
}

function diffCategories(current, previous) {
    const currentCategories = current?.categories || {};
    const previousCategories = previous?.categories || {};

    return Object.keys(currentCategories).map((key) => {
        const to = normalizeScore(currentCategories[key]?.score);
        const from = key in previousCategories ? normalizeScore(previousCategories[key]?.score) : null;
        return { key, label: currentCategories[key]?.label || key, from, to, delta: scoreDelta(from, to) };
    });
}

/**
 * 爬蟲的差異以 ua 為鍵。名單本身會隨工具版本增減(這份清單曾經從 10 支擴充到 18 支),
 * 所以「本次多出來的爬蟲」多半是工具更新,不是使用者的網站變了 —— 畫面上分開講清楚。
 */
function diffBots(current, previous) {
    const currentBots = new Map((current?.crawlerAccess?.bots || []).map((bot) => [bot.ua, bot]));
    const previousBots = new Map((previous?.crawlerAccess?.bots || []).map((bot) => [bot.ua, bot]));
    const changed = [];
    const added = [];
    const removed = [];

    for (const [ua, bot] of currentBots) {
        const before = previousBots.get(ua);
        if (!before) {
            added.push({ ua, vendor: bot.vendor, blocked: Boolean(bot.blocked) });
            continue;
        }
        if (Boolean(before.blocked) === Boolean(bot.blocked)) continue;
        changed.push({ ua, vendor: bot.vendor, from: Boolean(before.blocked), to: Boolean(bot.blocked) });
    }

    for (const [ua, bot] of previousBots) {
        if (currentBots.has(ua)) continue;
        removed.push({ ua, vendor: bot.vendor, blocked: Boolean(bot.blocked) });
    }

    return { changed, added, removed };
}

// robots.txt 與 llms.txt 的有無。這兩個旗標變了但每一支爬蟲的判定都沒變是有可能的
// (例如新增一份什麼都不擋的 robots.txt),少了這一段那次改動會被報成「完全相同」。
function diffFlags(current, previous) {
    const flags = [
        { label: 'robots.txt', field: 'robotsTxtExists' },
        { label: 'llms.txt', field: 'llmsTxtExists' },
    ];
    return flags
        .map(({ label, field }) => ({
            label,
            from: Boolean(previous?.crawlerAccess?.[field]),
            to: Boolean(current?.crawlerAccess?.[field]),
        }))
        .filter((flag) => flag.from !== flag.to);
}

function diffReports(current, previous) {
    const overallFrom = normalizeScore(previous?.overallScore);
    const overallTo = normalizeScore(current?.overallScore);
    const categories = diffCategories(current, previous);
    const checks = diffChecks(current, previous);
    const bots = diffBots(current, previous);
    const flags = diffFlags(current, previous);

    return {
        previousScannedAt: previous.scannedAt,
        previousHttpStatus: previous.httpStatus,
        currentHttpStatus: current.httpStatus,
        overall: { from: overallFrom, to: overallTo, delta: scoreDelta(overallFrom, overallTo) },
        categories,
        checks,
        bots,
        flags,
        hasChanges:
            checks.length > 0 ||
            bots.changed.length > 0 ||
            bots.added.length > 0 ||
            bots.removed.length > 0 ||
            flags.length > 0 ||
            (overallFrom !== overallTo),
    };
}

// ============================================================
// 比較區塊的畫面
// ============================================================

const CHANGE_GROUPS = [
    { kind: 'improved', title: '改善' },
    { kind: 'regressed', title: '退步' },
    { kind: 'shifted', title: '適用性改變' },
    { kind: 'added', title: '本次新增的檢查項' },
    { kind: 'removed', title: '本次不再列入的檢查項' },
];

function pad2(value) {
    return String(value).padStart(2, '0');
}

// 不用 toLocaleString:各瀏覽器與各語系的輸出格式不同,而這個字串會一起寫進下載的報表檔。
function formatTimestamp(ms) {
    const date = new Date(ms);
    return (
        `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
        `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    );
}

function formatScore(value) {
    return value === null ? 'N/A' : String(value);
}

function formatDelta(delta) {
    if (delta === null) return '—';
    if (delta === 0) return '±0';
    return delta > 0 ? `+${delta}` : String(delta);
}

function deltaClass(delta) {
    if (delta === null || delta === 0) return 'is-flat';
    return delta > 0 ? 'is-up' : 'is-down';
}

function scoreDeltaItemEl(label, from, to, delta) {
    const item = document.createElement('div');
    item.className = 'compare-score-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'compare-score-label';
    labelEl.textContent = label;

    const values = document.createElement('span');
    values.className = 'compare-score-values mono';
    values.textContent = `${formatScore(from)} → ${formatScore(to)}`;

    const deltaEl = document.createElement('span');
    deltaEl.className = `compare-delta mono ${deltaClass(delta)}`;
    deltaEl.textContent = formatDelta(delta);

    item.append(labelEl, values, deltaEl);
    return item;
}

function statusTransitionEl(from, to) {
    const wrap = document.createElement('span');
    wrap.className = 'compare-change-transition';
    if (from) wrap.append(badgeEl(from));
    const arrow = document.createElement('span');
    arrow.className = 'compare-arrow mono';
    arrow.textContent = from && to ? '→' : from ? '→ 已移除' : '新增 →';
    wrap.append(arrow);
    if (to) wrap.append(badgeEl(to));
    return wrap;
}

function changeRowEl(change) {
    const row = document.createElement('div');
    row.className = 'compare-change-row';

    const head = document.createElement('div');
    head.className = 'compare-change-head';

    const heading = document.createElement('div');
    heading.className = 'compare-change-heading';
    const category = document.createElement('span');
    category.className = 'compare-change-category';
    category.textContent = change.categoryLabel;
    const label = document.createElement('span');
    label.className = 'compare-change-label';
    label.textContent = change.label;
    heading.append(category, label);

    head.append(heading, statusTransitionEl(change.from, change.to));
    row.append(head);

    // 判定依據只在真的不同時才列出來,否則每一列都會多兩行一模一樣的字。
    if (change.evidenceFrom && change.evidenceFrom !== change.evidenceTo) {
        const before = document.createElement('p');
        before.className = 'compare-change-evidence';
        before.textContent = `上次:${change.evidenceFrom}`;
        row.append(before);
    }
    if (change.evidenceTo && change.evidenceTo !== change.evidenceFrom) {
        const after = document.createElement('p');
        after.className = 'compare-change-evidence';
        after.textContent = `本次:${change.evidenceTo}`;
        row.append(after);
    }

    return row;
}

function compareGroupEl(title, rows) {
    const group = document.createElement('div');
    group.className = 'compare-group';
    const heading = document.createElement('h3');
    heading.className = 'compare-group-title';
    heading.textContent = `${title}(${rows.length})`;
    group.append(heading, ...rows);
    return group;
}

function botChangeRowEl(change) {
    const row = document.createElement('div');
    row.className = 'compare-change-row';

    const head = document.createElement('div');
    head.className = 'compare-change-head';

    const heading = document.createElement('div');
    heading.className = 'compare-change-heading';
    const vendor = document.createElement('span');
    vendor.className = 'compare-change-category';
    vendor.textContent = change.vendor;
    const label = document.createElement('span');
    label.className = 'compare-change-label mono';
    label.textContent = change.ua;
    heading.append(vendor, label);

    head.append(heading, statusTransitionEl(change.from ? 'fail' : 'pass', change.to ? 'fail' : 'pass'));
    row.append(head);
    return row;
}

function plainChangeRowEl(text) {
    const row = document.createElement('div');
    row.className = 'compare-change-row';
    const line = document.createElement('p');
    line.className = 'compare-change-plain';
    line.textContent = text;
    row.append(line);
    return row;
}

// 兩次掃描裡只要有一次抓到的是錯誤頁,分數差就沒有意義 —— 但照這個工具一貫的做法,
// 是把話講清楚而不是拒絕比較(同 status-banner:照樣給分,但講明分數的對象是誰)。
function compareStatusWarning(diff) {
    const suspicious = [];
    if (Number.isInteger(diff.previousHttpStatus) && diff.previousHttpStatus >= 400) {
        suspicious.push(`上次掃描回傳 HTTP ${diff.previousHttpStatus}`);
    }
    if (Number.isInteger(diff.currentHttpStatus) && diff.currentHttpStatus >= 400) {
        suspicious.push(`本次掃描回傳 HTTP ${diff.currentHttpStatus}`);
    }
    if (suspicious.length === 0) return null;
    return `${suspicious.join('、')}。分數描述的是那張錯誤頁面本身,兩次之間的差異不代表你要檢測的頁面變好或變壞。`;
}

function renderComparePanel(data, previous, diff) {
    const panel = document.getElementById('compare-panel');
    const baseline = document.getElementById('compare-baseline');
    const note = document.getElementById('compare-note');
    const scoreRow = document.getElementById('compare-score-row');
    const changeList = document.getElementById('compare-change-list');

    scoreRow.replaceChildren();
    changeList.replaceChildren();
    panel.hidden = false;

    if (!previous) {
        baseline.textContent = '尚無比較基準';
        note.textContent =
            '這是第一次掃描這個網址。本次結果已存進這台瀏覽器,改完網站再掃一次同一個網址,這裡就會列出兩次之間的差異。';
        note.className = 'compare-panel-note';
        note.hidden = false;
        return;
    }

    baseline.textContent = `基準:${formatTimestamp(diff.previousScannedAt)} 的掃描(HTTP ${previous.httpStatus})`;

    const warning = compareStatusWarning(diff);
    if (warning) {
        note.textContent = warning;
        note.className = 'compare-panel-note is-warn';
        note.hidden = false;
    } else {
        note.hidden = true;
        note.textContent = '';
    }

    scoreRow.append(scoreDeltaItemEl('總分', diff.overall.from, diff.overall.to, diff.overall.delta));
    for (const category of diff.categories) {
        scoreRow.append(scoreDeltaItemEl(category.label, category.from, category.to, category.delta));
    }

    if (!diff.hasChanges) {
        const empty = document.createElement('p');
        empty.className = 'compare-empty';
        empty.textContent = '與上次掃描相比,分數與每一項檢查的判定結果完全相同。';
        changeList.append(empty);
        return;
    }

    for (const { kind, title } of CHANGE_GROUPS) {
        const rows = diff.checks.filter((change) => change.kind === kind);
        if (rows.length === 0) continue;
        changeList.append(compareGroupEl(title, rows.map(changeRowEl)));
    }

    if (diff.bots.changed.length > 0) {
        changeList.append(compareGroupEl('AI 爬蟲存取權限變動', diff.bots.changed.map(botChangeRowEl)));
    }
    if (diff.flags.length > 0) {
        const rows = diff.flags.map((flag) =>
            plainChangeRowEl(`${flag.label}:${flag.from ? '原本存在' : '原本不存在'} → ${flag.to ? '本次存在' : '本次不存在'}`),
        );
        changeList.append(compareGroupEl('站台層級檔案變動', rows));
    }
    if (diff.bots.added.length > 0 || diff.bots.removed.length > 0) {
        const rows = [
            ...diff.bots.added.map((bot) =>
                plainChangeRowEl(`${bot.ua}(${bot.vendor})本次才開始追蹤,沒有上次的資料可比`),
            ),
            ...diff.bots.removed.map((bot) =>
                plainChangeRowEl(`${bot.ua}(${bot.vendor})已從追蹤名單移除`),
            ),
        ];
        changeList.append(compareGroupEl('追蹤名單本身的變動(與你的網站無關)', rows));
    }
}

// ============================================================
// 下載報表
// ============================================================

// 這份樣式表只服務「下載後的單一 HTML 檔」,不是本站的樣式。
// 專案規範禁止頁面內嵌 <style>,這裡是刻意的例外:報表要能離線、能寄給別人、
// 能直接列印成 PDF,就不能引用任何外部檔案。也因此用系統字型堆疊而不是本站的
// 自架字型 —— 把 241 KB 的 woff2 轉成 base64 塞進每一份報表並不合理。
const REPORT_STYLESHEET = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
    margin: 0;
    padding: 32px 24px 64px;
    background: #f4f6fa;
    color: #10141c;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif;
    font-size: 14px;
    line-height: 1.7;
}
.doc { max-width: 900px; margin: 0 auto; }
.doc-head { margin-bottom: 32px; }
.doc-eyebrow { margin: 0 0 8px; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 14px; letter-spacing: 0.08em; color: #868fa3; }
.doc-title { margin: 0 0 12px; font-size: 28px; line-height: 1.3; }
.doc-url { margin: 0 0 4px; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; word-break: break-all; }
.doc-time { margin: 0; color: #565f74; }
.doc-section { margin-bottom: 32px; padding: 24px; background: #ffffff; border: 1px solid #dde3ec; border-radius: 14px; }
.doc-section-title { margin: 0 0 4px; font-size: 20px; }
.doc-section-desc { margin: 0 0 16px; color: #868fa3; }
.doc-alert { background: #fbe7ea; border-color: rgba(217, 48, 74, 0.4); border-left: 4px solid #d9304a; }
.doc-alert-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; color: #d9304a; }
.doc-alert-desc { margin: 0; color: #565f74; }
.doc-overall { margin: 0 0 16px; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 40px; font-weight: 700; }
.doc-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
.doc-table:last-child { margin-bottom: 0; }
.doc-table th, .doc-table td { padding: 8px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid #dde3ec; }
.doc-table thead th { color: #565f74; font-weight: 600; white-space: nowrap; }
.doc-table tbody th { width: 120px; color: #868fa3; font-weight: 500; white-space: nowrap; }
.doc-cell-mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; word-break: break-all; }
.doc-cell-why { color: #868fa3; }
.doc-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 14px; font-weight: 600; white-space: nowrap; }
.doc-badge-pass { background: #e3f6ea; color: #0f7a46; }
.doc-badge-warn { background: #fbf0da; color: #a15c00; }
.doc-badge-fail { background: #fbe7ea; color: #d9304a; }
.doc-badge-na { background: #eef0f3; color: #6b7280; }
.doc-delta-up { color: #0f7a46; font-weight: 700; }
.doc-delta-down { color: #d9304a; font-weight: 700; }
.doc-delta-flat { color: #868fa3; }
.doc-group-title { margin: 24px 0 8px; font-size: 16px; }
.doc-group-title:first-of-type { margin-top: 0; }
.doc-foot { color: #868fa3; }
@media print {
    body { padding: 0; background: #ffffff; font-size: 12pt; }
    .doc-section { break-inside: avoid; border-radius: 0; }
}
`;

const REPORT_FOOTER_NOTE =
    '本報表由 AEO/GEO 訊號掃描器產出。這是啟發式評分工具,不是任何 AI 廠商的官方標準;' +
    '每一項判定都附有依據,請對照依據自行判斷,不要只看分數。' +
    '比較基準來自同一台瀏覽器上一次掃描同一個網址的結果。';

function docEl(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

/**
 * 表格產生器。cell 可以是字串,或 { text, className, head } 物件。
 * 所有文字一律走 textContent —— 報表內容大量來自被檢測的第三方網頁(title、
 * meta description、evidence),用字串拼 HTML 等於把本站開頭那段 XSS 說明作廢,
 * 而且是作廢在一個使用者會用 file:// 打開、還可能轉寄給客戶的檔案裡。
 */
function docTable(doc, headers, rows) {
    const table = docEl(doc, 'table', 'doc-table');

    if (headers) {
        const thead = doc.createElement('thead');
        const tr = doc.createElement('tr');
        for (const header of headers) tr.append(docEl(doc, 'th', null, header));
        thead.append(tr);
        table.append(thead);
    }

    const tbody = doc.createElement('tbody');
    for (const cells of rows) {
        const tr = doc.createElement('tr');
        for (const cell of cells) {
            const isObject = cell !== null && typeof cell === 'object';
            const tag = isObject && cell.head ? 'th' : 'td';
            tr.append(docEl(doc, tag, isObject ? cell.className : null, isObject ? cell.text : cell));
        }
        tbody.append(tr);
    }
    table.append(tbody);
    return table;
}

function docBadge(doc, status) {
    return docEl(doc, 'span', `doc-badge doc-badge-${status}`, STATUS_LABEL[status] || status);
}

function docSection(doc, title, desc) {
    const section = docEl(doc, 'section', 'doc-section');
    section.append(docEl(doc, 'h2', 'doc-section-title', title));
    if (desc) section.append(docEl(doc, 'p', 'doc-section-desc', desc));
    return section;
}

function docMetaSection(doc, data, scannedAt) {
    const rows = [
        [{ text: '請求網址', head: true }, { text: data.requestedUrl, className: 'doc-cell-mono' }],
        [{ text: '最終網址', head: true }, { text: data.finalUrl, className: 'doc-cell-mono' }],
        [{ text: 'HTTP 狀態', head: true }, { text: String(data.httpStatus), className: 'doc-cell-mono' }],
        [{ text: '編碼', head: true }, { text: data.charset, className: 'doc-cell-mono' }],
        [
            { text: '重導向次數', head: true },
            { text: String((data.redirectChain || []).length), className: 'doc-cell-mono' },
        ],
        [{ text: '掃描時間', head: true }, { text: formatTimestamp(scannedAt), className: 'doc-cell-mono' }],
    ];
    const section = docSection(doc, '基本資訊');
    section.append(docTable(doc, null, rows));
    return section;
}

function docAlertSection(doc, title, desc) {
    const section = docEl(doc, 'section', 'doc-section doc-alert');
    section.append(docEl(doc, 'p', 'doc-alert-title', title));
    section.append(docEl(doc, 'p', 'doc-alert-desc', desc));
    return section;
}

function docScoreSection(doc, data) {
    const section = docSection(doc, '分數總覽', '三大分類等權重平均。AI 爬蟲存取權限不計入總分,是獨立的警示。');
    section.append(docEl(doc, 'p', 'doc-overall', `${formatScore(normalizeScore(data.overallScore))} / 100`));

    const rows = Object.values(data.categories).map((category) => [
        category.label,
        { text: formatScore(normalizeScore(category.score)), className: 'doc-cell-mono' },
        { text: `${category.applicableCount}/${category.totalCount}`, className: 'doc-cell-mono' },
    ]);
    section.append(docTable(doc, ['分類', '分數', '適用項目'], rows));
    return section;
}

function docDeltaCell(doc, delta) {
    const suffix = delta === null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
    return { text: formatDelta(delta), className: `doc-cell-mono doc-delta-${suffix}` };
}

function docCompareSection(doc, diff) {
    const section = docSection(
        doc,
        '與上次掃描比較',
        `基準:${formatTimestamp(diff.previousScannedAt)} 的掃描(HTTP ${diff.previousHttpStatus})`,
    );

    const warning = compareStatusWarning(diff);
    if (warning) section.append(docEl(doc, 'p', 'doc-section-desc', warning));

    const scoreRows = [
        ['總分', formatScore(diff.overall.from), formatScore(diff.overall.to), diff.overall.delta],
        ...diff.categories.map((category) => [
            category.label,
            formatScore(category.from),
            formatScore(category.to),
            category.delta,
        ]),
    ].map(([label, from, to, delta]) => [
        label,
        { text: from, className: 'doc-cell-mono' },
        { text: to, className: 'doc-cell-mono' },
        docDeltaCell(doc, delta),
    ]);
    section.append(docTable(doc, ['項目', '上次', '本次', '變化'], scoreRows));

    if (!diff.hasChanges) {
        section.append(docEl(doc, 'p', 'doc-section-desc', '與上次掃描相比,分數與每一項檢查的判定結果完全相同。'));
        return section;
    }

    for (const { kind, title } of CHANGE_GROUPS) {
        const changes = diff.checks.filter((change) => change.kind === kind);
        if (changes.length === 0) continue;
        section.append(docEl(doc, 'h3', 'doc-group-title', `${title}(${changes.length})`));
        // 上次與本次的判定依據分成兩欄。合成一欄再用 || 取值的話,
        // 「本次消失的檢查項」只有上次的依據,會被放到寫著「本次」的欄位底下變成錯誤標示。
        const rows = changes.map((change) => [
            change.categoryLabel,
            change.label,
            { text: '', className: null },
            { text: change.evidenceFrom || '', className: 'doc-cell-mono' },
            { text: change.evidenceTo || '', className: 'doc-cell-mono' },
        ]);
        const table = docTable(doc, ['分類', '檢查項', '狀態變化', '上次判定依據', '本次判定依據'], rows);
        // 狀態變化那一格要放兩顆有顏色的標籤,不是純文字,所以表格建好之後再填。
        const bodyRows = table.querySelectorAll('tbody tr');
        changes.forEach((change, index) => {
            const cell = bodyRows[index].children[2];
            if (change.from) cell.append(docBadge(doc, change.from));
            cell.append(docEl(doc, 'span', null, change.from && change.to ? ' → ' : ' '));
            if (change.to) cell.append(docBadge(doc, change.to));
        });
        section.append(table);
    }

    if (diff.bots.changed.length > 0) {
        section.append(docEl(doc, 'h3', 'doc-group-title', `AI 爬蟲存取權限變動(${diff.bots.changed.length})`));
        const rows = diff.bots.changed.map((bot) => [
            { text: bot.ua, className: 'doc-cell-mono' },
            bot.vendor,
            bot.from ? '被封鎖' : '可存取',
            bot.to ? '被封鎖' : '可存取',
        ]);
        section.append(docTable(doc, ['爬蟲', '廠商', '上次', '本次'], rows));
    }

    if (diff.flags.length > 0) {
        const rows = diff.flags.map((flag) => [
            flag.label,
            flag.from ? '存在' : '不存在',
            flag.to ? '存在' : '不存在',
        ]);
        section.append(docEl(doc, 'h3', 'doc-group-title', '站台層級檔案變動'));
        section.append(docTable(doc, ['檔案', '上次', '本次'], rows));
    }

    if (diff.bots.added.length > 0 || diff.bots.removed.length > 0) {
        const rows = [
            ...diff.bots.added.map((bot) => [{ text: bot.ua, className: 'doc-cell-mono' }, bot.vendor, '本次才開始追蹤']),
            ...diff.bots.removed.map((bot) => [{ text: bot.ua, className: 'doc-cell-mono' }, bot.vendor, '已從追蹤名單移除']),
        ];
        section.append(docEl(doc, 'h3', 'doc-group-title', '追蹤名單本身的變動(與你的網站無關)'));
        section.append(docTable(doc, ['爬蟲', '廠商', '說明'], rows));
    }

    return section;
}

function docChecksSection(doc, data) {
    const section = docSection(doc, '檢查項明細');

    for (const category of Object.values(data.categories)) {
        section.append(
            docEl(
                doc,
                'h3',
                'doc-group-title',
                `${category.label}(${formatScore(normalizeScore(category.score))} 分,${category.applicableCount}/${category.totalCount} 項適用)`,
            ),
        );
        const rows = category.checks.map((check) => [
            check.label,
            { text: '', className: null },
            { text: check.evidence, className: 'doc-cell-mono' },
            { text: check.why, className: 'doc-cell-why' },
        ]);
        const table = docTable(doc, ['檢查項', '狀態', '判定依據', '為什麼重要'], rows);
        const bodyRows = table.querySelectorAll('tbody tr');
        category.checks.forEach((check, index) => {
            bodyRows[index].children[1].append(docBadge(doc, check.status));
        });
        section.append(table);
    }

    return section;
}

function docCrawlerSection(doc, crawlerAccess) {
    const section = docSection(
        doc,
        'AI 爬蟲存取權限明細',
        '依 robots.txt 規則逐一比對各家 AI 答案引擎的爬蟲/取用 User-Agent。',
    );

    const rows = crawlerAccess.bots.map((bot) => [
        { text: bot.ua, className: 'doc-cell-mono' },
        bot.vendor,
        bot.purpose,
        { text: '', className: null },
        { text: bot.note || '', className: 'doc-cell-why' },
    ]);
    const table = docTable(doc, ['爬蟲', '廠商', '用途', '狀態', '判定依據'], rows);
    const bodyRows = table.querySelectorAll('tbody tr');
    crawlerAccess.bots.forEach((bot, index) => {
        bodyRows[index].children[3].append(docBadge(doc, bot.blocked ? 'fail' : 'pass'));
    });
    section.append(table);

    section.append(
        docEl(
            doc,
            'p',
            'doc-section-desc',
            crawlerAccess.llmsTxtExists
                ? '此網站有提供 llms.txt。這是社群提出的新興標準,尚未被主要 AI 廠商正式採用,僅供參考。'
                : '此網站沒有 llms.txt。這是社群提出的新興標準,尚未被主要 AI 廠商正式採用,缺少不影響分數。',
        ),
    );
    return section;
}

/**
 * 產出一份可離線開啟的單檔報表。整份文件用 DOM API 建立再序列化,不用字串拼接:
 * 這樣「哪個欄位忘了跳脫」這件事不可能發生,連 <title> 也是走 doc.title 設定的。
 * 產物裡沒有任何 <script>。
 */
function buildReportHtml(data, previous, diff, generatedAt) {
    const doc = document.implementation.createHTMLDocument(`AEO/GEO 檢測報表 ${data.finalUrl}`);

    const charset = doc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    doc.head.prepend(charset);

    const viewport = doc.createElement('meta');
    viewport.setAttribute('name', 'viewport');
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    doc.head.append(viewport);

    const style = doc.createElement('style');
    style.textContent = REPORT_STYLESHEET;
    doc.head.append(style);

    doc.documentElement.setAttribute('lang', 'zh-Hant');

    const main = docEl(doc, 'main', 'doc');

    const head = docEl(doc, 'header', 'doc-head');
    head.append(docEl(doc, 'p', 'doc-eyebrow', 'AEO / GEO SIGNAL SCANNER'));
    head.append(docEl(doc, 'h1', 'doc-title', 'AEO/GEO 檢測報表'));
    head.append(docEl(doc, 'p', 'doc-url', data.finalUrl));
    head.append(docEl(doc, 'p', 'doc-time', `產出時間 ${formatTimestamp(generatedAt)}`));
    main.append(head);

    main.append(docMetaSection(doc, data, generatedAt));

    if (Number.isInteger(data.httpStatus) && data.httpStatus >= 400) {
        const { title, desc } = statusBannerCopy(data.httpStatus);
        main.append(
            docAlertSection(
                doc,
                title,
                `${desc}下方三大分類分數描述的是這張錯誤頁面本身的內容品質,不代表你原本想檢測的頁面。`,
            ),
        );
    }

    if (data.crawlerAccess.gateTriggered) {
        const blocked = data.crawlerAccess.blockedBots.map((bot) => `${bot.ua}(${bot.vendor})`).join('、');
        main.append(
            docAlertSection(
                doc,
                '主要 AI 爬蟲被 robots.txt 封鎖',
                `以下 AI 爬蟲被 robots.txt 明確擋在門外:${blocked}。下方三大分類分數描述的是「解除封鎖後」這個頁面的內容品質,不代表目前實際會被引用。`,
            ),
        );
    }

    main.append(docScoreSection(doc, data));

    if (previous && diff) {
        main.append(docCompareSection(doc, diff));
    } else {
        const section = docSection(doc, '與上次掃描比較');
        section.append(
            docEl(doc, 'p', 'doc-section-desc', '這是第一次掃描這個網址,沒有可以比較的基準。'),
        );
        main.append(section);
    }

    main.append(docChecksSection(doc, data));
    main.append(docCrawlerSection(doc, data.crawlerAccess));
    main.append(docEl(doc, 'footer', 'doc-foot', REPORT_FOOTER_NOTE));

    doc.body.append(main);
    return `<!doctype html>\n${doc.documentElement.outerHTML}\n`;
}

/**
 * 檔名。一路收斂成 [a-z0-9-] 之後,Windows 不允許的 : / \ ? * " < > | 全部消失,
 * 所以不需要再逐一列舉那些字元。中文網域或路徑會被收成連字號 —— 檔名只是標籤,
 * 完整網址在報表內容裡。
 */
function reportFileName(finalUrl, now) {
    let source = finalUrl;
    try {
        const parsed = new URL(finalUrl);
        source = parsed.host + parsed.pathname;
    } catch {
        // 解析不了就用原字串,反正後面會全部過濾掉非英數字元
    }

    const slug =
        source
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'report';

    const stamp =
        `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
        `-${pad2(now.getHours())}${pad2(now.getMinutes())}`;

    return `aeogeo-${slug}-${stamp}.html`;
}

downloadButton.addEventListener('click', () => {
    if (!currentReport) return;

    const now = new Date();
    const html = buildReportHtml(currentReport.data, currentReport.previous, currentReport.diff, now.getTime());
    // charset 必須寫進 Blob 的 type:整份報表都是中文,少了它從 file:// 開啟會變亂碼。
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = reportFileName(currentReport.data.finalUrl, now);
    document.body.append(link);
    link.click();
    link.remove();

    // 不在 click() 之後立刻 revoke:部分瀏覽器要到下一個事件迴圈才真正取用這個 URL,
    // 太早釋放會下載到空檔案。
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
});

// ============================================================
// 回頂端按鈕
// ============================================================

// scroll 事件一秒可能觸發數十次,用 rAF 節流,每個畫面更新週期最多切換一次 class。
let backToTopTicking = false;

function updateBackToTopVisibility() {
    backToTopButton.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.6);
    backToTopTicking = false;
}

window.addEventListener(
    'scroll',
    () => {
        if (backToTopTicking) return;
        backToTopTicking = true;
        requestAnimationFrame(updateBackToTopVisibility);
    },
    { passive: true }
);

backToTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
