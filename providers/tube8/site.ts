export const SITE_ID = 'tube8';
export const SITE_NAME = 'Tube8';
export const DEFAULT_BASE = 'https://www.tube8.com';
export const PROVIDER_VERSION = '1.0.0';

/** 卡片容器。多Video 实测同一页里推荐位与「最新」位会重复，必须按 ID 去重。 */
export const CARD = 'article.video-box[data-video-id]';
export const CARD_IMAGE = 'img.thumb-image';
export const CARD_DURATION = '.video-duration span, .video-duration';

/** 真实卡片地址带 slug（`/porn-video/29489375/some-title/`），也可能只有数字，两种都要认。 */
export const VIDEO_ID = /\/porn-video\/(\d+)(?:\/[^/]*)?\/?/;

export const CATEGORY_PATH = /\/cat\/([a-z0-9_-]+)/i;

/**
 * 2026-10 实测补充（与 MultiVideo 2026-09-26 记录的差异）：
 * - 裸域 `tube8.com` 会 302 到 `tube8.es`；部分路径在重定向后连接失败。
 * - `/top.html/`、`/categories.html/` 曾返回 200，随后连续多次失败。
 * 判定为站点侧间歇性故障，因此本 Provider 对列表失败如实抛错，不伪造空结果。
 */
export function numericIdFromUrl(url: string): string | null {
  return VIDEO_ID.exec(url)?.[1] ?? null;
}