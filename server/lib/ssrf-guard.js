'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

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
  { base: '192.168.0.0', bits: 16 },
  { base: '198.18.0.0', bits: 15 },
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
 * 回傳解析後的 IP,呼叫端應使用該 IP 建立連線(避免 DNS rebinding)。
 */
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL 格式無效');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('僅支援 http 或 https 協定');
  }

  const hostname = url.hostname;
  if (hostname === 'localhost') {
    throw new Error('不允許存取 localhost');
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
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

  return { url, resolvedIp: addresses[0].address };
}

module.exports = { assertSafeUrl, isBlockedIp };
