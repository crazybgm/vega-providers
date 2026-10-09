import {Stream, ProviderContext} from '../types';
import {ProviderFailure, fetchHtml, isPlayableUrl, resolveUrl} from '../shared/common';
import {SITE_NAME, videoUrlFromRef} from './site';

/**
 * 明文可用的只有 `<head>` 里**预加载**的 m3u8：
 * `link[rel=preload][as=video]` 中 href 含 `.m3u8` 的那条。
 *
 * ⚠️ 合规边界：`xplayerSettings.sources` 里是**加密十六进制串**，
 * 客户端要用同页的 `pk` 自行解密。本 Provider **不去解密它** ——
 * 那是站点的访问控制机制，绕过它不在本项目范围内。
 * 因此本站只能提供 HLS 播放，不能下载整文件。
 *
 * 这些地址带时效签名（改动 epoch 即 403），所以**绝不缓存**：
 * Vega 每次进入播放都会重新调用本函数。
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
    'xhamster',
    'getStream',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
    signal,
  );

  const $ = cheerio.load(html);

  const preload =
    $('link[rel="preload"][as="video"], link[rel="preload"]')
      .toArray()
      .map(node => $(node).attr('href') || '')
      .find(href => /\.m3u8(\?|$)/i.test(href));

  const candidate = preload ? resolveUrl(url, preload) : '';
  if (!isPlayableUrl(candidate)) {
    throw new ProviderFailure(
      'unavailable',
      'xhamster getStream: no preloaded m3u8 found (content removed, or the page requires the site player)',
    );
  }

  return [
    {
      server: SITE_NAME,
      link: candidate,
      type: 'm3u8',
      // 站点只在 head 里给一个清单地址，没有明文清晰度列表。
      quality: 'auto',
      tag: 'HLS',
    },
  ];
};