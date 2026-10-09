export const SITE_ID = 'kissjav';
export const SITE_NAME = 'KissJAV';
export const DEFAULT_BASE = 'https://kissjav.li';

/**
 * 列表卡片。
 *
 * 实测（2026-10）：真实 class 是 `thumb thumb_rel item `（尾随空格 + 多个修饰类），
 * 不是简单的 `thumb item`。用 class 包含判定比精确相等更稳。
 */
export const CARD = 'div.thumb.item';

/**
 * 从路径段里取 id（**不要**用 `/(\d{4,})/?$/` 啃整串）。
 *
 * 原因（真机实测 2026-09-26）：卡片上的 `data-video-id` 经常是空的，
 * 若退回「路径末段」，同一部片子在列表里是韩文 slug、在详情里是 `838138`，
 * 两边永远对不上 → 收藏图标不亮、历史出现两行。
 * 外站搜索回来的地址还常带 `?utm_source=…`，带 `$` 的正则同样会落空。
 */
export function numericIdFromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  const match = /\/video\/(\d+)/.exec(path);
  if (match?.[1]) return match[1];
  const tail = path.replace(/\/+$/, '').split('/').pop();
  // 末段兜底也要求「纯数字」，否则 sdde-123 这类 slug 会被当成 id。
  return tail && /^\d{4,}$/.test(tail) ? tail : null;
}

export function videoUrlFromRef(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${DEFAULT_BASE}${ref.startsWith('/') ? '' : '/'}${ref}`;
}

/**
 * flashvars 对象字面量里的字段。值是 **base64**，解码后才是真实 mp4 地址。
 * `MQ==` 是 base64 的 "1"，表示「没有更高画质」，不是地址。
 *
 * 真实形态是 `video_url: '…'`（冒号后有空格），所以 \s* 不能省。
 */
export const FLASHVARS = {
  videoUrl: /video_url['"]?\s*:\s*['"]([A-Za-z0-9+/=]+)['"]/,
  videoUrlHd: /video_url_hd['"]?\s*:\s*['"]([A-Za-z0-9+/=]+)['"]/,
  title: /video_title['"]?\s*:\s*['"]([^'"]+)['"]/,
  previewUrl: /preview_url['"]?\s*:\s*['"]([^'"]+)['"]/,
} as const;

/** base64 占位值：解码后等于 "1"，不是媒体地址。 */
export const BITS_PLACEHOLDER = 'MQ==';