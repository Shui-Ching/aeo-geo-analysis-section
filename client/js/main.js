'use strict';

// 所有動態內容一律用 textContent 寫入 DOM,不用 innerHTML。
// 原因:evidence / title / meta description 等文字來自「被檢測的第三方網頁」,
// 若該網頁刻意在 <title> 塞入 <script> 之類內容,innerHTML 會直接執行,等同讓
// 對方網站對這個檢測工具下 XSS。

const STATUS_LABEL = { pass: '通過', warn: '警告', fail: '未通過', na: '不適用' };

const form = document.getElementById('scan-form');
const urlInput = document.getElementById('url-input');
const scanButton = document.getElementById('scan-button');
const errorEl = document.getElementById('scan-error');
const statusSection = document.getElementById('scan-status');
const statusText = document.getElementById('scan-status-text');
const reportSection = document.getElementById('report');

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

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await response.json();

        if (!response.ok) {
            showError(data.error || '掃描失敗,請確認網址是否正確');
            return;
        }

        renderReport(data);
        reportSection.hidden = false;
    } catch (err) {
        showError('無法連線到分析伺服器');
    } finally {
        statusSection.hidden = true;
        scanButton.disabled = false;
    }
});

function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
}

function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
}

function renderReport(data) {
    renderMeta(data);
    renderGateBanner(data.crawlerAccess);
    renderScoreGauge(data.overallScore);
    renderScoreBreakdown(data.categories);
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
        if (index === 0) card.classList.add('is-open');

        const header = document.createElement('div');
        header.className = 'category-card-header';

        const heading = document.createElement('div');
        heading.className = 'category-card-heading';
        const title = document.createElement('h3');
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
        header.addEventListener('click', () => card.classList.toggle('is-open'));

        const body = document.createElement('div');
        body.className = 'category-card-body';
        const bodyInner = document.createElement('div');
        bodyInner.className = 'category-card-body-inner';

        for (const check of cat.checks) {
            bodyInner.append(checkRowEl(check));
        }
        body.append(bodyInner);

        card.append(header, body);
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
