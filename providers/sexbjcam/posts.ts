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
 * SexBJCam（sexbjcam.com）——WordPress + retrotube 主题。服务端直出，**无 Cloudflare、无年龄门**。
 *
 * - 首页 `/`，翻页 `/page/N/`（首页没有分页标记，但 `/page/N/` 实测内容各不相同）
 * - 搜索 `/?s={kw}`，翻页 `/page/N/?s={kw}`
 *   ⚠️ 搜索只有一页时**不再渲染分页块**，此时再翻页会拿回重复结果 → 空列表即可。
 * - 分类 `/category/{slug}/`，翻页 `/category/{slug}/page/N/`
 *   ⚠️ 别拼出 `korean-bj//page/2/` 这样的双斜杠，**实测 404**。
 *
 * ⚠️ 403 的真实来源是 CDN 上的 hls2，不是站点拦截 —— 不需要 openWebView 过验证。
 */

function parseCards(
  cheerio: ProviderContext['cheerio'],
  html: string,
  pageUrl: string,
): Post[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const posts: Post[] = [];

  // 主列表只取**第一个** videos-list：首页 main 里有两段
  // （Recently added / Most Viewed Videos），全取会把同一批算两遍。
  // 搜索页没有 .videos-list 包装，直接落在 header 之后 → 退回 main 全体。
  const container = $('div.videos-list').first();
  const scope = container.length ? container : $('main#main, main.site-main').first();

  if (!scope.length) {
    throw new ProviderFailure(
      'unsupported',
      'sexbjcam getPosts: page has no main content region (theme layout changed)',
    );
  }

  scope.find(CARD).each((_index, element) => {
    const card = $(element);
    const link = card.find('a[href]').filter((_i, a) => {
      const href = $(a).attr('href') || '';
      return /sexbjcam\.com/.test(href) && !/\/category\/|\/tag\//.test(href);
    }).first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = resolveUrl(pageUrl, href);
    if (!isPlayableUrl(detailUrl)) return;
    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const image = card.find('img').first();
    const raw = pickImage(
      card.attr('data-main-thumb'),
      image.attr('src'),
      image.attr('data-src'),
    );
    const isPlaceholder = !raw || /\.gif($|\?)/i.test(raw);

    const titleEl = card.find('header.entry-header span').first();
    const title = normalizeText(
      titleEl.text() || card.find('a[title]').first().attr('title') || image.attr('alt'),
    );

    // 时长形如 01:04:00。
    const clock = normalizeText(card.find('span.duration').first().text());

    // 分类/标签/作者都编码在**卡片的 class** 里，而且源码里跨多行，
    // 必须按 \s+ 切并丢空段，否则得到 "pandatv\n" 这种带换行的标签。
    const classes = (card.attr('class') || '').split(/\s+/).filter(Boolean);
    const tags = classes
      .map(item => (/^(category|tag)-(.+)$/.exec(item)?.[2] || '').replace(/-/g, ' '))
      .filter(Boolean);

    posts.push({
      title: title || 'SexBJCam',
      link: detailUrl,
      image: isPlaceholder ? '' : resolveUrl(pageUrl, raw),
      tag: tags[0],
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
    'sexbjcam',
    operation,
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, signal, timeout: 20000});
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
  asChallengeOrEmpty('sexbjcam', operation, html, posts.length);
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
  // catalog 里 'latest' 是首页入口。分类路径用 /category/{slug}/，
  // 翻页时拼成 /category/{slug}/page/N/ —— 中间只留一个斜杠。
  const base = slug && slug !== 'latest' ? `${DEFAULT_BASE}/category/${slug}` : DEFAULT_BASE;
  const url = page > 1 ? `${base}/page/${page}/` : `${base}/`;
  return feed(url, signal, providerContext, 'getPosts');
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
  const url =
    page > 1
      ? `${DEFAULT_BASE}/page/${page}/?s=${keyword}`
      : `${DEFAULT_BASE}/?s=${keyword}`;
  return feed(url, signal, providerContext, 'getSearchPosts');
};