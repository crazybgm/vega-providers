import {Stream, ProviderContext} from '../types';
import {ProviderFailure, fetchHtml, isPlayableUrl, resolveUrl} from '../shared/common';
import {decodeOutLink, SITE_NAME} from './site';

/**
 * 播放地址来自**原始站点**，PornMD 自己不托管视频。
 *
 * 实测源站分布（2026-10，单次搜索 230 条可解结果）：
 *   www.eporner.com  154 条（67%）
 *   xh.partners      34 条（15%）
 *   xgroovy.com        6 条
 *   其余 18 个站       各 1~2 条
 *
 * 因此只对前两个（覆盖 82%）做解析，其余源站**如实报不支持**——
 * 猜一个地址出来只会让用户在播放失败时更困惑。
 *
 * ⚠️ 这些地址带**时效令牌**（实测见过 `?pw=`），不缓存，每次重新解析。
 */

type SourceKind = 'eporner' | 'xh' | 'unknown';

function classify(url: string): SourceKind {
  if (/eporner\.com/i.test(url)) return 'eporner';
  if (/xh\.partners/i.test(url)) return 'xh';
  return 'unknown';
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

  // Vega 传进来的可能是 PornMD 跳转页，也可能是 getMeta 给的源站直链，两种都要认。
  const source = decodeOutLink(link) || (isPlayableUrl(link) ? link : '');
  if (!source) {
    throw new ProviderFailure(
      'parse',
      'pornmd getStream: cannot resolve the source site from this link',
    );
  }

  const kind = classify(source);
  if (kind === 'unknown') {
    // 不用 new URL()：沙盒里 URL 的可用性不保证，正则取 host 更稳。
    const host = (/^https?:\/\/([^/?#]+)/i.exec(source)?.[1]) || 'unknown';
    throw new ProviderFailure(
      'unsupported',
      `pornmd: source site "${host}" is not supported yet (only eporner and xh.partners are implemented)`,
    );
  }

  const html = await fetchHtml(
    'pornmd',
    'getStream',
    source,
    async () => {
      const response = await axios.get(source, {
        headers: commonHeaders,
        signal,
        timeout: 20000,
        validateStatus: () => true,
      });
      return {data: response.data as string, status: response.status};
    },
    signal,
  );

  const $ = cheerio.load(html);
  const scripts = $('script')
    .toArray()
    .map(node => $(node).html() || '')
    .join('\n')
    .replace(/\\\//g, '/');

  const streams: Stream[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, mediaType: 'm3u8' | 'mp4', tag: string) => {
    if (!raw) return;
    const url = resolveUrl(source, raw.trim());
    if (!isPlayableUrl(url) || seen.has(url)) return;
    seen.add(url);
    streams.push({server: SITE_NAME, link: url, type: mediaType, quality: 'auto', tag});
  };

  if (kind === 'eporner') {
    // 形如 <video> 的 src，或脚本里的 gvideo.eporner.com/…/….mp4
    add($('video').attr('src'), 'mp4', 'MP4');
    for (const url of scripts.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi) || []) {
      add(url, 'mp4', 'MP4');
    }
  } else {
    // xh.partners：video_url / hls / file
    const videoUrl = /video_url\s*[:=]\s*["']([^"']+)/.exec(scripts)?.[1];
    add(videoUrl, /\.m3u8(\?|$)/i.test(videoUrl || '') ? 'm3u8' : 'mp4', 'MP4');
    for (const url of scripts.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || []) {
      add(url, 'm3u8', 'HLS');
    }
    for (const url of scripts.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi) || []) {
      add(url, 'mp4', 'MP4');
    }
  }

  if (!streams.length) {
    throw new ProviderFailure(
      'unavailable',
      `pornmd: found no playable URL on the source page (${kind})`,
    );
  }

  return streams.slice(0, 3);
};
