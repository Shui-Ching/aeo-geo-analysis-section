'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeForMatch,
  parseRobotsTxt,
  isPathBlocked,
  analyzeCrawlerAccess,
  TRACKED_BOTS,
} = require('../lib/analyzers/crawler-access');

// ---------------------------------------------------------------------------
// normalizeForMatch：規則與路徑的百分比編碼正規化(RFC 9309)
// ---------------------------------------------------------------------------

test('normalizeForMatch：非 ASCII 字元編碼成 URL 物件會產生的形式', () => {
  // 這是整個正規化存在的理由:robots.txt 寫 `/關於`，
  // 但 new URL('/關於', base).pathname 是 `/%E9%97%9C%E6%96%BC`，不轉就永遠對不上。
  assert.equal(normalizeForMatch('/關於'), '/%E9%97%9C%E6%96%BC');
  assert.equal(
    normalizeForMatch('/關於'),
    new URL('/關於', 'https://example.com').pathname,
    '規則正規化後必須與 URL 物件的輸出完全一致'
  );
  assert.equal(normalizeForMatch('/🎉'), '/%F0%9F%8E%89', '四位元組 UTF-8 也要正確編碼');
});

test('normalizeForMatch：已編碼的片段原樣保留，不做二次編碼', () => {
  assert.equal(normalizeForMatch('/%E9%97%9C%E6%96%BC'), '/%E9%97%9C%E6%96%BC');
  assert.notEqual(normalizeForMatch('/%E9'), '/%25E9', '%E9 不可被編碼成 %25E9');
});

test('normalizeForMatch：十六進位統一成大寫', () => {
  assert.equal(normalizeForMatch('/%e9%97%9c'), '/%E9%97%9C');
});

test('normalizeForMatch：不做反向解碼，%2F 不還原成路徑分隔的 /', () => {
  // 還原的話 `/a%2Fb` 會變成 `/a/b`，封鎖範圍被放大到整個 a 目錄。
  assert.equal(normalizeForMatch('/a%2Fb'), '/a%2Fb');
});

test('normalizeForMatch：落單的 % 編碼成 %25，且不重複編碼成 %2525', () => {
  // encodeURI 自己就會把 `%` 編成 `%25`，若在丟進去之前又手動替換一次就會變成 %2525。
  // 這個錯誤在整合測試看不出來——規則與路徑套的是同一個函式，會一起錯、一起對得上。
  assert.equal(normalizeForMatch('/100%off'), '/100%25off');
  assert.equal(normalizeForMatch('/%'), '/%25');
  assert.equal(normalizeForMatch('/%zz'), '/%25zz', '%zz 不是有效序列，視為落單的 %');
  assert.equal(normalizeForMatch('/%E9%'), '/%E9%25', '有效序列後面接落單的 %');
});

test('normalizeForMatch：落單的 % 與已編碼的 %25 正規化後一致', () => {
  // 這是上一條錯誤真正會造成的傷害:規則寫成正確編碼的 `/100%25off`，
  // 路徑是 `/100%off`，兩者必須落在同一個字串上，否則規則整條漏判。
  assert.equal(normalizeForMatch('/100%off'), normalizeForMatch('/100%25off'));
});

test('normalizeForMatch：保留 robots.txt 的語意字元與 query 分隔符', () => {
  assert.equal(normalizeForMatch('/*/private$'), '/*/private$');
  assert.equal(normalizeForMatch('/search?q=1&sort=asc'), '/search?q=1&sort=asc');
});

test('normalizeForMatch：URL 物件不編碼、encodeURI 會編碼的字元，兩邊都被統一', () => {
  // 這一組是「只正規化規則那一側」會壞掉的案例:路徑保持 `[`，規則變成 `%5B`。
  assert.equal(normalizeForMatch('/a[1]'), '/a%5B1%5D');
  assert.equal(normalizeForMatch('/a^b|c'), '/a%5Eb%7Cc');
  assert.equal(normalizeForMatch('/my page'), '/my%20page');
});

// ---------------------------------------------------------------------------
// parseRobotsTxt：分組解析
// ---------------------------------------------------------------------------

test('parseRobotsTxt：基本分組，agent 名稱轉小寫', () => {
  const groups = parseRobotsTxt('User-agent: GPTBot\nDisallow: /admin\nAllow: /admin/public');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].agents, ['gptbot']);
  assert.deepEqual(groups[0].disallow, ['/admin']);
  assert.deepEqual(groups[0].allow, ['/admin/public']);
});

test('parseRobotsTxt：連續的 User-agent 共用同一組規則', () => {
  const groups = parseRobotsTxt('User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /x');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].agents, ['gptbot', 'ccbot']);
});

test('parseRobotsTxt：空值 Disallow 之後的 User-agent 另開新群組', () => {
  // 迴歸測試。原本用「disallow 陣列是否為空」判斷群組結束，
  // 會把下面這份 robots.txt 併成一組，導致 GPTBot 被套上 CCBot 的全站封鎖。
  const groups = parseRobotsTxt(
    'User-agent: GPTBot\nDisallow:\nUser-agent: CCBot\nDisallow: /'
  );
  assert.equal(groups.length, 2, '空值規則也代表群組已結束');
  assert.deepEqual(groups[0].agents, ['gptbot']);
  assert.deepEqual(groups[0].disallow, [], '空值 Disallow 不進規則陣列');
  assert.deepEqual(groups[1].agents, ['ccbot']);
  assert.deepEqual(groups[1].disallow, ['/']);
});

test('parseRobotsTxt：井字號之後的內容視為註解', () => {
  const groups = parseRobotsTxt('# 整行註解\nUser-agent: *  # 行尾註解\nDisallow: /a # 說明');
  assert.deepEqual(groups[0].agents, ['*']);
  assert.deepEqual(groups[0].disallow, ['/a']);
});

test('parseRobotsTxt：欄位名稱大小寫不敏感、值前後空白去掉', () => {
  const groups = parseRobotsTxt('USER-AGENT:   GPTBot   \nDISALLOW:   /a   ');
  assert.deepEqual(groups[0].agents, ['gptbot']);
  assert.deepEqual(groups[0].disallow, ['/a']);
});

test('parseRobotsTxt：值裡面的冒號保留(例如 Sitemap 網址)', () => {
  // split(':') 之後要把 rest 用冒號接回去，否則 `https://…` 會被截成 `https`。
  const groups = parseRobotsTxt('User-agent: *\nDisallow: /a:b/c');
  assert.deepEqual(groups[0].disallow, ['/a:b/c']);
});

test('parseRobotsTxt：沒有 User-agent 就出現的規則被忽略，不會建出無主群組', () => {
  const groups = parseRobotsTxt('Disallow: /a\nUser-agent: *\nDisallow: /b');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].disallow, ['/b']);
});

test('parseRobotsTxt：CRLF 換行與空行不影響解析', () => {
  const groups = parseRobotsTxt('User-agent: *\r\n\r\nDisallow: /a\r\n');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].disallow, ['/a']);
});

test('parseRobotsTxt：無法解析的行(沒有冒號)直接跳過', () => {
  const groups = parseRobotsTxt('User-agent: *\n這是一行垃圾\nDisallow: /a');
  assert.deepEqual(groups[0].disallow, ['/a']);
});

// ---------------------------------------------------------------------------
// isPathBlocked：群組選擇與最長比對
// ---------------------------------------------------------------------------

/** 直接從 robots.txt 文字判斷某個 UA 對某路徑的結果，省去每次手寫 groups。 */
function blockedFor(robotsText, ua, path) {
  return isPathBlocked(parseRobotsTxt(robotsText), ua.toLowerCase(), normalizeForMatch(path));
}

test('isPathBlocked：沒有任何適用群組時不封鎖', () => {
  const result = blockedFor('User-agent: SomeOtherBot\nDisallow: /', 'GPTBot', '/');
  assert.equal(result.blocked, false);
  assert.equal(result.matchedGroup, null);
});

test('isPathBlocked：指名該 UA 的群組優先於萬用群組', () => {
  const robots = 'User-agent: *\nDisallow: /\nUser-agent: GPTBot\nDisallow:';
  assert.equal(blockedFor(robots, 'GPTBot', '/any').blocked, false, 'GPTBot 走自己的群組');
  assert.equal(blockedFor(robots, 'CCBot', '/any').blocked, true, 'CCBot 沒有指名群組，退回 *');
  assert.equal(blockedFor(robots, 'GPTBot', '/any').matchedGroup, 'gptbot');
  assert.equal(blockedFor(robots, 'CCBot', '/any').matchedGroup, '*');
});

test('isPathBlocked：前綴比對，子路徑一併封鎖', () => {
  assert.equal(blockedFor('User-agent: *\nDisallow: /admin', '*', '/admin/users').blocked, true);
  assert.equal(blockedFor('User-agent: *\nDisallow: /admin', '*', '/administrator').blocked, true);
  assert.equal(blockedFor('User-agent: *\nDisallow: /admin', '*', '/public').blocked, false);
});

test('isPathBlocked：* 是萬用字元，$ 是結尾錨定', () => {
  assert.equal(blockedFor('User-agent: *\nDisallow: /*/secret', '*', '/a/secret').blocked, true);
  assert.equal(blockedFor('User-agent: *\nDisallow: /*.pdf$', '*', '/doc/a.pdf').blocked, true);
  assert.equal(
    blockedFor('User-agent: *\nDisallow: /*.pdf$', '*', '/doc/a.pdf?v=1').blocked,
    false,
    '$ 錨定後面不能再有字元'
  );
});

test('isPathBlocked：Disallow: /* 等同全站封鎖', () => {
  // 純前綴比對會漏判這種常見寫法(`/*` 不是 `/anything` 的前綴)。
  assert.equal(blockedFor('User-agent: *\nDisallow: /*', '*', '/anything').blocked, true);
});

test('isPathBlocked：最長比對勝出，長度相同時 Allow 勝出', () => {
  const longerAllow = 'User-agent: *\nDisallow: /a\nAllow: /a/b';
  assert.equal(blockedFor(longerAllow, '*', '/a/b').blocked, false);
  assert.equal(blockedFor(longerAllow, '*', '/a/c').blocked, true, 'Allow 較長但沒命中此路徑');

  const longerDisallow = 'User-agent: *\nAllow: /a\nDisallow: /a/b';
  assert.equal(blockedFor(longerDisallow, '*', '/a/b').blocked, true);

  const tie = 'User-agent: *\nDisallow: /a\nAllow: /a';
  assert.equal(blockedFor(tie, '*', '/a').blocked, false, '長度相同時 Allow 勝出(RFC 9309)');
});

test('isPathBlocked：最長比對用編碼後的長度計算', () => {
  // `/關` 編碼後是 9 個字元、`/` 是 1 個。若用原始字面長度會誤判成 `/` 較短的那一邊贏。
  const robots = 'User-agent: *\nAllow: /\nDisallow: /關於';
  assert.equal(blockedFor(robots, '*', '/關於').blocked, true);
});

test('isPathBlocked：note 說明封鎖範圍是全站還是單一路徑', () => {
  assert.match(blockedFor('User-agent: *\nDisallow: /', '*', '/a').note, /全站/);
  assert.match(blockedFor('User-agent: *\nDisallow: /a', '*', '/a').note, /此路徑/);
  assert.match(
    blockedFor('User-agent: *\nDisallow: /a\nAllow: /a/b', '*', '/a/b').note,
    /Allow: \/a\/b/,
    'Allow 覆蓋時要講明是哪一條規則覆蓋的'
  );
});

test('isPathBlocked：note 顯示規則原文而非編碼後字串', () => {
  const note = blockedFor('User-agent: *\nDisallow: /關於', '*', '/關於').note;
  assert.match(note, /\/關於/);
  assert.doesNotMatch(note, /%E9/, '使用者不該讀到 Disallow: /%E9%97%9C%E6%96%BC');
});

test('isPathBlocked：萬用字元過多的規則被忽略，且比對長路徑不會卡住', () => {
  // robots.txt 來自不可信主機，`/*a*a*a…` 會編譯成 `.*a.*a.*a…`，
  // 對長路徑做比對可能引發指數級回溯，把 event loop 卡死。
  const evil = `User-agent: *\nDisallow: /${'*a'.repeat(30)}`;
  const path = `/${'a'.repeat(3000)}b`;
  const start = Date.now();
  const result = blockedFor(evil, '*', path);
  assert.equal(result.blocked, false, '超過萬用字元上限的規則應被忽略');
  assert.ok(Date.now() - start < 100, '比對必須在 100ms 內結束');
});

test('isPathBlocked：長度與萬用字元上限檢查原始規則，中文規則不因編碼膨脹被誤丟', () => {
  // 60 個中文字 = 原始 60 字元、編碼後 540 字元。上限是 500，
  // 若拿編碼後的長度去比就會把這條合法規則丟掉。
  const longChinese = '關'.repeat(60);
  const robots = `User-agent: *\nDisallow: /${longChinese}`;
  assert.equal(blockedFor(robots, '*', `/${longChinese}`).blocked, true);
});

// ---------------------------------------------------------------------------
// analyzeCrawlerAccess：對外的整合結果
// ---------------------------------------------------------------------------

test('analyzeCrawlerAccess：沒有 robots.txt 時全部視為允許', () => {
  const result = analyzeCrawlerAccess({
    robotsTxt: { exists: false, content: null },
    llmsTxt: { exists: false },
    path: '/any',
  });
  assert.equal(result.robotsTxtExists, false);
  assert.equal(result.gateTriggered, false);
  assert.equal(result.blockedBots.length, 0);
  assert.ok(result.bots.every((b) => b.blocked === false));
  assert.equal(result.bots[0].note, '無 robots.txt,預設允許');
});

test('analyzeCrawlerAccess：有爬蟲被封鎖時觸發 gate', () => {
  const result = analyzeCrawlerAccess({
    robotsTxt: { exists: true, content: 'User-agent: GPTBot\nDisallow: /' },
    llmsTxt: { exists: true },
    path: '/',
  });
  assert.equal(result.gateTriggered, true);
  assert.equal(result.llmsTxtExists, true);
  assert.deepEqual(
    result.blockedBots.map((b) => b.ua),
    ['GPTBot'],
    '只有被指名的 GPTBot 該被列為封鎖'
  );
});

test('analyzeCrawlerAccess：path 省略時以根路徑比對', () => {
  const result = analyzeCrawlerAccess({
    robotsTxt: { exists: true, content: 'User-agent: *\nDisallow: /' },
    llmsTxt: { exists: false },
    path: undefined,
  });
  assert.equal(result.gateTriggered, true);
});

// ---------------------------------------------------------------------------
// TRACKED_BOTS：名單本身的完整性
// ---------------------------------------------------------------------------

test('TRACKED_BOTS：每支爬蟲只出現一次,且欄位都有填', () => {
  const uas = TRACKED_BOTS.map((b) => b.ua.toLowerCase());
  assert.equal(new Set(uas).size, uas.length, 'ua 重複會讓報告出現兩列一模一樣的結果');
  assert.ok(TRACKED_BOTS.every((b) => b.ua && b.vendor && b.purpose));
});

test('TRACKED_BOTS：涵蓋原本漏掉的廠商與取用型爬蟲', () => {
  // 這些是 2026-08-06 補進來的。少一支就等於站方封鎖了它、報告卻完全不提(假陰性)。
  const uas = TRACKED_BOTS.map((b) => b.ua);
  for (const ua of [
    'Applebot-Extended',
    'meta-externalagent',
    'meta-webindexer',
    'meta-externalfetcher',
    'Amazonbot',
    'Bytespider',
    'cohere-ai',
    'Diffbot',
  ]) {
    assert.ok(uas.includes(ua), `TRACKED_BOTS 應包含 ${ua}`);
  }
});

test('analyzeCrawlerAccess：新增爬蟲的規則大小寫不影響比對', () => {
  // robots.txt 實務上寫成 `Meta-ExternalAgent`、`Applebot-Extended`、`Cohere-AI`，
  // 與 TRACKED_BOTS 裡的字面不同。兩邊都轉小寫才對得上,這條鎖住那個行為。
  // 下面的 deepEqual 順帶鎖住「agent 是完整比對而非前綴比對」:Meta 三支 UA 共用
  // `meta-external` 前綴，只指名 meta-externalagent 時不該連 meta-externalfetcher 一起判封鎖。
  const result = analyzeCrawlerAccess({
    robotsTxt: {
      exists: true,
      content: [
        'User-agent: Meta-ExternalAgent',
        'User-agent: Applebot-Extended',
        'User-agent: Cohere-AI',
        'User-agent: BYTESPIDER',
        'Disallow: /',
      ].join('\n'),
    },
    llmsTxt: { exists: false },
    path: '/any',
  });

  assert.deepEqual(
    result.blockedBots.map((b) => b.ua).sort(),
    ['Applebot-Extended', 'Bytespider', 'cohere-ai', 'meta-externalagent'],
    '這四支被指名封鎖，其餘不受影響'
  );
});

test('analyzeCrawlerAccess：呼叫端傳未編碼的中文路徑也能正確比對', () => {
  // analyze.js 傳的是 URL 物件的 pathname(已編碼)，但這裡對兩種輸入都要成立。
  const robotsTxt = { exists: true, content: 'User-agent: *\nDisallow: /關於' };
  const encoded = new URL('/關於', 'https://example.com').pathname;

  for (const path of ['/關於', encoded]) {
    const result = analyzeCrawlerAccess({ robotsTxt, llmsTxt: { exists: false }, path });
    assert.equal(result.gateTriggered, true, `path=${path} 應判定為封鎖`);
  }
});
