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
 * YouPorn（www.youporn.com）。openresty 直出 HTML，**无 Cloudflare、无年龄门**，plain GET 即 200。
 *
 * - 首页 `/`，翻页 `/?page=N`（越界 404）
 * - 搜索 `/search/?query={kw}`，翻页 `&page=N`
 *   ⚠️ **零结果是 404，但 404 页里仍有推荐卡片** → 只能按 HTTP 状态判空，
 *   不能按卡片数，否则会把推荐当搜索结果。
 * - 分类索引 `/categories/`，slug 是 `/category/{slug}`（**单数**），列表 `/category/{slug}/?page=N`
 * - `/ranking/`、`/top/` 实测 404 → 没有排行栏，不拿首页冒充热度
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
    const link = card
      .find('a.js_video-box-url, a[href]')
      .filter((_i, a) => /\/(watch|video)\/\d+/.test($(a).attr('href') || ''))
      .first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = resolveUrl(pageUrl, href);
    if (!isPlayableUrl(detailUrl)) return;
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find('img.thumb-image, img.thumb').first();
    // src 是 1×1 占位，真实地址在 data-src / data-srcset。
    const raw = pickImage(
      image.attr('data-src'),
      (image.attr('data-srcset') || '').split(',')[0]?.trim().split(' ')[0],
      image.attr('src'),
    );
    const isPlaceholder = !raw || /\.gif($|\?)/i.test(raw);

    const duration = normalizeText(
      card.find('div.video-duration span, span.tm_video_duration').first().text(),
    );
    // 角标实测混进「PT 14:47」，只取时钟片段。
    const clock = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(duration)?.[1];
    const author = normalizeText(card.find('a.author-title-text').first().text());

    const titleEl = card.find('.video-title-text').first();
    const title = normalizeText(
      titleEl.attr('title') || titleEl.text() || image.attr('alt'),
    );

    posts.push({
      title: title || 'YouPorn',
      link: detailUrl,
      image: isPlaceholder ? '' : resolveUrl(pageUrl, raw),
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
    'youporn',
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
  asChallengeOrEmpty('youporn', operation, html, posts.length);
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
  // catalog 里 'latest' 是本站首页入口，不是 `/latest` 这个路径。
  // 真实分类路径形如 `/category/{slug}/`（单数），由 genres/catalog 传入完整 slug。
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
  const query = encodeURIComponent((searchQuery || '').trim());
  const url = `${DEFAULT_BASE}/search/?query=${query}${page > 1 ? `&page=${page}` : ''}`;
  return feed(url, signal, providerContext, 'getSearchPosts');
};