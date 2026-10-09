import { Info, ProviderContext } from '../types';
import {
  ProviderFailure,
  decodeEntities,
  fetchHtml,
  isPlayableUrl,
  normalizeText,
  pickImage,
  resolveUrl,
} from '../shared/common';
import { DEFAULT_BASE, eidFromUrl, SETTERS, SITE_NAME } from './site';

/**
 * 详情页的播放器参数在 `html5player.setXxx('…')` 调用里。
 *
 * 注意（MultiVideo 实测）：`setVideoURL` 给的是页面规范链接而不是媒体文件，
 * 不能当播放源；媒体地址只有 setVideoUrlLow/High（MP4）与 setVideoHLS（m3u8）。
 */
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
    'xvideos',
    'getMeta',
    url,
    async () => {
      const response = await axios.get(url, { headers: commonHeaders, timeout: 15000 });
      return { data: response.data as string, status: response.status };
    },
  );

  const $ = cheerio.load(html);
  const scripts = $('script')
    .toArray()
    .map(node => $(node).html() || '')
    .join('\n');

  const hasTitleSetter = SETTERS.VideoTitle.test(scripts);
  SETTERS.VideoTitle.lastIndex = 0;

  // id 一律以地址里的 eid 为准：**不能按 DOM 取**。
  // 详情页末尾那片「相关推荐」同样是 div.thumb-block，
  // 取文档里第一个会把邻座那条的 id 当成这一条的，收藏/历史/去重会全部错位。
  const id =
    eidFromUrl(url) ||
    SETTERS.EncodedIdVideo.exec(scripts)?.[1] ||
    url.replace(/\/+$/, '').split('/').pop() ||
    '';

  const title = normalizeText(
    decodeEntities(SETTERS.VideoTitle.exec(scripts)?.[1]) || $('h1').first().text(),
  );

  const image = resolveUrl(
    url,
    pickImage(
      SETTERS.ThumbUrl.exec(scripts)?.[1],
      $('meta[property="og:image"]').attr('content'),
    ),
  );

  const uploader = normalizeText(decodeEntities(SETTERS.UploaderName.exec(scripts)?.[1]));

  const tags = Array.from(
    new Set(
      $('a[href*="/tags/"]')
        .toArray()
        .map(node => $(node).text())
        .map(text => normalizeText(text))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  const synopsis = normalizeText($('.description, .video-description').first().text());

  // XVideos 是单视频站，没有剧集结构，不返回 episodesLink（需求文档第五章）。
  const linkList = [
    {
      title: title || SITE_NAME,
      quality: 'auto',
      directLinks: [{ title: title || SITE_NAME, link: url, type: 'movie' as const }],
    },
  ];

  if (!hasTitleSetter && !title) {
    throw new ProviderFailure(
      'parse',
      'xvideos getMeta: page did not contain recognisable player configuration',
    );
  }

  return {
    title: title || SITE_NAME,
    synopsis,
    image,
    type: 'movie',
    // Vega 用 imdbId 做 Cinemeta 增强，这些站点没有，保持未设置。
    webUrl: url,
    tags: tags.length ? tags : uploader ? [uploader] : [],
    cast: uploader ? [uploader] : undefined,
    linkList,
  };
};