export const SITE_ID = 'pornmd';
export const SITE_NAME = 'PornMD';
export const DEFAULT_BASE = 'https://pornmd.com';
export const PROVIDER_VERSION = '1.0.0';

/**
 * PornMD 是**跨站聚合搜索引擎**——它自己不放片源，只把各站结果汇到一起，
 * 每条给一个 `/out/?l=…` 跳转链接。
 *
 * ⚠️ 本 Provider 的定位与另外 8 个不同：它**不能自己播放**。
 * `getStream` 解析出的是**原始站点**（fapnado / xh.partners 等）的播放地址，
 * 与 PornMD 本身无关。所以这里没有 PornMD 自己的详情页，也没有它的播放器。
 *
 * 列表页 / 分类页 / 搜索页共用同一套卡片结构。
 */
export const CARD = 'div.card[data-public-id]';

export const paths = {
  search: (keyword: string) => `/search/${encodeURIComponent(keyword)}`,
  // /new 与 /rating 实测 403（疑似需登录），不作为入口暴露。见 catalog.ts。
  popular: '/popular',
};

/**
 * 从 `/out/?l=…` 解出原始站点地址。
 *
 * `l` 是 base64，解码后是**拼接的二进制**而非纯文本：
 *   <垃圾字节> + <真实 URL> + <\x00 之类分隔> + <base64(JSON 元数据)>
 * 所以不能整段当 UTF-8 读，要按字节用正则捞出连续的可打印 ASCII，
 * 它天然会在控制字符处停下。
 *
 * 实测 240 条里 230 条能解出（96%）；其余是源站自身缺片，不是解析问题。
 *
 * ⚠️ 部分源站地址带 `?pw=` 之类的**时效令牌**（如 xh.partners），过期后需重新解析，
 * 因此这些结果不缓存。
 */
export function decodeOutLink(href: string): string | null {
  const match = /[?&]l=([A-Za-z0-9+/=]+)/.exec(href);
  if (!match) return null;

  const binary = base64ToLatin1(match[1]);
  if (!binary) return null;

  // 连续可打印 ASCII = URL；遇到 \x00 等分隔符自然终止。
  const url = /https?:\/\/[!-~]+/.exec(binary)?.[0] || '';
  // 最小可用长度：排除 "https://" 这种空壳。
  return url.length > 14 ? url : null;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 → latin1 字符串（每个字符对应一个字节，保留二进制信息）。 */
function base64ToLatin1(input: string): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    if (char === '=') break;
    const index = B64_CHARS.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * PornMD 没有详情页，`Post.link` 用它自己的搜索结果锚点
 * `https://pornmd.com/out/?l=…` —— 这是唯一能定位到该条目的稳定地址。
 * 解码后的源站地址另存，供 getStream 使用。
 *
 * ⚠️ `href` 传进来时可能已是绝对地址（posts.ts 用 resolveUrl 归一化过），
 * 这里只补前缀，**不能无条件拼** DEFAULT_BASE，否则会得到
 * `https://pornmd.comhttps://pornmd.com/out/…` 这种双前缀。
 */
export function outLinkToPost(href: string): {link: string; source: string} | null {
  const source = decodeOutLink(href);
  if (!source) return null;
  const link = /^https?:\/\//i.test(href) ? href : `${DEFAULT_BASE}${href}`;
  return {link, source};
}