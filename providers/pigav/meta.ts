import {Info, ProviderContext} from '../types';
import {ProviderFailure, fetchJson, normalizeText, resolveUrl} from '../shared/common';
import {API, DEFAULT_BASE, SITE_NAME, uuidFromUrl} from './site';

interface PeerTubeVideo {
  uuid?: string;
  name?: string;
  description?: string;
  duration?: number;
  tags?: string[];
  category?: {label?: string};
  channel?: {displayName?: string};
  account?: {displayName?: string};
  thumbnails?: {aspectRatio?: string; fileUrl?: string}[];
  thumbnailPath?: string;
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const {axios, commonHeaders} = providerContext;

  const uuid = uuidFromUrl(link);
  if (!uuid) {
    throw new ProviderFailure(
      'unsupported',
      'pigav getMeta: the link does not contain a video uuid',
    );
  }

  // 缩略图子域（img.pigav.com）与主域不同，取图时要补全。
  const payload = await fetchJson<PeerTubeVideo>(
    'pigav',
    'getMeta',
    async () => {
      const response = await axios.get(`${DEFAULT_BASE}${API.video(uuid)}`, {
        headers: commonHeaders,
        timeout: 15000,
      });
      return {data: response.data, status: response.status};
    },
  );

  const title = normalizeText(payload?.name);
  if (!title) {
    throw new ProviderFailure(
      'parse',
      'pigav getMeta: API response did not contain a video title',
    );
  }

  const thumb = payload.thumbnails?.find(item => item.aspectRatio === '16:9')?.fileUrl;
  const image = resolveUrl(
    DEFAULT_BASE,
    thumb || payload.thumbnailPath || payload.thumbnails?.[0]?.fileUrl || '',
  );

  const author = payload.channel?.displayName || payload.account?.displayName || '';
  const tags = Array.from(
    new Set((payload.tags || []).map(tag => normalizeText(tag)).filter(Boolean)),
  );
  if (payload.category?.label) tags.unshift(normalizeText(payload.category.label));

  const seconds = Number(payload.duration || 0);
  const durationText = seconds
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
    : undefined;

  const webUrl = `${DEFAULT_BASE}/videos/watch/${uuid}`;

  return {
    title: title || SITE_NAME,
    synopsis: normalizeText(payload.description),
    image,
    type: 'movie',
    webUrl,
    tags,
    cast: author ? [author] : undefined,
    linkList: [
      {
        title: title || SITE_NAME,
        quality: durationText ? 'auto' : undefined,
        directLinks: [{title: title || SITE_NAME, link: webUrl, type: 'movie' as const}],
      },
    ],
  };
};