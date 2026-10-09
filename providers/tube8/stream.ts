import { Stream, ProviderContext } from '../types';
import { ProviderFailure, fetchHtml, isPlayableUrl, resolveUrl } from '../shared/common';
import { parseMediaGateways, parseMediaQualities } from '../shared/mediaConfig';
import { DEFAULT_BASE, SITE_NAME } from './site';

/**
 * 详情页给出的是**网关**而不是媒体文件：
 * `page_params.video_player_setup.playervars.mediaDefinitions` 里是
 * `/media/hls/?s=令牌` 与 `/media/mp4/?s=令牌`，网关再返回清晰度 JSON 数组。
 *
 * 网关地址带 `validfrom/validto`（7200 秒），因此**不缓存**：
 * 每次播放都重新解析，拿到当次有效的签名地址。
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
  const { axios, cheerio, commonHeaders } = providerContext;
  const url = isPlayableUrl(link) ? link : `${DEFAULT_BASE}${link.startsWith('/') ? '' : '/'}${link}`;

  const html = await fetchHtml(
    'tube8',
    'getStream',
    url,
    async () => {
      const response = await axios.get(url, { headers: commonHeaders, signal, timeout: 15000 });
      return { data: response.data as string, status: response.status };
    },
    signal,
  );

  const $ = cheerio.load(html);
  const scripts = $('script')
    .toArray()
    .map(node => $(node).html() || '')
    .join('\n')
    .replace(/\\\//g, '/');

  const gateways = parseMediaGateways(scripts)
    .map(gateway => ({ ...gateway, url: resolveUrl(url, gateway.url) }))
    .filter(gateway => isPlayableUrl(gateway.url));

  if (!gateways.length) {
    throw new ProviderFailure(
      'unavailable',
      'tube8 getStream: player config missing media gateway (content removed or page changed)',
    );
  }

  const streams: Stream[] = [];
  const seen = new Set<string>();

  for (const gateway of gateways) {
    const isHls = gateway.format.toLowerCase() === 'hls';
    let body: unknown;
    try {
      // 网关给的是带时效签名的地址，不能落在任何缓存里。
      const response = await axios.get(gateway.url, {
        headers: commonHeaders,
        signal,
        timeout: 15000,
      });
      body = response.data;
    } catch {
      continue; // 单个网关失败不影响其他网关
    }

    // 网关返回的是 JSON（axios 会自动解析成对象/数组），
    // 也可能因 Content-Type 不标准而保持字符串，两种都要能吃下。
    const blob = typeof body === 'string' ? body : JSON.stringify(body);

    const variants = parseMediaQualities(blob)
      .filter(item => isPlayableUrl(item.url))
      .sort((a, b) => b.quality - a.quality)
      .slice(0, 2);

    for (const variant of variants) {
      // 同一画质可能出现在多个网关里（hls/mp4 各一），按 地址+画质 去重，
      // 否则播放器里会出现两条同名不同格式的源。
      const key = `${isHls ? 'hls' : 'mp4'}:${variant.quality}:${variant.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      streams.push({
        server: SITE_NAME,
        link: variant.url,
        type: isHls ? 'm3u8' : 'mp4',
        quality: String(variant.quality),
        tag: `${isHls ? 'HLS' : 'MP4'} ${variant.quality}P`,
      });
    }

    // 网关直接返回 m3u8 的情况（没有清晰度数组）。
    if (!variants.length && isHls && gateway.url.includes('.m3u8') && !seen.has(gateway.url)) {
      seen.add(gateway.url);
      streams.push({
        server: SITE_NAME,
        link: gateway.url,
        type: 'm3u8',
        tag: 'HLS',
      });
    }
  }

  if (!streams.length) {
    throw new ProviderFailure(
      'unavailable',
      'tube8 getStream: media gateway returned no playable URL',
    );
  }

  // Vega 用数组第 1 项做快速下载、默认起播：HLS 优先（自适应码率更稳），
  // 同格式内画质从高到低。
  const typeRank = (type: string) => (type === 'm3u8' ? 0 : 1);
  streams.sort((a, b) => {
    const byType = typeRank(a.type) - typeRank(b.type);
    if (byType !== 0) return byType;
    return (Number(b.quality) || 0) - (Number(a.quality) || 0);
  });

  return streams;
};