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
import {SITE_NAME, videoUrlFromRef} from './site';

/**
 * 详情数据全在 `window.initials={…}` 这一个脚本块里。
 *
 * 先 `indexOf("window.initials")` 把整块切出来再取字段，
 * 否则会匹配到别的脚本里的同名键。
 */
function extractInitials(scripts: string): string {
  const start = scripts.indexOf('window.initials');
  if (start < 0) return '';
  const tail = scripts.slice(start);
  const end = tail.indexOf('</script>');
  return end > 0 ? tail.slice(0, end) : tail;
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
    'xhamster',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, {headers: commonHeaders, timeout: 15000});
      return {data: response.data as string, status: response.status};
    },
  );

  const $ = cheerio.load(html);
  const scripts = $('script')
    .toArray()
    .map(node => $(node).html() || '')
    .join('\n')
    .replace(/\\\//g, '/');
  const block = extractInitials(scripts);

  const jsonValue = (field: string): string | undefined => {
    const match = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`).exec(block);
    const raw = match?.[1];
    if (!raw) return undefined;
    try {
      return JSON.parse(`"${raw}"`) as string;
    } catch {
      return raw;
    }
  };

  const title = normalizeText(
    decodeEntities(jsonValue('title')) || $('meta[property="og:title"]').attr('content'),
  );
  const image = resolveUrl(
    url,
    pickImage(jsonValue('thumbURL'), $('meta[property="og:image"]').attr('content')),
  );
  const synopsis = normalizeText(
    decodeEntities(jsonValue('description')) || $('meta[property="og:description"]').attr('content'),
  );

  // 作者是嵌套对象：author.name / author.nickName。
  const author = normalizeText(
    /"author"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]*)"/.exec(block)?.[1] ||
      /"nickName"\s*:\s*"([^"]*)"/.exec(block)?.[1] ||
      '',
  );

  // 时长在 JSON 里是秒数。
  const durationSeconds = Number(/"duration"\s*:\s*(\d{1,6})/.exec(block)?.[1] || 0);
  const durationText = durationSeconds
    ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`
    : undefined;

  // 标签：取页面上所有链接文本里够短的当标签，最多取前 12 个。
  const tags = Array.from(
    new Set(
      $('a[href]')
        .toArray()
        .map(node => normalizeText($(node).text()))
        .filter(text => text && text.length <= 30),
    ),
  ).slice(0, 12);

  if (!title) {
    throw new ProviderFailure(
      'parse',
      'xhamster getMeta: page did not contain recognisable video metadata',
    );
  }

  return {
    title: title || SITE_NAME,
    synopsis,
    image,
    type: 'movie',
    webUrl: url,
    tags: tags.length ? tags : author ? [author] : [],
    cast: author ? [author] : undefined,
    linkList: [
      {
        title: title || SITE_NAME,
        quality: durationText ? 'auto' : undefined,
        directLinks: [{title: title || SITE_NAME, link: url, type: 'movie' as const}],
      },
    ],
  };
};