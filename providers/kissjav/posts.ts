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
import {CARD, DEFAULT_BASE, numericIdFromUrl, SITE_NAME} from './site';

/**
 * KissJAV（kissjav.li，kissjav.com 会 301 过来）。服务端直出 HTML，无需 JS。
 *
 * - 首页 `/`（即最新），翻页 `/latest-updates/{n}/`
 * - 搜索 `/search/{kw}/`，翻页 `/search/{kw}/{n}/`；只有一页时**第 2 页直接 404**，那是「到底」不是错误
 * - 分类 `/categories/` → `/categories/{slug}/{n}/`
 * - 无排行页，**不要**用首页冒充热度
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
    const link = card.find('a[href*="/video/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = resolveUrl(pageUrl, href);
    if (!isPlayableUrl(detailUrl)) return;
    // Vega 用 link 作主键，重复条目会导致分页重复与收藏串号。
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find('img').first();
    // 实测：`src` 是 base64 占位 gif，真实地址在 data-original / data-webp，
    // 所以必须优先取 data-* 属性。pickImage 已跳过 data: URI。
    const raw = pickImage(
      image.attr('data-original'),
      image.attr('data-webp'),
      image.attr('data-src'),
      image.attr('src'),
    );
    // 站点的占位封面（blank.* / .gif）不是真实内容。
    const isPlaceholder = !raw || /^blank\./i.test(raw) || /\.gif($|\?)/i.test(raw);

    // 标题在 <a title="..."> 上；站点卡片没有 .title 节点。
    const linkTitle = normalizeText(link.attr('title'));
    const title = linkTitle || normalizeText(image.attr('alt'));
    const quality = normalizeText(card.find('.qualtiy').first().text()); // 站点拼写就是错的

    posts.push({
      title: title || SITE_NAME,
      link: detailUrl,
      image: isPlaceholder ? '' : resolveUrl(pageUrl, raw),
      tag: quality || undefined,
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
    'kissjav',
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
  allowEmpty: boolean,
): Promise<Post[]> {
  let html: string;
  try {
    html = await loadPage(url, signal, providerContext, operation);
  } catch (error) {
    // 第 2 页往后 404、搜索无结果，都是站点的正常行为。
    if (error instanceof ProviderFailure && error.kind === 'not-found' && (page > 1 || allowEmpty)) {
      return [];
    }
    throw error;
  }
  const posts = parseCards(providerContext.cheerio, html, url);
  asChallengeOrEmpty('kissjav', operation, html, posts.length);
  if (!posts.length && !allowEmpty) {
    throw new ProviderFailure('parse', `kissjav ${operation}: no video cards on page`);
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
  const slug = (filter || '').trim().replace(/^\/+|\/+$/g, '');

  if (!slug || slug === 'latest') {
    if (page <= 1) {
      const url = `${DEFAULT_BASE}/`;
      return feed(url, page, signal, providerContext, 'getPosts', false);
    }
    return feed(`${DEFAULT_BASE}/latest-updates/${page}/`, page, signal, providerContext, 'getPosts', false);
  }

  if (slug === 'categories') {
    // 分类索引页本身不是列表页，如实返回空并让 Vega 显示为空分类。
    if (page > 1) return [];
    const url = `${DEFAULT_BASE}/categories/`;
    const html = await loadPage(url, signal, providerContext, 'getPosts');
    return parseCards(providerContext.cheerio, html, url);
  }

  const url = page <= 1 ? `${DEFAULT_BASE}/${slug}/` : `${DEFAULT_BASE}/${slug}/${page}/`;
  return feed(url, page, signal, providerContext, 'getPosts', false);
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
  const url = page <= 1 ? `${DEFAULT_BASE}/search/${keyword}/` : `${DEFAULT_BASE}/search/${keyword}/${page}/`;
  return feed(url, page, signal, providerContext, 'getSearchPosts', true);
};