import {ProviderContext, Stream} from '../../types';
import {ProviderFailure, isPlayableUrl, resolveUrl} from './common';
import {parseMediaGateways, parseMediaQualities} from './mediaConfig';

/**
 * Aylo 系站点（RedTube / YouPorn / Tube8）共用的播放源解析。
 *
 * 站点页内给的是**网关** `/media/hls/?s=令牌` 与 `/media/mp4/?s=令牌`，
 * 必须二次请求才能拿到清晰度数组。
 *
 * 两条不能省的规则：
 * 1. **MP4 直链必须带 `Referer=详情页`**，否则站点回 410 Gone；HLS 不要求。
 *    Vega 的 Stream.headers 会带上这个头。
 * 2. 网关地址带 `validfrom/validto`（实测 7200 秒），所以**不缓存**，
 *    每次播放重新解析；重放同一个 URL 等于没修。
 */
export async function resolveAyloStreams(options: {
  siteName: string;
  detailUrl: string;
  scripts: string;
  providerContext: ProviderContext;
  signal?: AbortSignal;
  maxPerFormat?: number;
}): Promise<Stream[]> {
  const {
    siteName,
    detailUrl,
    scripts,
    providerContext,
    signal,
    maxPerFormat = 2,
  } = options;
  const {axios, commonHeaders} = providerContext;

  const gateways = parseMediaGateways(scripts)
    .map(gateway => ({...gateway, url: resolveUrl(detailUrl, gateway.url)}))
    .filter(gateway => isPlayableUrl(gateway.url));

  if (!gateways.length) {
    throw new ProviderFailure(
      'unavailable',
      `${siteName}: player config missing media gateway (content removed or page changed)`,
    );
  }

  const streams: Stream[] = [];
  const seen = new Set<string>();

  for (const gateway of gateways) {
    const isHls = gateway.format.toLowerCase() === 'hls';
    const mediaType = isHls ? 'm3u8' : 'mp4';

    let body: unknown;
    try {
      const response = await axios.get(gateway.url, {
        headers: commonHeaders,
        signal,
        timeout: 15000,
      });
      body = response.data;
    } catch {
      continue; // 单个网关失败不影响其他网关
    }

    // 网关返回 JSON（axios 会解析成对象/数组），也可能因 Content-Type
    // 不标准而保持字符串，两种都要能吃下。
    const blob = typeof body === 'string' ? body : JSON.stringify(body);

    const variants = parseMediaQualities(blob)
      .filter(item => isPlayableUrl(item.url))
      .sort((a, b) => b.quality - a.quality)
      .slice(0, maxPerFormat);

    for (const variant of variants) {
      const key = `${mediaType}:${variant.quality}:${variant.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      streams.push({
        server: siteName,
        link: variant.url,
        type: mediaType,
        quality: String(variant.quality),
        tag: `${isHls ? 'HLS' : 'MP4'} ${variant.quality}P`,
        // 缺 Referer 时站点对 MP4 返回 410。
        headers: isHls ? undefined : {Referer: detailUrl},
      });
    }
  }

  if (!streams.length) {
    throw new ProviderFailure(
      'unavailable',
      `${siteName}: media gateway returned no playable URL`,
    );
  }

  // Vega 用第 1 项做快速下载与默认起播：HLS 优先（自适应码率更稳），
  // 同格式内画质从高到低。
  streams.sort((a, b) => {
    const byType = a.type === 'm3u8' ? 0 : 1;
    const other = b.type === 'm3u8' ? 0 : 1;
    if (byType !== other) return byType - other;
    return (Number(b.quality) || 0) - (Number(a.quality) || 0);
  });

  return streams;
}