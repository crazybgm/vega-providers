import {Stream, ProviderContext} from '../types';
import {fetchHtml} from '../shared/common';
import {resolveAyloStreams} from '../shared/ayloStream';
import {SITE_NAME, videoUrlFromRef} from './site';

/**
 * 页内两组媒体定义都在 `playervars` 里（`generalVideoConfig.mainRoll.mediaDefinition`
 * 与 `video_player_setup.playervars`），条目形如
 * `{"format":"hls|mp4","videoUrl":"/media/…?s=令牌"}`。
 *
 * 必须二次请求网关拿清晰度数组。
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
    'redtube',
    'getStream',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 15000});
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

  return resolveAyloStreams({
    siteName: SITE_NAME,
    detailUrl: url,
    scripts,
    providerContext,
    signal,
  });
};