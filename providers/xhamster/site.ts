export const SITE_ID = 'xhamster';
export const SITE_NAME = 'xHamster';
export const DEFAULT_BASE = 'https://xhamster.com';
export const PROVIDER_VERSION = '1.0.0';

/**
 * 卡片只认 `--type-video`。同一页里还有 `video-thumb--type-moment` 短片，
 * 一起取会把短片混进视频列表。
 */
export const CARD = 'div.video-thumb--type-video[data-video-id]';

/**
 * 唯一标识取地址末段的**短码**（`…-xhoIcu3`）。
 *
 * 真机读库结论：页面上那个数字 id（27599547）**在地址里根本不存在**，
 * 若取它，「从外站搜到」与「自己浏览到」会永远算成两条。
 * 也不能取整段——整段带标题，站点一改名 id 就变。
 */
export function slugCodeFromUrl(url: string): string | null {
  const path = url.split('?')[0].split('#')[0];
  const tail = path.replace(/\/+$/, '').split('/').pop();
  if (!tail || tail.length < 4 || tail.length > 120) return null;
  const dash = tail.lastIndexOf('-');
  const code = dash >= 0 ? tail.slice(dash + 1) : tail;
  return code || null;
}

export function videoUrlFromRef(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  return `${DEFAULT_BASE}${ref.startsWith('/') ? '' : '/'}${ref}`;
}