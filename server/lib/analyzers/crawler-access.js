'use strict';

// 涵蓋主要 AI 答案引擎的爬蟲/取用 UA。來源:各家官方文件(OpenAI、Anthropic、
// Perplexity、Google、Apple、Meta、Amazon)公開列出的 user-agent 名稱。
// 名單排序:先列第一方廠商的爬蟲,最後兩項是把資料轉賣/供應給多家模型的第三方
// (CCBot 是多數 LLM 訓練資料的主要來源,Diffbot 供應結構化資料與知識圖譜)。
//
// 兩點與其他項目性質不同,但仍必須列入,因為使用者要看的就是「robots.txt 有沒有擋住它」:
// - Google-Extended 與 Applebot-Extended 不是真的會來抓網頁的爬蟲,而是 robots.txt 專用的
//   控制標記——擋掉它們只影響「抓回去的資料能不能拿去訓練」,不影響一般搜尋索引。
// - Bytespider 常被回報無視 robots.txt;meta-externalfetcher 則是 Meta 官方文件自己載明
//   「依使用者要求取用時可能不套用 robots.txt」。這裡照樣呈現規則的判定結果,因為工具的
//   職責是檢查站方有沒有表態,對方遵不遵守不是站方能控制的。
const TRACKED_BOTS = [
  { ua: 'GPTBot', vendor: 'OpenAI', purpose: '訓練/索引' },
  { ua: 'OAI-SearchBot', vendor: 'OpenAI', purpose: 'ChatGPT 搜尋引用' },
  { ua: 'ChatGPT-User', vendor: 'OpenAI', purpose: '使用者即時瀏覽' },
  { ua: 'ClaudeBot', vendor: 'Anthropic', purpose: '訓練/索引' },
  { ua: 'Claude-SearchBot', vendor: 'Anthropic', purpose: 'Claude 搜尋引用' },
  { ua: 'Claude-User', vendor: 'Anthropic', purpose: '使用者即時瀏覽' },
  { ua: 'PerplexityBot', vendor: 'Perplexity', purpose: '索引/答案引用' },
  { ua: 'Perplexity-User', vendor: 'Perplexity', purpose: '使用者即時瀏覽' },
  { ua: 'Google-Extended', vendor: 'Google', purpose: 'Gemini/AI Overviews 訓練(控制標記)' },
  { ua: 'Applebot-Extended', vendor: 'Apple', purpose: 'Apple Intelligence 訓練(控制標記)' },
  { ua: 'meta-externalagent', vendor: 'Meta', purpose: 'Meta AI 訓練/索引' },
  { ua: 'meta-webindexer', vendor: 'Meta', purpose: 'Meta AI 搜尋引用' },
  { ua: 'meta-externalfetcher', vendor: 'Meta', purpose: '使用者即時瀏覽' },
  { ua: 'Amazonbot', vendor: 'Amazon', purpose: 'Alexa 回答/AI 模型訓練' },
  { ua: 'Bytespider', vendor: 'ByteDance', purpose: '豆包/TikTok 訓練資料' },
  { ua: 'cohere-ai', vendor: 'Cohere', purpose: '使用者即時瀏覽' },
  { ua: 'CCBot', vendor: 'Common Crawl', purpose: '多數 LLM 訓練資料來源' },
  { ua: 'Diffbot', vendor: 'Diffbot', purpose: '結構化資料/知識圖譜供應' },
];

// 規則轉正規表達式時的防護上限。robots.txt 來自使用者輸入的網址所指向的遠端主機,
// 內容不可信:一條含大量 `*` 的規則會編譯成 `.*a.*a.*…`,對長路徑做比對時可能引發
// 指數級回溯(ReDoS)。超過上限的規則直接忽略,寧可漏判也不讓單一請求卡住 event loop。
const MAX_RULE_LENGTH = 500;
const MAX_WILDCARDS = 10;

/**
 * 極簡 robots.txt 解析器:依 User-agent 分組,記錄各群組的 Disallow 與 Allow 規則。
 *
 * 已知限制:同一個 user-agent 若在檔案中出現兩組不連續的規則群組,只有第一組會生效
 * (見 isPathBlocked 的 groups.find)。真實世界的 robots.txt 極少這樣寫。
 */
function parseRobotsTxt(text) {
  // [{ agents: string[], disallow: string[], allow: string[], sawRule: boolean }]
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      // 只有「連續」的 User-agent 行才併入同一群組。中間只要出現過 Disallow/Allow 行
      // 就代表前一個群組已經結束——即使那一行的值是空的、在下方被濾掉了。
      // 用 sawRule 而不是看 disallow/allow 陣列長度,否則
      // 「User-agent: GPTBot / Disallow:(空值)」會與下一個 User-agent 合併,
      // 導致 GPTBot 被套上別人的封鎖規則。
      if (!current || current.sawRule) {
        current = { agents: [], disallow: [], allow: [], sawRule: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'disallow' && current) {
      current.sawRule = true;
      if (value) current.disallow.push(value);
    } else if (key === 'allow' && current) {
      // 空值的 Allow 在標準中沒有意義,與空值的 Disallow 一樣濾掉,兩邊行為保持對稱。
      current.sawRule = true;
      if (value) current.allow.push(value);
    }
  }

  return groups;
}

// 一段有效的百分比編碼序列(`%` 後面接兩個十六進位數字)。
const PERCENT_ESCAPE_RE = /%[0-9A-Fa-f]{2}/g;

/**
 * 把「不含任何有效百分比序列」的片段編碼。
 *
 * encodeURI 保留 robots.txt 規則需要維持語意的字元(`*` `$` `/` `?` `&` `=` `:` `@`),
 * 只編碼非 ASCII 與少數保留字元,正好符合 RFC 9309 對比對前正規化的要求。
 * 走到這裡的 `%` 一定是不構成有效序列的落單字元(例如 `100%off`),encodeURI 會把它
 * 編成 `%25`——不要自己先做一次這個替換,那會讓結果變成 `%2525`。
 */
function encodeUnescapedChunk(chunk) {
  return encodeURI(chunk);
}

/**
 * 把路徑或規則正規化成 RFC 9309 要求的百分比編碼形式,讓兩邊可以字面比對。
 *
 * 必要性:`new URL(...).pathname` 一律是編碼過的(`/%E9%97%9C%E6%96%BC`),
 * 但 robots.txt 裡的規則多半直接寫中文(`Disallow: /關於`),不正規化就永遠對不上,
 * 封鎖規則會被誤判成沒命中(假的綠燈)。
 *
 * 已編碼的部分原樣保留、只把十六進位統一成大寫,避免 `%E9` 被二次編碼成 `%25E9`;
 * 也因此不做反向解碼,`%2F` 不會被還原成路徑分隔的 `/`。
 * 代價是規則若寫成 `%2A`,會被當成字面的 `%2A` 而不是萬用字元 `*`——
 * 這與 Google 的解析器行為一致。
 */
function normalizeForMatch(value) {
  let out = '';
  let cursor = 0;
  PERCENT_ESCAPE_RE.lastIndex = 0;

  let match;
  while ((match = PERCENT_ESCAPE_RE.exec(value)) !== null) {
    out += encodeUnescapedChunk(value.slice(cursor, match.index));
    out += match[0].toUpperCase();
    cursor = match.index + match[0].length;
  }

  return out + encodeUnescapedChunk(value.slice(cursor));
}

/**
 * 把一條 robots.txt 路徑規則轉成正規表達式:`*` 是萬用字元,結尾的 `$` 是錨定,
 * 其餘字元照字面比對(比對前先做百分比編碼正規化)。
 *
 * 回傳 { regex, normalized };normalized 是正規化後的規則字面,供最長比對計算長度用
 * ——RFC 9309 比的是編碼後的長度,`/關於` 要算 9 個字元而不是 3 個。
 * 規則過長或萬用字元過多時回傳 null(呼叫端會忽略該規則)。長度與萬用字元的上限
 * 刻意檢查原始規則而非正規化後的字串,否則中文規則會因編碼後膨脹九倍而被誤丟。
 */
function compileRule(rule) {
  if (rule.length > MAX_RULE_LENGTH) return null;

  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;

  const wildcardRuns = body.match(/\*+/g);
  if (wildcardRuns && wildcardRuns.length > MAX_WILDCARDS) return null;

  const normalizedBody = normalizeForMatch(body);

  // escape 的字元集刻意不含 `*`,留給下一步轉成 `.*`;連續的 `*` 先收斂成一個,
  // 避免 `.*.*.*` 這種會放大回溯成本的形狀。
  const escaped = normalizedBody
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*+/g, '.*');

  return {
    regex: new RegExp(`^${escaped}${anchored ? '$' : ''}`),
    normalized: anchored ? `${normalizedBody}$` : normalizedBody,
  };
}

/**
 * 在一組規則中找出比對到 path 且字面最長的一條。path 必須已經正規化過。
 * 回傳 { rule, normalized, regex },沒有比對到回傳 null;rule 是規則原文,只用於 note 顯示。
 * 「最長比對勝出」是 RFC 9309 的判定方式。
 */
function findLongestMatch(rules, path) {
  let best = null;
  for (const rule of rules) {
    const compiled = compileRule(rule);
    if (!compiled || !compiled.regex.test(path)) continue;
    if (!best || compiled.normalized.length > best.normalized.length) {
      best = { rule, normalized: compiled.normalized, regex: compiled.regex };
    }
  }
  return best;
}

/**
 * 判斷指定爬蟲能否存取 path。適用群組的選法:先找指名該 UA 的群組,沒有才退回 `*` 群組。
 * 群組內以最長比對決定勝負,長度相同時 Allow 勝出(RFC 9309)。
 */
function isPathBlocked(groups, botUaLower, path) {
  const specific = groups.find((g) => g.agents.includes(botUaLower));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific || wildcard;
  if (!group) return { blocked: false, matchedGroup: null, note: null };

  const matchedGroup = specific ? botUaLower : '*';
  const disallow = findLongestMatch(group.disallow, path);
  const allow = findLongestMatch(group.allow, path);

  if (!disallow) {
    return { blocked: false, matchedGroup, note: `符合規則群組 ${matchedGroup},此路徑未被封鎖` };
  }
  if (allow && allow.normalized.length >= disallow.normalized.length) {
    return {
      blocked: false,
      matchedGroup,
      note: `群組 ${matchedGroup} 的 Allow: ${allow.rule} 覆蓋 Disallow: ${disallow.rule},此路徑未被封鎖`,
    };
  }

  // 規則若連根路徑都比對得到(例如 `/` 或 `/*`),代表封鎖範圍是整站而不只這一頁。
  const scope = disallow.regex.test('/') ? '全站' : '此路徑';
  return {
    blocked: true,
    matchedGroup,
    note: `群組 ${matchedGroup} 的 Disallow: ${disallow.rule} 封鎖${scope}`,
  };
}

/**
 * 分析 AI 爬蟲存取權限。回傳 gate 資訊(是否有主要爬蟲被封鎖)與逐一爬蟲的明細,
 * 這組結果不併入三大加權分類,而是在報告最上方獨立顯示為警示旗。
 *
 * path 是被檢測頁面的路徑(含 query),robots.txt 的比對對象就是這個字串。
 * 呼叫端不必事先處理編碼:這裡會與規則套用同一套百分比編碼正規化。
 */
function analyzeCrawlerAccess({ robotsTxt, llmsTxt, path }) {
  const robotsExists = robotsTxt.exists;
  const groups = robotsExists ? parseRobotsTxt(robotsTxt.content) : [];
  // 規則與路徑走同一個正規化函式,兩邊才會落在同一種表示法上。只正規化其中一邊
  // 仍會漏判——例如 URL 物件不編碼 `|`、`^`、`[`、`]`,而 encodeURI 會編碼它們。
  const targetPath = normalizeForMatch(path || '/');

  const botResults = TRACKED_BOTS.map(({ ua, vendor, purpose }) => {
    if (!robotsExists) {
      return { ua, vendor, purpose, blocked: false, note: '無 robots.txt,預設允許' };
    }
    const { blocked, note } = isPathBlocked(groups, ua.toLowerCase(), targetPath);
    return {
      ua,
      vendor,
      purpose,
      blocked,
      note: note || '未被任何規則指名,預設允許',
    };
  });

  const blockedBots = botResults.filter((b) => b.blocked);

  return {
    robotsTxtExists: robotsExists,
    llmsTxtExists: llmsTxt.exists,
    bots: botResults,
    gateTriggered: blockedBots.length > 0,
    blockedBots,
  };
}

// normalizeForMatch、parseRobotsTxt、isPathBlocked 都不是給其他模組使用的,
// export 出來只為了讓 test/crawler-access.test.js 直接測到它們:
// 這三支是整個 robots.txt 判定的核心,只透過 analyzeCrawlerAccess 間接測會看不出
// 是解析階段錯了還是比對階段錯了。
module.exports = {
  analyzeCrawlerAccess,
  TRACKED_BOTS,
  normalizeForMatch,
  parseRobotsTxt,
  isPathBlocked,
};
