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

/**
 * 極簡 robots.txt 解析器:依 User-agent 分組,記錄各群組的 Disallow 規則。
 * 只處理路徑前綴比對這種常見情況,不支援萬用字元或 $ 結尾錨定等進階語法。
 */
function parseRobotsTxt(text) {
  const groups = []; // [{ agents: string[], disallow: string[], allow: string[] }]
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'disallow' && current) {
      if (value) current.disallow.push(value);
    } else if (key === 'allow' && current) {
      current.allow.push(value);
    }
  }

  return groups;
}

function isPathBlocked(groups, botUaLower) {
  const specific = groups.find((g) => g.agents.includes(botUaLower));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific || wildcard;
  if (!group) return { blocked: false, matchedGroup: null };

  // 只要規則中出現「Disallow: /」或「Disallow:」空路徑(等同全站),就視為封鎖整站。
  const blocksRoot = group.disallow.some((p) => p === '/' || p === '');
  return { blocked: blocksRoot, matchedGroup: specific ? botUaLower : '*' };
}

/**
 * 分析 AI 爬蟲存取權限。回傳 gate 資訊(是否有主要爬蟲被封鎖)與逐一爬蟲的明細,
 * 這組結果不併入三大加權分類,而是在報告最上方獨立顯示為警示旗。
 */
function analyzeCrawlerAccess({ robotsTxt, llmsTxt }) {
  const robotsExists = robotsTxt.exists;
  const groups = robotsExists ? parseRobotsTxt(robotsTxt.content) : [];

  const botResults = TRACKED_BOTS.map(({ ua, vendor, purpose }) => {
    if (!robotsExists) {
      return { ua, vendor, purpose, blocked: false, note: '無 robots.txt,預設允許' };
    }
    const { blocked, matchedGroup } = isPathBlocked(groups, ua.toLowerCase());
    return {
      ua,
      vendor,
      purpose,
      blocked,
      note: matchedGroup ? `符合規則群組: ${matchedGroup}` : '未被任何規則指名,預設允許',
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
