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
    'redtube',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
  );

  const $ = cheerio.load(html);

  const title = normalizeText($('h1').first().text() || $('meta[property="og:title"]').attr('content'));
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

  // 分类**只认这个容器**。真机实测：页头导航里也用 `/redtube/xxx`，
  // 按路径全取会把导航项当成本片分类，下载目录会跟着错。
  const categories = Array.from(
    new Set(
      $('#video_tags_carousel a.video_carousel_category')
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
      'redtube getMeta: page did not contain recognisable video metadata',
    );
  }

  const allTags = tags.length ? tags : categories;

  return {
    title: title || SITE_NAME,
    synopsis,
    image,
    type: 'movie',
    webUrl: url,
    tags: allTags,
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