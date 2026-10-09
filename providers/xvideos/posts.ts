import { Post, ProviderContext } from '../types';
import {
  ProviderFailure,
  asChallengeOrEmpty,
  fetchHtml,
  isPlayableUrl,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import { DEFAULT_BASE, eidFromUrl, SITE_NAME } from './site';

/**
 * XVideos（www.xvideos.com）
 *
 * 页面结构来自 MultiVideo 2026-09-24 实测（服务端直出 HTML）：
 * - 列表卡片：`div.thumb-block[data-id][data-eid]` → `a[href=/video.{eid}/{slug}]`、
 *   `img[src|data-src]`、`.thumb-under p.title a`、`span.duration`、`.metadata .name`
 * - 首页 `/` 是运营推荐位，站点自身不给翻页；`/new`、`/videos/all` 等历史路径现在 404。
 *   因此首页只给第 1 页，深度浏览走分类与搜索（不伪造 hasMore）。
 * - 分类：`/c/{Name}-{id}`，翻页 `/c/{Name}-{id}/{n}`
 * - 搜索：`/?k={kw}&p={n}`
 */

const SLUG_PATTERN = /^[A-Za-z0-9_.-]+$/;

async function loadPage(
  url: string,
  signal: AbortSignal,
  providerContext: ProviderContext,
  operation: string,
): Promise<string> {
  const { axios, commonHeaders } = providerContext;
  return fetchHtml(
    'xvideos',
    operation,
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
}

function parseCards(
  cheerio: ProviderContext['cheerio'],
  html: string,
  pageUrl: string,
): Post[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const posts: Post[] = [];

  $('div.thumb-block').each((_index, element) => {
    const card = $(element);
    const link = card
      .find('a[href]')
      .filter((_i, a) => ($(a).attr('href') || '').includes('/video.'))
      .first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = resolveUrl(pageUrl, href);
    if (!isPlayableUrl(detailUrl) || !detailUrl.includes('/video.')) return;

    const eid = eidFromUrl(detailUrl) || card.attr('data-eid');
    if (!eid) return;
    // Vega 用 link 作主键，重复条目会导致分页重复与收藏串号。
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find('img').first();
    const thumb = pickImage(
      image.attr('data-src'),
      image.attr('src'),
      image.attr('data-sfwthumb'),
    );
    const titleLink = card.find('p.title a').first();
    const title = normalizeText(
      (titleLink.length ? titleLink.attr('title') : link.attr('title')) ||
        (titleLink.length ? titleLink.text() : link.text()),
    );
    const uploader = normalizeText(card.find('.name').first().text());

    posts.push({
      title: title || SITE_NAME,
      link: detailUrl,
      image: thumb ? resolveUrl(pageUrl, thumb) : '',
      tag: uploader || undefined,
    });
  });

  return posts;
}

async function listPage(
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
    // 第 2 页往后 404 是站点的正常行为，表示没有更多内容。
    if (page > 1 && error instanceof ProviderFailure && error.kind === 'not-found') {
      return [];
    }
    throw error;
  }
  const posts = parseCards(providerContext.cheerio, html, url);
  // 解析不到条目时再区分「真没结果」与「被验证页挡住」。
  asChallengeOrEmpty('xvideos', operation, html, posts.length);
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

  if (!slug || slug === 'home' || slug === 'categories') {
    // 站点首页是推荐位，不支持翻页，如实只返回第 1 页。
    if (page > 1) return [];
    const url = `${DEFAULT_BASE}/`;
    const html = await loadPage(url, signal, providerContext, 'getPosts');
    return parseCards(providerContext.cheerio, html, url);
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new ProviderFailure('unsupported', `xvideos getPosts: unknown filter "${filter}"`);
  }

  const url = page <= 1 ? `${DEFAULT_BASE}/c/${slug}` : `${DEFAULT_BASE}/c/${slug}/${page}`;
  return listPage(url, page, signal, providerContext, 'getPosts');
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
  const url = `${DEFAULT_BASE}/?k=${query}${page > 1 ? `&p=${page}` : ''}`;
  return listPage(url, page, signal, providerContext, 'getSearchPosts');
};