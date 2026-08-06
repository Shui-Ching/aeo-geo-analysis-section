'use strict';

// 涵蓋主要 AI 答案引擎的爬蟲/取用 UA。來源:各家官方文件(OpenAI、Anthropic、
// Perplexity、Google)公開列出的 user-agent 名稱。CCBot(Common Crawl)雖非
// 特定廠商的爬蟲,但因為是多數 LLM 訓練資料的主要來源之一,一併列入。
const TRACKED_BOTS = [
  { ua: 'GPTBot', vendor: 'OpenAI', purpose: '訓練/索引' },
  { ua: 'OAI-SearchBot', vendor: 'OpenAI', purpose: 'ChatGPT 搜尋引用' },
  { ua: 'ChatGPT-User', vendor: 'OpenAI', purpose: '使用者即時瀏覽' },
  { ua: 'ClaudeBot', vendor: 'Anthropic', purpose: '訓練/索引' },
  { ua: 'Claude-SearchBot', vendor: 'Anthropic', purpose: 'Claude 搜尋引用' },
  { ua: 'Claude-User', vendor: 'Anthropic', purpose: '使用者即時瀏覽' },
  { ua: 'PerplexityBot', vendor: 'Perplexity', purpose: '索引/答案引用' },
  { ua: 'Perplexity-User', vendor: 'Perplexity', purpose: '使用者即時瀏覽' },
  { ua: 'Google-Extended', vendor: 'Google', purpose: 'Gemini/AI Overviews 訓練' },
  { ua: 'CCBot', vendor: 'Common Crawl', purpose: '多數 LLM 訓練資料來源' },
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

/**
 * 把一條 robots.txt 路徑規則轉成正規表達式:`*` 是萬用字元,結尾的 `$` 是錨定,
 * 其餘字元照字面比對。規則過長或萬用字元過多時回傳 null(呼叫端會忽略該規則)。
 */
function compileRule(rule) {
  if (rule.length > MAX_RULE_LENGTH) return null;

  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;

  const wildcardRuns = body.match(/\*+/g);
  if (wildcardRuns && wildcardRuns.length > MAX_WILDCARDS) return null;

  // escape 的字元集刻意不含 `*`,留給下一步轉成 `.*`;連續的 `*` 先收斂成一個,
  // 避免 `.*.*.*` 這種會放大回溯成本的形狀。
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*+/g, '.*');

  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/**
 * 在一組規則中找出比對到 path 且字面最長的一條。回傳 { rule, regex },沒有比對到回傳 null。
 * 「最長比對勝出」是 RFC 9309 的判定方式。
 */
function findLongestMatch(rules, path) {
  let best = null;
  for (const rule of rules) {
    const regex = compileRule(rule);
    if (!regex || !regex.test(path)) continue;
    if (!best || rule.length > best.rule.length) best = { rule, regex };
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
  if (allow && allow.rule.length >= disallow.rule.length) {
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
 */
function analyzeCrawlerAccess({ robotsTxt, llmsTxt, path }) {
  const robotsExists = robotsTxt.exists;
  const groups = robotsExists ? parseRobotsTxt(robotsTxt.content) : [];
  const targetPath = path || '/';

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

module.exports = { analyzeCrawlerAccess, TRACKED_BOTS };
