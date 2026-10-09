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
import { CARD, CARD_IMAGE, DEFAULT_BASE, SITE_NAME, VIDEO_ID } from './site';

/**
 * Tube8（www.tube8.com）
 *
 * 结构来自 MultiVideo 2026-09-26 实测：
 * - 卡片：`article.video-box[data-video-id]` → 详情 `a.video-box-image`（`/porn-video/{id}/`），
 *   标题 `a.video-title-text`，封面 `img.thumb-image`（src 是 1x1 占位，真地址在 data-src）
 * - 同一页里推荐位与「最新」位会出现重复条目（实测 66 张卡片只有 56 个不同 ID），必须去重
 * - 可翻页的是 `/newest/page/{N}/`；搜索 `/searches.html/?q={kw}`（**结尾斜杠必须**，翻页 `&page=N`）
 * - 分类索引 `/categories.html/` → `/cat/{slug}/?page=N`
 * - 热门 `/top/page/{N}/`（本站是唯一实测存在排行页的站点）
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
      .find('a.video-box-image, a[href]')
      .filter((_i, a) => VIDEO_ID.test($(a).attr('href') || ''))
      .first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = resolveUrl(pageUrl, href);
    if (!isPlayableUrl(detailUrl)) return;
    // Vega 用 link 作主键；站点同页会重复，去重是必需的而不是可选的。
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find(CARD_IMAGE).first();
    const thumb = pickImage(
      image.attr('data-src'),
      (image.attr('data-srcset') || '').split(',')[0]?.trim().split(' ')[0],
      image.attr('src'),
    );
    const titleEl = card.find('.video-title-text').first();
    const title = normalizeText(
      titleEl.attr('title') || titleEl.text() || card.attr('aria-label'),
    );
    const author = normalizeText(card.find('a.author-title-text').first().text());

    posts.push({
      title: title || SITE_NAME,
      link: detailUrl,
      image: thumb ? resolveUrl(pageUrl, thumb) : '',
      tag: author || undefined,
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
  const { axios, commonHeaders } = providerContext;
  return fetchHtml(
    'tube8',
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
    // 第 2 页往后 404、搜索无结果，是站点的正常行为。
    if (error instanceof ProviderFailure && error.kind === 'not-found' && (page > 1 || allowEmpty)) {
      return [];
    }
    throw error;
  }
  const posts = parseCards(providerContext.cheerio, html, url);
  // 解析不到条目时再区分「真没结果」与「被验证页挡住」。
  // Tube8 的正常列表页配置里就带 GRECAPTCHA 字样，所以只能在解析后判断。
  asChallengeOrEmpty('tube8', operation, html, posts.length);
  if (!posts.length && !allowEmpty) {
    throw new ProviderFailure('parse', `tube8 ${operation}: no video cards on page`);
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

  if (!slug || slug === 'top') {
    const url = page > 1 ? `${DEFAULT_BASE}/top/page/${page}/` : `${DEFAULT_BASE}/top.html/`;
    return feed(url, page, signal, providerContext, 'getPosts', false);
  }

  if (slug === 'newest') {
    // 第 1 页规范地址是 `/newest/page/`。
    const url = `${DEFAULT_BASE}/newest/page/${page}/`;
    return feed(url, page, signal, providerContext, 'getPosts', false);
  }

  if (slug === 'categories') {
    if (page > 1) return [];
    const url = `${DEFAULT_BASE}/categories.html/`;
    return feed(url, page, signal, providerContext, 'getPosts', false);
  }

  const url = `${DEFAULT_BASE}/${slug}/${page > 1 ? `?page=${page}` : ''}`;
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
  const query = encodeURIComponent((searchQuery || '').trim());
  // 结尾斜杠是必须的，少了会被 301 到别处。
  const url = `${DEFAULT_BASE}/searches.html/?q=${query}${page > 1 ? `&page=${page}` : ''}`;
  return feed(url, page, signal, providerContext, 'getSearchPosts', true);
};