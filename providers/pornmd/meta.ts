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
import {decodeOutLink, DEFAULT_BASE} from './site';

/**
 * PornMD **没有详情页**。
 *
 * Vega 的 `getMeta` 拿到的 `link` 是 PornMD 自己的 `/out/?l=…`，
 * 这里做两件事：
 * 1. 解出原始站点地址（这是 PornMD 的全部价值）
 * 2. 抓原始站点的标题/封面/简介，补足详情页该有的信息
 *
 * 若原始站点不可达，就只返回 PornMD 侧能给出的最小信息，
 * 而不是编造标题或报错卡住整个流程。
 */
export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const {axios, cheerio, commonHeaders} = providerContext;

  const source = decodeOutLink(link);
  if (!source) {
    throw new ProviderFailure(
      'parse',
      'pornmd getMeta: the link is not a PornMD redirect (missing l= parameter)',
    );
  }

  // 标题先用占位，保证即使源站打不开也有可显示的条目。
  // Provider 是独立扩展，不能假定宿主应用的语言，因此这里用英文。
  let title = 'PornMD result';
  let image = '';
  let synopsis = '';
  let author: string | undefined;

  try {
    const response = await axios.get(source, {
      headers: commonHeaders,
      timeout: 15000,
      validateStatus: () => true,
    });
    if (response.status === 200) {
      const page = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const $ = cheerio.load(page);
      title =
        normalizeText(decodeEntities($('h1').first().text())) ||
        normalizeText($('meta[property="og:title"]').attr('content')) ||
        title;
      image = resolveUrl(source, pickImage($('meta[property="og:image"]').attr('content')));
      synopsis = normalizeText(
        $('meta[name="description"]').attr('content') ||
          $('meta[property="og:description"]').attr('content'),
      );
      author = normalizeText($('meta[name="author"]').attr('content')) || undefined;
    }
  } catch {
    // 源站不可达是常态（限流/需登录），保留最小信息继续。
  }

  return {
    title,
    synopsis,
    image,
    type: 'movie',
    // webUrl 指向 PornMD 的跳转页，Vega 里点开会回到聚合站。
    webUrl: isPlayableUrl(link) ? link : `${DEFAULT_BASE}${link}`,
    tags: ['PornMD'],
    cast: author ? [author] : undefined,
    linkList: [
      {
        title,
        // 源站地址交给 getStream 去解析播放源。
        directLinks: [{title, link: source, type: 'movie' as const}],
      },
    ],
  };
};
