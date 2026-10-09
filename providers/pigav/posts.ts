import {Post, ProviderContext} from '../types';
import {fetchJson, normalizeText} from '../shared/common';
import {API, DEFAULT_BASE, PAGE_SIZE, SITE_NAME} from './site';

/**
 * PIGAV（pigav.com）——PeerTube 实例的公开 REST API。
 *
 * ⚠️ 三个实测差异，直接决定判空逻辑：
 * 1. **分页用 `start`/`count`，不是页码**；`total` 由站点给出，用来判断还有没有下一页。
 * 2. **搜索零结果是 200 + 空数组**（不是 404）→ 判据与 YouPorn/RedTube 相反。
 *    只有真正的 404 才是「到底了」。
 * 3. 列表接口里的 `files` / `streamingPlaylists` **是空的**，
 *    播放地址只在详情接口给 → 列表里绝不解析播放源。
 */

interface PeerTubeVideo {
  uuid?: string;
  name?: string;
  duration?: number;
  thumbnails?: {aspectRatio?: string; fileUrl?: string}[];
  thumbnailPath?: string;
  channel?: {displayName?: string};
  account?: {displayName?: string};
  category?: {label?: string};
  views?: number;
  aspectRatio?: number;
}

interface PeerTubeList {
  total?: number;
  data?: PeerTubeVideo[];
}

function toPost(video: PeerTubeVideo): Post | null {
  const uuid = video.uuid;
  if (!uuid) return null;

  // 缩略图优先取 16:9 的那张，否则退回 thumbnailPath / 第一张。
  const byRatio = video.thumbnails?.find(item => item.aspectRatio === '16:9');
  const image =
    byRatio?.fileUrl || video.thumbnailPath || video.thumbnails?.[0]?.fileUrl || '';

  const seconds = Number(video.duration || 0);
  const clock = seconds
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
    : undefined;

  const author = video.channel?.displayName || video.account?.displayName || '';

  return {
    title: normalizeText(video.name) || SITE_NAME,
    // 站点自己的路由也是这个形状，用它当主键即可稳定定位。
    link: `${DEFAULT_BASE}/videos/watch/${uuid}`,
    image,
    tag: author || video.category?.label || undefined,
    cornerTag: clock,
    aspectRatio: video.aspectRatio || undefined,
  };
}

async function list(
  url: string,
  signal: AbortSignal,
  providerContext: ProviderContext,
  operation: string,
): Promise<Post[]> {
  const {axios, commonHeaders} = providerContext;
  const payload = await fetchJson<PeerTubeList>(
    'pigav',
    operation,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 15000});
      return {data: response.data, status: response.status};
    },
    signal,
  );

  const items = Array.isArray(payload?.data) ? payload.data : [];
  const posts: Post[] = [];
  const seen = new Set<string>();
  for (const video of items) {
    const post = toPost(video);
    if (!post || seen.has(post.link)) continue;
    seen.add(post.link);
    posts.push(post);
  }
  return posts;
}

export const getPosts = async function ({
  filter,
  page,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  // filter 形如 `category-21`（分类 id 是数字，不是 slug）。
  const categoryId = /^category-(\d+)$/.exec((filter || '').trim())?.[1];
  const params = [
    `start=${start}`,
    `count=${PAGE_SIZE}`,
    'sort=-publishedAt',
    categoryId ? `categoryOneOf=${categoryId}` : '',
  ]
    .filter(Boolean)
    .join('&');

  return list(`${DEFAULT_BASE}${API.videos}?${params}`, signal, providerContext, 'getPosts');
};

export const getSearchPosts = async function ({
  searchQuery,
  page,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const keyword = encodeURIComponent((searchQuery || '').trim());
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  const url = `${DEFAULT_BASE}${API.search}?search=${keyword}&start=${start}&count=${PAGE_SIZE}`;
  // 零结果是 200 + 空数组，如实返回空列表即可。
  return list(url, signal, providerContext, 'getSearchPosts');
};