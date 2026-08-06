'use strict';

// 兩種 API 都要:assertSafeUrl 用 promises 版做預檢,safeLookup 必須是 net/tls
// 要求的 callback 形式。dns.lookup 以屬性存取的方式呼叫,測試才有辦法替換它。
const dns = require('node:dns');
const net = require('node:net');

const { publicError } = require('./public-error');

// 私有／保留位址範圍:任何解析結果落在這些範圍內一律拒絕抓取,防止 SSRF
// (打內網服務、雲端 metadata endpoint 等)
const BLOCKED_IPV4_RANGES = [
  { base: '0.0.0.0', bits: 8 },
  { base: '10.0.0.0', bits: 8 },
  { base: '100.64.0.0', bits: 10 },
  { base: '127.0.0.0', bits: 8 },
  { base: '169.254.0.0', bits: 16 },
  { base: '172.16.0.0', bits: 12 },
  { base: '192.0.0.0', bits: 24 },
  { base: '192.88.99.0', bits: 24 }, // 已淘汰的 6to4 relay anycast
  { base: '192.168.0.0', bits: 16 },
  { base: '198.18.0.0', bits: 15 },
  { base: '224.0.0.0', bits: 4 }, // multicast
  { base: '240.0.0.0', bits: 4 }, // 保留段,涵蓋廣播位址 255.255.255.255
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedIpv4(ip) {
  const target = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(({ base, bits }) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) return isBlockedIpv4(mapped);
  }
  return false;
}

function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // 無法辨識的格式一律視為不安全
}

/**
 * 驗證 URL 是否可安全抓取:限定 http/https、解析主機名並拒絕私有/保留 IP。
 * 通過檢查不回傳值,只在不安全時拋錯。
 *
 * 這是「預檢」,不是最終防線 —— 這裡解析出來的 IP 沒有交給後續的連線使用,
 * 建立連線時會再解析一次 DNS,兩次之間存在 TOCTOU 空窗。真正的把關在 safeLookup:
 * 它就是連線當下實際採用的解析結果,不會再有第二次解析。
 * 預檢的價值只有兩個:在還沒開連線前就擋掉明顯不合法的輸入,以及給出中文錯誤訊息
 * (連線層拋出的錯誤會被包成「抓取失敗: ...」)。
 * 不要把 assertSafeUrl 單獨用在任何會發出連線的路徑上。
 *
 * 錯誤分兩種:只描述輸入字串的用 publicError(可原封不動顯示給使用者),
 * 描述 DNS 或網段判定結果的用一般 Error(措辭差異會洩漏內網資訊,呼叫端會收斂掉)。
 * 詳細的分界理由見 public-error.js。
 */
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw publicError('URL 格式無效');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw publicError('僅支援 http 或 https 協定');
  }

  const hostname = url.hostname;
  if (hostname === 'localhost') {
    // localhost 是每一台機器都成立的常數,講出來不會透露這台伺服器的網路環境
    throw publicError('不允許存取 localhost');
  }

  let addresses;
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('無法解析網域名稱');
  }

  if (addresses.length === 0) {
    throw new Error('網域名稱沒有可用的 IP');
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new Error('目標位址位於私有或保留網段,禁止抓取');
    }
  }
}

/**
 * 交給 net.connect / tls.connect 的 lookup 選項使用(fetch-page.js 的 undici Agent)。
 * 這是 SSRF 的最終防線,因為回傳的位址就是 socket 實際連過去的位址,
 * 中間不會再解析一次 DNS,所以沒有 DNS rebinding 的空窗可鑽。
 * hostname 仍然由 undici 用來組 Host header 與 TLS SNI,只有「連到哪個 IP」被接管。
 *
 * 只要有任何一個解析結果落在封鎖網段就整個拒絕,不是把它濾掉留下其餘位址:
 * Node 的 autoSelectFamily 會同時／輪流嘗試多個位址,濾掉不安全的那個並不保險,
 * 而且一個網域同時回公開 IP 與內網 IP 本身就是攻擊特徵。
 *
 * @param {string} hostname
 * @param {object} options net/tls 傳進來的選項(family、hints、all)
 * @param {(err: Error|null, address?: string|object[], family?: number) => void} callback
 */
function safeLookup(hostname, options, callback) {
  // 一律用 all:true 解析,才看得到全部位址;呼叫端要的形狀最後再轉回去
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.length === 0) {
      return callback(new Error('網域名稱沒有可用的 IP'));
    }

    for (const { address } of addresses) {
      if (isBlockedIp(address)) {
        return callback(new Error('目標位址位於私有或保留網段,禁止抓取'));
      }
    }

    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

module.exports = { assertSafeUrl, isBlockedIp, safeLookup };
