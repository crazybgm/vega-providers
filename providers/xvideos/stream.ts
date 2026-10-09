import { Stream, ProviderContext } from '../types';
import { ProviderFailure, fetchHtml, isPlayableUrl } from '../shared/common';
import { DEFAULT_BASE, SETTERS, SITE_NAME } from './site';

/**
 * 播放源来自 `html5player.setVideoHLS(...)`（m3u8）与
 * `setVideoUrlHigh/Low(...)`（MP4）。
 *
 * 这些地址**都带时效签名**（`,<unix>` 或 `secure=`），过期后必须重新解析。
 * Vega 每次进入播放都会重新调用本函数，因此这里不做缓存，
 * 只保证返回的是当次解析到的最新地址。
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
  const { axios, commonHeaders } = providerContext;
  const url = isPlayableUrl(link) ? link : `${DEFAULT_BASE}${link.startsWith('/') ? '' : '/'}${link}`;

  const html = await fetchHtml(
    'xvideos',
    'getStream',
    url,
    async () => {
      const response = await axios.get(url, {
        headers: commonHeaders,
        signal,
        timeout: 15000,
      });
      return { data: response.data as string, status: response.status };
    },
    signal,
  );

  const streams: Stream[] = [];

  const hls = SETTERS.VideoHLS.exec(html)?.[1];
  if (isPlayableUrl(hls) && hls.startsWith('http')) {
    streams.push({
      server: SITE_NAME,
      link: hls,
      type: 'm3u8',
      quality: 'auto',
      tag: 'HLS',
    });
  }

  const high = SETTERS.VideoUrlHigh.exec(html)?.[1];
  const low = SETTERS.VideoUrlLow.exec(html)?.[1];
  if (isPlayableUrl(high) && high.startsWith('http')) {
    streams.push({
      server: SITE_NAME,
      link: high,
      type: 'mp4',
      quality: '720',
      tag: 'MP4 高清',
    });
  }
  if (isPlayableUrl(low) && low.startsWith('http')) {
    streams.push({
      server: SITE_NAME,
      link: low,
      type: 'mp4',
      quality: '360',
      tag: 'MP4 流畅',
    });
  }

  if (!streams.length) {
    throw new ProviderFailure(
      'unavailable',
      'xvideos getStream: no playable media URL found (content removed, expired, or page changed)',
    );
  }

  return streams;
};