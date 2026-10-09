export const SITE_ID = 'sexbjcam';
export const SITE_NAME = 'SexBJCam';
export const DEFAULT_BASE = 'https://sexbjcam.com';
export const PROVIDER_VERSION = '1.0.0';

/**
 * 播放入口在第三方 embed 域 `recordplay.biz` 上，
 * 所以 Stream 的 server 标成 embed 域名，如实反映来源。
 */
export const EMBED_BASE = 'https://recordplay.biz';

export const CARD = 'article.loop-video, article[data-video-id]';

/**
 * 唯一标识取详情地址末段的 slug（实测形如
 * `…/2026/09/26/kbj26092657_jubin777_20260816/`）。
 *
 * 列表卡片 href 与详情 URL 用同一个 slug，两边天然对齐。
 */
export function slugFromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  const tail = path.replace(/\/+$/, '').split('/').pop();
  if (!tail || tail.length < 4 || tail.length > 120) return null;
  return /^[A-Za-z0-9_-]+$/.test(tail) ? tail : null;
}

export function videoUrlFromRef(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${DEFAULT_BASE}${ref.startsWith('/') ? '' : '/'}${ref}`;
}