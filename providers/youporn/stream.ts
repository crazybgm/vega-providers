import {Stream, ProviderContext} from '../types';
import {fetchHtml} from '../shared/common';
import {resolveAyloStreams} from '../shared/ayloStream';
import {SITE_NAME, videoUrlFromRef} from './site';

/**
 * 与 RedTube / Tube8 共用 Aylo 系那套结构：
 * 页内给网关 `/media/hls/?s=令牌` 与 `/media/mp4/?s=令牌`，
 * 二次请求网关拿清晰度数组。
 *
 * 纯正则解析，不需要 eval / JS 解混淆。
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
    'youporn',
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