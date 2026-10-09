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
import {CARD, DEFAULT_BASE, paths, outLinkToPost} from './site';

/**
 * PornMD 列表 / 搜索。
 *
 * 服务端直出 HTML（这点与它"看起来像 SPA"的外表相反）：
 * 卡片是 `div.card[data-public-id]`，标题在 `<a title>` 上，封面是 ttcache CDN 的图，
 * 时长/清晰度在 `.badge`，来源站与发布时间在 `.item-source-rating-container`。
 *
 * ⚠️ 关键：`/out/?l=…` 里的目标地址带**时效令牌**（实测见过 `?pw=`），
 * 且 PornMD 会重排结果。因此链接不缓存，每次进入都重新解析。
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
    const anchor = card.find('a[href^="/out/"]').first();
    const href = anchor.attr('href');
    if (!href) return;

    const decoded = outLinkToPost(resolveUrl(pageUrl, href));
    // 解不出源站地址的条目直接跳过：留着用户点进去也是坏的。
    if (!decoded) return;
    if (seen.has(decoded.link)) return;
    seen.add(decoded.link);

    const title = normalizeText(anchor.attr('title') || card.find('img').attr('alt'));
    if (!title) return;

    const image = pickImage(
      card.find('img').attr('src'),
      card.find('img').attr('data-src'),
    );

    // 时长与清晰度同在 .badge 里，形如 "HD 12:00"。
    const badge = normalizeText(card.find('.badge').first().text());
    const duration = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(badge)?.[1];
    const quality = /\b(4K|2K|FHD|HD|SD)\b/i.exec(badge)?.[1]?.toUpperCase();

    // 来源站与发布时间在同一个容器里，**class 相同**（都是 item-source）：
    // 站名是 `<a href="/source/…">`，时间是 `<span>`。必须按标签区分，
    // 只取第一个会把 "4 months ago" 当成站名。
    const siteName = normalizeText(
      card.find('.item-source-rating-container a.item-source').first().text(),
    );
    const published = normalizeText(
      card.find('.item-source-rating-container span.item-source').first().text(),
    );

    posts.push({
      title,
      link: decoded.link,
      image: image ? resolveUrl(pageUrl, image) : '',
      tag: siteName || undefined,
      cornerTag: duration || published || undefined,
    });
  });

  return posts;
}

async function feed(
  url: string,
  signal: AbortSignal,
  providerContext: ProviderContext,
  operation: string,
): Promise<Post[]> {
  const {axios, commonHeaders} = providerContext;
  const html = await fetchHtml(
    'pornmd',
    operation,
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 20000});
      return {data: response.data as string, status: response.status};
    },
    signal,
  );

  const posts = parseCards(providerContext.cheerio, html, url);
  // 搜索无结果时 PornMD 返回 404，且 404 页里**仍有推荐卡片**，
  // 所以必须按 HTTP 状态判空，不能看卡片数。
  asChallengeOrEmpty('pornmd', operation, html, posts.length);
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

  // 只保留实测可用的分区；/new 与 /rating 返回 403，不作为入口。
  const section = slug && slug !== 'latest' && slug !== 'popular' ? '' : 'popular';
  const base = section ? `${DEFAULT_BASE}${paths.popular}` : `${DEFAULT_BASE}/c/${slug}`;

  try {
    return await feed(
      `${base}${page > 1 ? `?page=${page}` : ''}`,
      signal,
      providerContext,
      'getPosts',
    );
  } catch (error) {
    // 越界 404 = 到底了。
    if (error instanceof ProviderFailure && error.kind === 'not-found') return [];
    throw error;
  }
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
  const keyword = (searchQuery || '').trim();
  const url = `${DEFAULT_BASE}${paths.search(keyword)}${page > 1 ? `?page=${page}` : ''}`;
  try {
    return await feed(url, signal, providerContext, 'getSearchPosts');
  } catch (error) {
    if (error instanceof ProviderFailure && error.kind === 'not-found') return [];
    throw error;
  }
};
