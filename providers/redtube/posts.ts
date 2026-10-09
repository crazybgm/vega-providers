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
import {CARD, DEFAULT_BASE, SITE_NAME} from './site';

/**
 * RedTube（www.redtube.com）。openresty，**无 Cloudflare、无年龄门**，plain GET 即 200。
 *
 * - 首页 `/`，翻页 `/?page=N`（越界 404 = 到底）
 * - 搜索 `/?search={kw}`，翻页 `&page=N`
 *   ⚠️ **零结果是 HTTP 404，但 404 页里仍然带推荐卡片** →
 *   判有没有结果只能看 HTTP 状态，绝不能看卡片数，否则会把推荐当搜索结果。
 * - 分类 `/redtube/[a-z0-9_-]+?page=N`（不是老结构 `/categories/名/ID`）
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
    // 卡片链接的 href **只有数字**（如 `/103634591`），要补成绝对地址。
    const link = card.find('a.video_link').first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = resolveUrl(pageUrl, href);
    if (!isPlayableUrl(detailUrl)) return;
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find('img.thumb, img.thumb-image').first();
    // src 是 1×1 占位，真实地址在 data-src / data-srcset。
    const raw = pickImage(
      image.attr('data-src'),
      (image.attr('data-srcset') || '').split(',')[0]?.trim().split(' ')[0],
      image.attr('src'),
    );
    const isPlaceholder = !raw || /\.gif($|\?)/i.test(raw);

    // 时长角标实测混进「PT 14:47」这类前缀，只取时钟片段。
    const duration = normalizeText(
      card.find('span.tm_video_duration, .duration').first().text(),
    );
    const clock = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(duration)?.[1];
    const author = normalizeText(card.find('a.author-title-text').first().text());

    const titleEl = card.find('.video-title-text').first();
    const title = normalizeText(
      titleEl.attr('title') || titleEl.text() || image.attr('alt'),
    );

    posts.push({
      title: title || SITE_NAME,
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
    'redtube',
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
  page: number,
  signal: AbortSignal,
  providerContext: ProviderContext,
  operation: string,
): Promise<Post[]> {
  let html: string;
  try {
    html = await loadPage(url, signal, providerContext, operation);
  } catch (error) {
    // 搜索零结果与列表越界都是 404，在这里按「空」处理，
    // 而不是把 404 页里的推荐卡片当成结果（见上方警告）。
    if (error instanceof ProviderFailure && error.kind === 'not-found') {
      return [];
    }
    throw error;
  }
  const posts = parseCards(providerContext.cheerio, html, url);
  asChallengeOrEmpty('redtube', operation, html, posts.length);
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
  const path = slug && slug !== 'latest' ? `/${slug}` : '';
  const query = page > 1 ? (path ? `?page=${page}` : `/?page=${page}`) : '';
  return feed(`${DEFAULT_BASE}${path}${query}`, page, signal, providerContext, 'getPosts');
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
  // URLEncoder 原样编码即可，空格会变成 `+`，站点接受这个形态。
  const query = encodeURIComponent((searchQuery || '').trim()).replace(/%20/g, '+');
  const url = `${DEFAULT_BASE}/?search=${query}${page > 1 ? `&page=${page}` : ''}`;
  return feed(url, page, signal, providerContext, 'getSearchPosts');
};