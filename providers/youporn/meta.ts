import {Info, ProviderContext} from '../types';
import {
  ProviderFailure,
  fetchHtml,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import {SITE_NAME, videoUrlFromRef} from './site';

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const {axios, cheerio, commonHeaders} = providerContext;
  const url = videoUrlFromRef(link);

  const html = await fetchHtml(
    'youporn',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
  );

  const $ = cheerio.load(html);

  const title = normalizeText(
    $('h1').first().text() || $('meta[property="og:title"]').attr('content'),
  );
  const image = resolveUrl(url, pickImage($('meta[property="og:image"]').attr('content')));

  const tags = Array.from(
    new Set(
      $('a[href*="/tag/"]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  // 分类**只认** js_categoriesWrapper。导航菜单与「Recommended Categories」
  // 也用 /category/ 路径，按路径全取会把导航项当本片分类。
  const categories = Array.from(
    new Set(
      $('div.js_categoriesWrapper a[href]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  const author = normalizeText($('a.author-title-text').first().text());
  const synopsis = normalizeText($('.description, .video-description').first().text());

  if (!title) {
    throw new ProviderFailure(
      'parse',
      'youporn getMeta: page did not contain recognisable video metadata',
    );
  }

  return {
    title: title || SITE_NAME,
    synopsis,
    image,
    type: 'movie',
    webUrl: url,
    tags: tags.length ? tags : categories,
    cast: author ? [author] : undefined,
    linkList: [
      {
        title: title || SITE_NAME,
        quality: 'auto',
        directLinks: [{title: title || SITE_NAME, link: url, type: 'movie' as const}],
      },
    ],
  };
};