export const SITE_ID = 'youporn';
export const SITE_NAME = 'YouPorn';
export const DEFAULT_BASE = 'https://www.youporn.com';
export const PROVIDER_VERSION = '1.0.0';

export const CARD = 'article.video-box[data-video-id]';

/**
 * `/watch/` 后面的**路径段**纯数字，与卡片 `data-video-id` 相等。
 * 按路径段取而不是整串正则：外站搜索回来的地址常带 `?utm_source=…`。
 */
export function numericIdFromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  const match = /\/watch\/(\d+)/.exec(path);
  return match?.[1] ?? null;
}

export function videoUrlFromRef(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${DEFAULT_BASE}${ref.startsWith('/') ? '' : '/'}${ref}`;
}