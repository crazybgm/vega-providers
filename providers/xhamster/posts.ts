import {Post, ProviderContext} from '../types';
import {
  ProviderFailure,
  asChallengeOrEmpty,
  fetchHtml,
  isPlayableUrl,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import {CARD, DEFAULT_BASE} from './site';

/**
 * xHamster（xhamster.com，www 会 301 到裸域）。服务端直出 HTML。
 *
 * - 首页 `/`，翻页 `/?page=N`（越界 404 = 到底）
 * - 搜索 `/search/{kw}?page=N`；总数在 `p[data-role=search-result-count]`
 * - 分类 `/categories` → `/categories/{slug}`，翻页走**路径式** `/{slug}/{N}`（不是 ?page=）
 *
 * ⚠️ 本站只能拿到 HLS 分片，**没有可下载的整文件 MP4**（明文直链与
 * /movies/…/download/ 服务端均 403），所以不在 manifest 里开下载能力，
 * 取不到就如实报错，不猜 mp4 地址。
 */

function parseCards(
  cheerio: ProviderContext['cheerio'],
  html: string,
  pageUrl: string,
): Post[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const posts: Post[] = [];

  $(CARD).each((_index, element) => {
    const card = $(element);
    // 卡片 href 是**绝对地址**，比路径前先归一化，
    // 否则整站会被误判成「没有内容」。
    const link = card.find('a[data-role="thumb-link"]').first();
    const rawHref = link.attr('href');
    if (!rawHref) return;
    const detailUrl = resolveUrl(pageUrl, rawHref);
    if (!isPlayableUrl(detailUrl)) return;
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find('img').first();
    const thumb = pickImage(
      image.attr('src'),
      (image.attr('srcset') || '').split(',')[0]?.trim().split(' ')[0],
      image.attr('data-src'),
    );
    const isPlaceholder = !thumb || /\.gif($|\?)/i.test(thumb);

    const titleLink = card.find('a.video-thumb-info__name').first();
    const title = normalizeText(
      titleLink.attr('title') ||
        titleLink.text() ||
        link.attr('aria-label') ||
        card.attr('aria-label'),
    );

    // 时长角标实测混进「4K 02:07」，只取时钟片段。
    const duration = normalizeText(card.find('[data-role="video-duration"]').first().text());
    const clock = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(duration)?.[1];
    const author = normalizeText(card.find('a.video-uploader__name').first().text());

    posts.push({
      title: title || 'xHamster',
      link: detailUrl,
      image: isPlaceholder ? '' : resolveUrl(pageUrl, thumb),
      tag: author || undefined,
      cornerTag: clock,
    });
  });

  return posts;
}

async function loadPage(
  url: string,
  signal: AbortSignal,
  providerContext: ProviderContext,
  operation: string,
): Promise<string> {
  const {axios, commonHeaders} = providerContext;
  return fetchHtml(
    'xhamster',
    operation,
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
    signal,
  );
}

async function feed(
  url: string,
  signal: AbortSignal,
  providerContext: ProviderContext,
  operation: string,
): Promise<Post[]> {
  let html: string;
  try {
    html = await loadPage(url, signal, providerContext, operation);
  } catch (error) {
    if (error instanceof ProviderFailure && error.kind === 'not-found') {
      return [];
    }
    throw error;
  }
  const posts = parseCards(providerContext.cheerio, html, url);
  asChallengeOrEmpty('xhamster', operation, html, posts.length);
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
  const slug = (filter || '').trim().replace(/^\/+|\/+$/g, '');
  // catalog 里 'latest' 是首页入口，不是 `/latest` 这个路径。
  const path = slug && slug !== 'latest' ? `/${slug}` : '';
  const query = page > 1 ? (path ? `?page=${page}` : `/?page=${page}`) : '';
  return feed(`${DEFAULT_BASE}${path}${query}`, signal, providerContext, 'getPosts');
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
  const url = `${DEFAULT_BASE}/search/${keyword}${page > 1 ? `?page=${page}` : ''}`;
  return feed(url, signal, providerContext, 'getSearchPosts');
};