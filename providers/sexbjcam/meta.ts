import {Info, ProviderContext} from '../types';
import {
  ProviderFailure,
  fetchHtml,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import {SITE_NAME, isEmbedUrl, videoUrlFromRef} from './site';

/** ISO8601 时长 `P0DT1H4M0S` → `1:04:00`。 */
function parseIsoDuration(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/i.exec(value.trim());
  if (!match) return undefined;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days || 0) * 86400 + Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Math.floor(Number(seconds || 0));
  if (!total) return undefined;
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

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
    'sexbjcam',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, timeout: 20000});
      return {data: response.data as string, status: response.status};
    },
  );

  const $ = cheerio.load(html);

  const title = normalizeText(
    $('h1.entry-title').first().text() || $('meta[property="og:title"]').attr('content'),
  );
  const image = resolveUrl(
    url,
    pickImage(
      $('meta[itemprop="thumbnailUrl"]').attr('content'),
      $('meta[property="og:image"]').attr('content'),
    ),
  );
  const synopsis = normalizeText($('meta[itemprop="description"]').attr('content'));

  const duration =
    parseIsoDuration($('meta[itemprop="duration"]').attr('content')) ||
    normalizeText($('span.duration').first().text()) ||
    undefined;

  const published = normalizeText($('meta[itemprop="uploadDate"]').attr('content'));
  const releaseDate = /^\d{4}-\d{2}-\d{2}/.exec(published)?.[0];

  const cast = $('a[href]')
    .toArray()
    .filter(node => /#video-actors/.test($(node).attr('href') || '') || false)
    .map(node => normalizeText($(node).text()))
    .filter(Boolean)
    .slice(0, 6);
  const actors = cast.length
    ? cast
    : $('#video-actors a')
        .toArray()
        .map(node => normalizeText($(node).text()))
        .filter(Boolean)
        .slice(0, 6);

  // 分类与标签：必须**逐条写全**选择器。
  // 写成 `.entry-content .tags-list, .entry-content, #video-actors a[href]`
  // 时 `a[href]` 只作用在最后一段，前两段选中的是容器本身、取不到 href。
  const collect = (filter: RegExp): string[] =>
    Array.from(
      new Set(
        $('.entry-content .tags-list a[href], .entry-content a[href], #video-actors a[href]')
          .toArray()
          .filter(node => filter.test($(node).attr('href') || ''))
          .map(node => normalizeText($(node).text()))
          .filter(Boolean),
      ),
    ).slice(0, 12);

  const categories = collect(/\/category\//);
  const tags = collect(/\/tag\//);

  // 播放入口：页面里**没有 <video>**，只有第三方 embed 域的 iframe。
  // 站点换过 embed 域名，所以按路径形状识别而不是匹配域名字面量。
  const embedSrc =
    $('meta[itemprop="embedUrl"]').attr('content') ||
    $('div.responsive-player iframe[src]').first().attr('src') ||
    $('iframe[src]')
      .toArray()
      .map(node => $(node).attr('src') || '')
      .find(src => isEmbedUrl(src)) ||
    '';
  const embedUrl = embedSrc ? resolveUrl(url, embedSrc) : '';

  if (!title) {
    throw new ProviderFailure(
      'parse',
      'sexbjcam getMeta: page did not contain recognisable video metadata',
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
    cast: actors.length ? actors : undefined,
    releaseDate,
    linkList: [
      {
        title: title || SITE_NAME,
        quality: duration || undefined,
        directLinks: [{title: title || SITE_NAME, link: embedUrl || url, type: 'movie' as const}],
      },
    ],
  };
};