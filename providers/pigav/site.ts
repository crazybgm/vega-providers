export const SITE_ID = 'pigav';
export const SITE_NAME = 'PIGAV';
export const DEFAULT_BASE = 'https://pigav.com';
export const PROVIDER_VERSION = '1.0.0';

/**
 * PIGAV 是 **PeerTube 实例**（`/api/v1/config/about` 自报「PIGAV 朱古力」）。
 *
 * 所以这里走站点的公开 REST API，而不是抓 DOM：
 * 站点自己的前端也只是这套 API 的消费者，抓 DOM 反而更容易被改版打坏。
 *
 * 实测（2026-09-27）：`/api/v1/videos` 直出 JSON（total 58570）。
 */
export const API = {
  videos: '/api/v1/videos',
  search: '/api/v1/search/videos',
  categories: '/api/v1/videos/categories',
  video: (uuid: string) => `/api/v1/videos/${uuid}`,
} as const;

export const PAGE_SIZE = 24;

/** 唯一标识是 uuid，详情页/embed/裸 uuid 都能取到。 */
export function uuidFromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  const match = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(path);
  return match?.[1] ?? null;
}

export function videoUrlFromRef(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${DEFAULT_BASE}${ref.startsWith('/') ? '' : '/'}${ref}`;
}