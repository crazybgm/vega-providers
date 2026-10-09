import {Stream, ProviderContext} from '../types';
import {ProviderFailure, fetchJson, isPlayableUrl} from '../shared/common';
import {API, DEFAULT_BASE, SITE_NAME, uuidFromUrl} from './site';

interface PeerTubeFile {
  fileUrl?: string;
  resolution?: {label?: string};
  videoCodec?: string;
}

interface PeerTubeVideo {
  streamingPlaylists?: {
    playlistUrl?: string;
    files?: PeerTubeFile[];
  }[];
  files?: PeerTubeFile[];
}

/**
 * 播放地址**只在详情接口给**（列表接口里 streamingPlaylists / files 是空的）。
 *
 * ⚠️ 必须同时认两处来源，只认一处 → 换个来源的视频整条不可播：
 * - **联邦视频**（从别的 PeerTube 实例拉来的）：`streamingPlaylists[]`
 *   ├─ `playlistUrl` = HLS master 清单（多清晰度）
 *   └─ `files[]`     = 同一条流的分片 MP4，画质取 `resolution.label`
 * - **本站上传的视频**：只给顶层 `files[]`
 *
 * 直读 JSON，不需要 JS 解混淆。
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
  const {axios, commonHeaders} = providerContext;

  const uuid = uuidFromUrl(link);
  if (!uuid) {
    throw new ProviderFailure(
      'unsupported',
      'pigav getStream: the link does not contain a video uuid',
    );
  }

  const payload = await fetchJson<PeerTubeVideo>(
    'pigav',
    'getStream',
    async () => {
      const response = await axios.get(`${DEFAULT_BASE}${API.video(uuid)}`, {
        headers: commonHeaders,
        signal,
        timeout: 15000,
      });
      return {data: response.data, status: response.status};
    },
    signal,
  );

  const streams: Stream[] = [];
  const seen = new Set<string>();

  const push = (url: string | undefined, type: 'm3u8' | 'mp4', quality: string) => {
    if (!isPlayableUrl(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    streams.push({server: SITE_NAME, link: url, type, quality, tag: type === 'm3u8' ? 'HLS' : 'MP4'});
  };

  for (const playlist of payload?.streamingPlaylists || []) {
    push(playlist.playlistUrl, 'm3u8', 'auto');
    for (const file of playlist.files || []) {
      // resolution.label 形如 "480p"，去掉 p 便于排序。
      const label = (file.resolution?.label || '').replace(/p$/i, '');
      push(file.fileUrl, 'mp4', label || 'auto');
    }
  }

  for (const file of payload?.files || []) {
    const label = (file.resolution?.label || '').replace(/p$/i, '');
    push(file.fileUrl, 'mp4', label || 'auto');
  }

  if (!streams.length) {
    throw new ProviderFailure(
      'unavailable',
      'pigav getStream: the API returned no playable media file for this video',
    );
  }

  // HLS 优先（自适应更稳），其次画质降序。
  streams.sort((a, b) => {
    const byType = (a.type === 'm3u8' ? 0 : 1) - (b.type === 'm3u8' ? 0 : 1);
    if (byType !== 0) return byType;
    return (parseQuality(b.quality) || 0) - (parseQuality(a.quality) || 0);
  });

  return streams;
}

function parseQuality(value: string): number {
  const number = Number.parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isNaN(number) ? 0 : number;
}