/**
 * 跨 Provider 共用的纯函数工具。
 *
 * 这里只放不依赖沙盒注入（axios / cheerio / kvStore）的逻辑：
 * URL 规范化、HTML 实体解码、正则取值、错误分类。
 * 任何用到 providerContext 的东西都必须留在各站自己的模块里。
 */

export const DEFAULT_TIMEOUT_MS = 15000;

/** Provider 侧统一的失败分类，用于给用户可诊断的提示。 */
export type FailureKind =
  | 'network'
  | 'http-status'
  | 'not-found'
  | 'challenge'
  | 'unavailable'
  | 'parse'
  | 'unsupported';

export class ProviderFailure extends Error {
  readonly kind: FailureKind;

  constructor(kind: FailureKind, message: string) {
    super(message);
    this.name = 'ProviderFailure';
    this.kind = kind;
  }
}

/**
 * 常见的反爬/验证页特征。命中即判定为「站点要求人工验证」，
 * 不再往下解析，避免把验证页当成有效内容（需求文档第七章）。
 *
 * 只收「结构性」特征。裸的 `captcha` 不能收：
 * Tube8 正常列表页的配置里就有 `GRECAPTCHA` 这个可选功能键名，
 * 按字面匹配会把可用页面全部误判成验证页。
 */
const CHALLENGE_MARKERS = [
  'just a moment',
  'checking your browser before accessing',
  'cf-browser-verification',
  'challenge-platform',
  'cf_chl_opt',
  'attention required! | cloudflare',
  'enable javascript and cookies to continue',
  '请开启javascript',
  '人机验证',
  '请输入验证码',
  // 整页就是验证表单时才会出现的标记
  'g-recaptcha-response',
  'cf-turnstile',
  'id="captcha"',
];

/**
 * 只有当页面**没有正常的媒体列表结构**时，验证页判定才成立。
 * 这样站点自己页面里出现的验证相关字样不会造成误判。
 */
export function looksLikeChallengePage(html: string, hasRealContent?: boolean): boolean {
  if (!html) return false;
  if (hasRealContent) return false;
  const head = html.slice(0, 20000).toLowerCase();
  return CHALLENGE_MARKERS.some(marker => head.includes(marker));
}

/**
 * HTML 实体解码。站点常把标题二次转义后塞进 JS 字符串，
 * 直接取正则原文会得到一串实体码（MultiVideo 实测遇到过，需显式解一次）。
 *
 * 只解文本；URL 字段不要走这里，否则会改坏签名参数。
 */
export function decodeEntities(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeCodePoint(parseInt(code, 16)));
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** 规范化空白：折叠连续空白并去掉首尾空格。 */
export function normalizeText(input: string | undefined | null): string {
  if (!input) return '';
  return decodeEntities(input).replace(/\s+/g, ' ').trim();
}

/** 站点原名保持原样，不要被 decodeEntities 之外的规则改动。 */
export function firstNonBlank(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    if (value && value.trim()) return value;
  }
  return '';
}

/** 取第一个非 data: 占位图的图片地址。 */
export function pickImage(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    if (value && value.trim() && !value.trim().startsWith('data:')) return value.trim();
  }
  return '';
}

/** 把相对地址补成绝对地址；已经是绝对地址或无法解析时返回原值。 */
export function resolveUrl(base: string, href: string | undefined | null): string {
  if (!href) return '';
  const value = href.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

/**
 * 用正则从文本里取值，取不到返回 undefined。
 * 站点把数据放在 html5player.setXxx('…') 这类调用里时使用。
 */
export function matchValue(
  source: string,
  pattern: RegExp,
  group = 1,
): string | undefined {
  const match = pattern.exec(source);
  const value = match?.[group];
  return value && value.trim() ? value : undefined;
}

/** 只允许 http/https，避免把 javascript: 等伪协议交给播放器。 */
export function isPlayableUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/**
 * base64 → UTF-8 文本。
 *
 * 沙盒里没有 Node 的 Buffer，也没有 Buffer.from，所以手写解码。
 * 站点常用 base64 藏地址（KissJAV 的 flashvars 就是）。
 */
export function decodeBase64Utf8(input: string): string {
  const value = input.trim().replace(/\s+/g, '');
  if (!value || /[^A-Za-z0-9+/=]/.test(value)) return '';

  try {
    const binary =
      typeof atob === 'function'
        ? atob(value)
        : manualAtob(value);
    if (typeof TextDecoder !== 'undefined') {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
    // 兜底：地址与标题基本都是 ASCII，按 latin1 还原即可。
    let escaped = '';
    for (let i = 0; i < binary.length; i += 1) {
      escaped += `%${`00${binary.charCodeAt(i).toString(16)}`.slice(-2)}`;
    }
    return decodeURIComponent(escaped);
  } catch {
    return '';
  }
}

function manualAtob(value: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    if (char === '=') break;
    const index = chars.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * 判断媒体地址是否带时效签名。多Video 站点普遍如此，
 * 过期后必须重新解析才能拿到新地址（见需求文档第七/十章）。
 */
export function hasExpirySignature(url: string): boolean {
  return /,\d{9,13}(?:\?|$|&|,)/.test(url) || /[?&]secure=/i.test(url) || /[?&]token=/i.test(url);
}

/**
 * 统一的 axios 调用包装：超时、取消、失败分类。
 *
 * 502/503/504 这类**上游临时错误**会重试一次：实测站点本身是 200，
 * 偶发 502 来自链路而非站点，重试一次即可拿到正确结果。
 * 4xx 不重试——重试既救不回来又会加重对方负担。
 */
export async function request<T = string>(
  provider: string,
  operation: string,
  run: () => Promise<{ data: T; status?: number }>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new ProviderFailure('network', `${provider} ${operation} cancelled`);
  }

  // 只对 502/503/504 与无响应的网络抖动重试一次。
  const TRANSIENT = [502, 503, 504];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await run();
      const status = response.status ?? 200;
      if (status === 404) {
        throw new ProviderFailure('not-found', `${provider} ${operation}: content not found (HTTP 404)`);
      }
      if (status < 200 || status >= 300) {
        throw new ProviderFailure('http-status', `${provider} ${operation}: unexpected HTTP ${status}`);
      }
      return response.data;
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      if (signal?.aborted) {
        throw new ProviderFailure('network', `${provider} ${operation} cancelled`);
      }
      const status = (error as { response?: { status?: number } })?.response?.status;
      // 还有重试机会，且是上游临时错误 → 再试一次。
      if (attempt === 0 && (status === undefined || TRANSIENT.includes(status))) {
        continue;
      }
      if (status !== undefined) {
        throw new ProviderFailure('http-status', `${provider} ${operation}: HTTP ${status}`);
      }
      throw new ProviderFailure('network', `${provider} ${operation}: network error`);
    }
  }

  // 两轮都没拿到结果：只可能是异常路径走到这里。
  throw new ProviderFailure('network', `${provider} ${operation}: request failed`);
}

/**
 * 取 HTML 文本，并在拿到内容后立刻做验证页判定。
 * 命中验证页时给出明确失败，而不是把空壳页面解析成空结果。
 *
 * `hasRealContent` 由调用方在解析后回填：站点页面里出现验证相关字样并不等于
 * 这是一次验证（Tube8 的正常列表页就带 GRECAPTCHA 功能键名），所以只有
 * 「确实没解析出任何条目」时才按验证页处理。
 */
export async function fetchHtml(
  provider: string,
  operation: string,
  url: string,
  run: () => Promise<{ data: unknown; status?: number }>,
  signal?: AbortSignal,
): Promise<string> {
  let raw: unknown;
  try {
    raw = await request<unknown>(provider, operation, run, signal);
  } catch (error) {
    throw error;
  }

  const html = typeof raw === 'string' ? raw : String(raw ?? '');
  if (!html.trim()) {
    throw new ProviderFailure('parse', `${provider} ${operation}: empty response`);
  }
  if (looksLikeChallengePage(html)) {
    throw new ProviderFailure(
      'challenge',
      `${provider} ${operation}: site returned a verification page`,
    );
  }
  return html;
}

/**
 * 取 JSON（PeerTube 类 API）。
 *
 * 必须区分三件事，不能一律报「解析失败」：
 * 1. 站点把 API 请求挡回了一个 HTML 页面（Cloudflare 常见）
 * 2. 那个 HTML 恰好是**验证页** → 明确提示用户手动过验证
 * 3. 真的是非法 JSON → 解析错误
 */
export async function fetchJson<T>(
  provider: string,
  operation: string,
  run: () => Promise<{ data: unknown; status?: number }>,
  signal?: AbortSignal,
): Promise<T> {
  const data = await request<unknown>(provider, operation, run, signal);

  if (typeof data === 'string') {
    const text = data.trimStart();
    const looksHtml = text.startsWith('<') || text.includes('<!DOCTYPE html');
    if (looksHtml) {
      if (looksLikeChallengePage(text)) {
        throw new ProviderFailure(
          'challenge',
          `${provider} ${operation}: the site blocked the API request with a verification page`,
        );
      }
      throw new ProviderFailure(
        'parse',
        `${provider} ${operation}: the site returned HTML instead of JSON (request blocked)`,
      );
    }
    try {
      return JSON.parse(data) as T;
    } catch {
      throw new ProviderFailure('parse', `${provider} ${operation}: response is not valid JSON`);
    }
  }

  return data as T;
}

/** 空结果时再判一次验证页：列表/搜索拿不到任何条目时，区分
 * 「搜索确实没结果」和「被验证页挡住了」。两种都返回 false 时调用方自己决定。
 */
export function asChallengeOrEmpty(
  provider: string,
  operation: string,
  html: string,
  parsedCount: number,
): never | null {
  if (parsedCount > 0) return null;
  if (looksLikeChallengePage(html)) {
    throw new ProviderFailure(
      'challenge',
      `${provider} ${operation}: site returned a verification page`,
    );
  }
  return null;
}