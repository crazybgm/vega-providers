export const SITE_ID = 'xvideos';
export const SITE_NAME = 'XVideos';
export const DEFAULT_BASE = 'https://www.xvideos.com';
export const PROVIDER_VERSION = '1.0.0';

/**
 * 详情地址里视频 id 那一段固定以它开头（`/video.<eid>/…`）。
 *
 * MultiVideo 实测（2026-09-28 真机读库）：列表卡片通常有 `div.thumb-block[data-id]`，
 * 详情页里经常没有。若按 DOM 属性取 id，同一条视频在网格与详情里会算成两条，
 * 表现为「从搜索点进详情收藏后，回到网格那张卡仍然没有 ♥」。
 * eid 是唯一「地址里就有、与 DOM 无关」的标识，所以统一用它。
 */
export const VIDEO_PREFIX = 'video.';

/** 站点把数据放在 html5player.setXxx('…') 调用里。JS 字符串里不会出现未转义引号。 */
export const SETTERS = {
  EncodedIdVideo: /setEncodedIdVideo\('([^']*)'\)/,
  VideoTitle: /setVideoTitle\('([^']*)'\)/,
  ThumbUrl: /setThumbUrl\('([^']*)'\)/,
  UploaderName: /setUploaderName\('([^']*)'\)/,
  VideoHLS: /setVideoHLS\('([^']*)'\)/,
  VideoUrlHigh: /setVideoUrlHigh\('([^']*)'\)/,
  VideoUrlLow: /setVideoUrlLow\('([^']*)'\)/,
} as const;

/**
 * 地址里 `/video.<eid>/…` 那一段的 eid；没有就返回 null。
 *
 * 实测出现过两种形状，第一种是常态：
 *   /video.vfbhbfcf9f/fucking_glasses_…
 *   /video.omckudbd1ae/55796671/0/una_ninera_…
 * 第二种里第二段那个纯数字不是站点给的 id（第一段的 eid 才是），
 * 所以只认「以 `video.` 开头的那一段」。
 */
export function eidFromUrl(url: string): string | null {
  const match = /\/(video\.[^/?#]+)/.exec(url);
  const raw = match?.[1];
  if (!raw) return null;
  const eid = raw.slice(VIDEO_PREFIX.length);
  return eid || null;
}