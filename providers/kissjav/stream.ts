import {Stream, ProviderContext} from '../types';
import {ProviderFailure, decodeBase64Utf8, fetchHtml, isPlayableUrl} from '../shared/common';
import {BITS_PLACEHOLDER, FLASHVARS, SITE_NAME, videoUrlFromRef} from './site';

/**
 * 播放地址在 `flashvars` 对象字面量里，值是 **base64**。
 * 解码后形如 `https://kissjav.li/get_file/.../<id>.mp4/?br=<bitrate>`。
 *
 * 本站不需要二次请求，也没有时效签名，所以解析完即可用。
 */
export const getStream = async function ({
  link,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal?: AbortSignal;
  providerContext: ProviderContext;
  isDownload?: boolean;
}): Promise<Stream[]> {
  const {axios, cheerio, commonHeaders} = providerContext;
  const url = videoUrlFromRef(link);

  const html = await fetchHtml(
    'kissjav',
    'getStream',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
    signal,
  );

  const $ = cheerio.load(html);
  // script 内容必须用 .html()；text() 会跳过 script 标签。
  const scripts = $('script')
    .toArray()
    .map(node => $(node).html() || '')
    .join('\n')
    .replace(/\\\//g, '/');

  const streams: Stream[] = [];
  const seen = new Set<string>();

  const candidates: {encoded: string | undefined; label: string; fallback: string}[] = [
    // 高清优先（Vega 用第 1 项做快速下载与默认起播）。
    {encoded: FLASHVARS.videoUrlHd.exec(scripts)?.[1], label: 'MP4 高清', fallback: '720'},
    {encoded: FLASHVARS.videoUrl.exec(scripts)?.[1], label: 'MP4 标清', fallback: '360'},
  ];

  for (const candidate of candidates) {
    const encoded = (candidate.encoded || '').trim();
    // `MQ==` 是 base64 的 "1"，表示「没有这一档」，不是地址。
    if (!encoded || encoded === BITS_PLACEHOLDER) continue;

    const decoded = decodeBase64Utf8(encoded);
    if (!isPlayableUrl(decoded)) continue;
    // 未登录的访客拿到的是占位地址，登录态才给真实文件。
    // 注意真实形态是 `…/853691.mp4/?br=675`——扩展名与 `?` 之间还有一个 `/`，
    // 只按 `\.(mp4)(\?|$)` 匹配会把它整条丢掉。
    if (!/\.(mp4|m3u8)\/?(\?|$)/i.test(decoded)) continue;
    if (seen.has(decoded)) continue;
    seen.add(decoded);

    streams.push({
      server: SITE_NAME,
      link: decoded,
      type: /\.m3u8\/?(\?|$)/i.test(decoded) ? 'm3u8' : 'mp4',
      // 真实画质写在 `?br=` 上，用它而不是写死的标签。
      quality: /[?&]br=(\d+)/i.exec(decoded)?.[1] || candidate.fallback,
      tag: candidate.label,
    });
  }

  if (!streams.length) {
    throw new ProviderFailure(
      'unavailable',
      'kissjav getStream: no playable URL found (content removed, or login required)',
    );
  }

  return streams;
};