import {Info, ProviderContext} from '../types';
import {
  ProviderFailure,
  decodeEntities,
  fetchHtml,
  isPlayableUrl,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import {DEFAULT_BASE, FLASHVARS, SITE_NAME, videoUrlFromRef} from './site';

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
    'kissjav',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
  );

  const $ = cheerio.load(html);
  // 注意：script 内容必须用 .html()，text() 会跳过 script 标签。
  const scripts = $('script')
    .toArray()
    .map(node => $(node).html() || '')
    .join('\n')
    .replace(/\\\//g, '/');

  const h1 = $('h1.title').first().text();
  const flashTitle = FLASHVARS.title.exec(scripts)?.[1];
  const docTitle = normalizeText($('title').text()).split(/[»|]/)[0];
  const title = normalizeText(
    decodeEntities(h1 || flashTitle || docTitle),
  );

  const image = resolveUrl(
    url,
    pickImage(
      FLASHVARS.previewUrl.exec(scripts)?.[1],
      $('meta[property="og:image"]').attr('content'),
    ),
  );

  // 分类：页面上任何含 "categor" 的链接都是导航/栏目，不算本条视频的分类。
  const categories = Array.from(
    new Set(
      $('a[href*="/categories/"]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(text => text && !/categor/i.test(text)),
    ),
  ).slice(0, 12);

  const tags = Array.from(
    new Set(
      $('a[href*="/tags/"]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  const author = normalizeText($('a[href*="/models/"]').first().text());
  const synopsis = normalizeText($('.description').first().text());

  if (!title) {
    throw new ProviderFailure(
      'parse',
      'kissjav getMeta: page did not contain recognisable video metadata',
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