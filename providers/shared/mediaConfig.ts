/**
 * Aylo 系站点（RedTube / YouPorn / Tube8 共用）的播放器配置解析。
 *
 * 移植自 MultiVideo `core/MediaConfig.kt`，其 2026-09-26 真机实测结论：
 * 一条媒体定义现在长这样
 *   `{"format":"hls","videoUrl":"…","remote":true,"segmentFormats":{"video":"fmp4","audio":"aac"}}`
 * ——条目内部**嵌了子对象**，所以「找一段不含花括号的 `{…}`」这种切法整片失效。
 * 因此这里以 `videoUrl` 为锚点、在它前后各取一小段窗口认字段，不依赖花括号是否配对。
 *
 * 另外站点不保证字段顺序（页面里 format 在前，网关返回的清晰度数组里 quality 在后），
 * 所以取**离锚点最近**的那个，否则会把下一条的字段安到这一条头上。
 */

const WINDOW = 320;
const MAX_URL_LENGTH = 2048;

const VIDEO_URL = /"videoUrl"\s*:\s*"([^"]+)"/g;
const FORMAT = /"format"\s*:\s*"([^"]+)"/g;
const QUALITY = /"quality"\s*:\s*"?(\d{2,4})"?/g;

export interface MediaEntry {
  url: string;
  format: string | null;
  quality: number | null;
}

function nearestValue(
  source: string,
  key: RegExp,
  anchorStart: number,
  anchorEnd: number,
): string | null {
  const before = source.slice(Math.max(0, anchorStart - WINDOW), anchorStart);
  const after = source.slice(anchorEnd, Math.min(source.length, anchorEnd + WINDOW));

  key.lastIndex = 0;
  let lastBefore: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = key.exec(before)) !== null) lastBefore = m;

  key.lastIndex = 0;
  const firstAfter = key.exec(after);

  const backwardDistance = lastBefore ? before.length - (lastBefore.index + lastBefore[0].length) : Number.MAX_SAFE_INTEGER;
  const forwardDistance = firstAfter ? firstAfter.index : Number.MAX_SAFE_INTEGER;

  const chosen = backwardDistance <= forwardDistance ? lastBefore : firstAfter;
  return chosen?.[1] ?? null;
}

export function parseMediaEntries(blob: string): MediaEntry[] {
  if (!blob) return [];
  const normalized = blob.replace(/\\\//g, '/');
  const result: MediaEntry[] = [];
  const seen = new Set<string>();

  VIDEO_URL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VIDEO_URL.exec(normalized)) !== null) {
    const url = match[1];
    if (!url || url.length > MAX_URL_LENGTH) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const anchorStart = match.index;
    const anchorEnd = anchorStart + match[0].length;

    result.push({
      url,
      format: nearestValue(normalized, FORMAT, anchorStart, anchorEnd),
      quality: (() => {
        const raw = nearestValue(normalized, QUALITY, anchorStart, anchorEnd);
        const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : null;
      })(),
    });
  }

  return result;
}

/** 网关地址 + 站点声明的格式；没写 format 的条目按「不是媒体定义」丢掉。 */
export function parseMediaGateways(blob: string): { url: string; format: string }[] {
  const result: { url: string; format: string }[] = [];
  const seen = new Set<string>();
  for (const entry of parseMediaEntries(blob)) {
    if (!entry.format || seen.has(entry.url)) continue;
    seen.add(entry.url);
    result.push({ url: entry.url, format: entry.format });
  }
  return result;
}

/** 清晰度数组：`(清晰度, 真实地址)`，缺清晰度的条目不参与排序。 */
export function parseMediaQualities(blob: string): { quality: number; url: string }[] {
  const result: { quality: number; url: string }[] = [];
  const seen = new Set<string>();
  for (const entry of parseMediaEntries(blob)) {
    if (entry.quality === null || seen.has(entry.url)) continue;
    seen.add(entry.url);
    result.push({ quality: entry.quality, url: entry.url });
  }
  return result;
}