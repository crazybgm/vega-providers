import {Stream, ProviderContext} from '../types';
import {ProviderFailure, fetchHtml, isPlayableUrl, resolveUrl} from '../shared/common';
import {EMBED_BASE, SITE_NAME, videoUrlFromRef} from './site';
import {unpackAll} from './jsPacker';

/**
 * 流程：详情页 → recordplay.biz 的 `/e/{hash}` embed 页 → 还原压缩包 → 取 links。
 *
 * ⚠️ 本次实测中最关键的坑：**HLS 必须按编号从大到小排，绝不能按扩展名挑**。
 * 站点把可用的 hls3 排在前面本身就是容灾顺序；按「优先 .m3u8」去挑会选中
 * hls2，而它在真实网络下直接 403 Forbidden（nginx）。
 * 另外 `.txt` 扩展名完全没问题 —— CDN 返回
 * `Content-Type: application/vnd.apple.mpegurl`，播放器按 type 而非扩展名建源。
 *
 * ⚠️ 本站**只有 HLS 多清晰度清单，没有整文件 MP4** → 不暴露下载能力。
 * ⚠️ embed 地址带时效签名（`e=129600`），过期必须重走「详情 → embed」，
 * 不能重放缓存下来的 URL。
 */

function extractEmbedSrc(html: string, cheerio: ProviderContext['cheerio'], base: string): string {
  const $ = cheerio.load(html);
  const src =
    $('meta[itemprop="embedUrl"]').attr('content') ||
    $('div.responsive-player iframe[src]').first().attr('src') ||
    $('iframe[src]')
      .toArray()
      .map(node => $(node).attr('src') || '')
      .find(item => item.includes('recordplay.biz')) ||
    '';
  return src ? resolveUrl(base, src) : '';
}

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

  // Vega 会把 getMeta 里 directLinks 的地址再传回本函数，
  // 而那里放的是 **embed 地址**（因为详情页本身没有 <video>）。
  // 所以这里两种入口都要认：embed 地址直接用，详情地址才去取 embed。
  const isEmbed = /recordplay\.biz/i.test(link);
  const detailUrl = isEmbed ? '' : videoUrlFromRef(link);

  let embedUrl = '';
  if (isEmbed) {
    embedUrl = link;
  } else {
    const detailHtml = await fetchHtml(
      'sexbjcam',
      'getStream',
      detailUrl,
      async () => {
        const response = await axios.get(detailUrl, {headers: commonHeaders, signal, timeout: 20000});
        return {data: response.data as string, status: response.status};
      },
      signal,
    );
    embedUrl = extractEmbedSrc(detailHtml, cheerio, detailUrl);
  }

  if (!embedUrl) {
    throw new ProviderFailure(
      'unavailable',
      'sexbjcam getStream: detail page has no recordplay embed entry',
    );
  }

  const embedHtml = await fetchHtml(
    'sexbjcam',
    'getStream',
    embedUrl,
    async () => {
      const response = await axios.get(embedUrl, {headers: commonHeaders, signal, timeout: 20000});
      return {data: response.data as string, status: response.status};
    },
    signal,
  );

  // 还原压缩包（纯字符串替换，不 eval）。
  const unpacked = unpackAll(embedHtml);
  const source = unpacked || embedHtml;

  // 取 links={...} 里的 hlsN: URL。
  const block = /links\s*=\s*\{([\s\S]*?)\}/.exec(source)?.[1] || source;
  const entries: {index: number; url: string}[] = [];
  const pattern = /["']?(hls\d+)["']?\s*:\s*["']([^"']+)["']/g;
  let match = pattern.exec(block);
  while (match !== null) {
    const index = Number.parseInt(match[1].replace(/\D/g, ''), 10) || 0;
    const url = resolveUrl(embedUrl, match[2]);
    if (isPlayableUrl(url)) entries.push({index, url});
    match = pattern.exec(block);
  }

  if (!entries.length) {
    throw new ProviderFailure(
      'unavailable',
      'sexbjcam getStream: embed page contained no playable HLS URL',
    );
  }

  // ⚠️ 编号从大到小：hls3 是可用的，hls2 会 403。
  entries.sort((a, b) => b.index - a.index);

  const seen = new Set<string>();
  const streams: Stream[] = [];
  for (const entry of entries.slice(0, 3)) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    streams.push({
      server: SITE_NAME,
      link: entry.url,
      type: 'm3u8',
      quality: 'auto',
      tag: `HLS ${entry.index}`,
    });
  }

  return streams;
};