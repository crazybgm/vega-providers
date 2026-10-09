export const SITE_ID = 'redtube';
export const SITE_NAME = 'RedTube';
export const DEFAULT_BASE = 'https://www.redtube.com';
export const PROVIDER_VERSION = '1.0.0';

export const CARD = 'li.thumbnail-card[data-video-id]';

/**
 * 详情地址末段的纯数字（≥4 位）。`/103634591` 与 `/103634591/` 都认。
 * 卡片上的 `data-video-id` 与它相等，可以直接用。
 *
 * 按**路径段**取，不按整串正则——外部搜索回来的地址常带 `?utm_source=…`。
 */
export function numericIdFromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  const tail = path.replace(/\/+$/, '').split('/').pop();
  return tail && /^\d{4,}$/.test(tail) ? tail : null;
}

export function videoUrlFromRef(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${DEFAULT_BASE}${ref.startsWith('/') ? '' : '/'}${ref}`;
}