import { Info, ProviderContext } from '../types';
import {
  ProviderFailure,
  fetchHtml,
  isPlayableUrl,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import { DEFAULT_BASE, numericIdFromUrl, SITE_NAME } from './site';

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const { axios, cheerio, commonHeaders } = providerContext;
  const url = isPlayableUrl(link) ? link : `${DEFAULT_BASE}${link.startsWith('/') ? '' : '/'}${link}`;

  const html = await fetchHtml(
    'tube8',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, { headers: commonHeaders, timeout: 15000 });
      return { data: response.data as string, status: response.status };
    },
  );

  const $ = cheerio.load(html);

  const title = normalizeText(
    $('h1').first().text() || $('meta[property="og:title"]').attr('content'),
  );

  const image = resolveUrl(
    url,
    pickImage(
      $('meta[property="og:image"]').attr('content'),
      $('img.thumb-image').first().attr('data-src'),
    ),
  );

  // 只认这条视频自己的分类容器。真机实测：同一页里导航菜单、
  // 「Recommended Categories For You」与顶部热门位用的都是 /cat/ 地址，
  // 按路径全拿会把导航项当成本条视频的分类。
  const categories = Array.from(
    new Set(
      $('div.js_categoriesWrapper a[href]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  const tags = Array.from(
    new Set(
      $('a[href*="/porntags/"]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  const author = normalizeText($('a.author-title-text').first().text());
  const synopsis = normalizeText($('.description, .video-description').first().text());

  const id = numericIdFromUrl(url);
  if (!id && !title) {
    throw new ProviderFailure(
      'parse',
      'tube8 getMeta: page did not contain recognisable video metadata',
    );
  }

  return {
    title: title || SITE_NAME,
    synopsis,
    image,
    type: 'movie',
    webUrl: url,
    tags: tags.length ? tags : categories.length ? categories : author ? [author] : [],
    cast: author ? [author] : undefined,
    linkList: [
      {
        title: title || SITE_NAME,
        quality: 'auto',
        directLinks: [{ title: title || SITE_NAME, link: url, type: 'movie' as const }],
      },
    ],
  };
};