import {Stream, ProviderContext} from '../types';
import {ProviderFailure, fetchHtml, isPlayableUrl, resolveUrl} from '../shared/common';
import {SITE_NAME, isEmbedUrl, videoUrlFromRef} from './site';
import {unpackAll} from './jsPacker';

/**
 * 流程：详情页 → 第三方 embed 页 → 还原压缩包 → 取 links。
 *
 * ⚠️ 本站**只有 HLS 多清晰度清单，没有整文件 MP4** → 不暴露下载能力。
 * ⚠️ embed 地址带时效签名，过期必须重走「详情 → embed」，不能重放缓存的 URL。
 *
 * 哪个 HLS 条目可用**不能靠编号或扩展名推断**——实测结论与最初的参考卡相反，
 * 详见下面排序处的注释。因此这里逐条探测可用性。
 */

function extractEmbedSrc(html: string, cheerio: ProviderContext['cheerio'], base: string): string {
  const $ = cheerio.load(html);
  const src =
    $('meta[itemprop="embedUrl"]').attr('content') ||
    $('div.responsive-player iframe[src]').first().attr('src') ||
    $('iframe[src]')
      .toArray()
      .map(node => $(node).attr('src') || '')
      .find(item => isEmbedUrl(item)) ||
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
  //
  // ⚠️ 不要按域名判断 embed——站点的 embed 域会变
  // （实测见过 recordplay.biz，现在是 playrecord.biz），
  // 写死域名字面量会在换域名后静默失效：详情页找不到 embed，
  // getStream 跟着一起失败。改用 isEmbedUrl 按路径形状识别。
  const isEmbed = isEmbedUrl(link);
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

  // ⚠️ 不要靠编号或扩展名猜哪个可用。
  //
  // 早期参考卡称「按扩展名挑会选中 403 的 hls2，可用的是更高编号」，
  // 但 2026-10 的实测（4 次独立取样，每次取不同视频）结论正好相反：
  //   hls2 (.m3u8) -> HTTP 200（可用）
  //   hls3 (.txt)  -> HTTP 404（不可用）
  // 站点把 hls2 当主源，hls3 是失效的备用条目。
  // `.txt` 扩展名本身不是问题（CDN 返回 application/vnd.apple.mpegurl）。
  //
  // 因此这里**逐条实测**：只保留响应正常的地址，一条都拿不到才报错。
  // 候选通常只有 2~3 条，多一次请求换来的是「一定能播」而不是「猜一个」。
  const usable: {index: number; url: string}[] = [];
  for (const entry of entries) {
    try {
      const probe = await axios.request({
        url: entry.url,
        method: 'GET',
        headers: commonHeaders,
        signal,
        timeout: 10000,
        // 播放清单通常很小，读一点就够判断可用性。
        maxContentLength: 8192,
        validateStatus: () => true,
      });
      if (probe.status >= 200 && probe.status < 400) usable.push(entry);
    } catch {
      // 这条探测失败就跳过，继续试下一条。
    }
  }

  if (!usable.length) {
    // 站点整体不可用与「地址解析错」要区分开，便于判断问题在哪。
    throw new ProviderFailure(
      'unavailable',
      'sexbjcam getStream: every HLS URL on the embed page failed to respond (site or CDN unavailable)',
    );
  }

  // 探测成功的按编号升序，编号小的是站点主源。
  usable.sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  const streams: Stream[] = [];
  for (const entry of usable.slice(0, 3)) {
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