/**
 * 只列**实测可用**的入口。
 *
 * 2026-10 实测：
 *   /popular  → 200，能解析出 100+ 条卡片
 *   /new      → 403
 *   /rating   → 403
 *
 * 这两个分区疑似需要登录或有额外防护，静态抓取拿不到。
 * 与其列出来让用户点进空栏目，不如不列——Vega 会为每个 catalog 项显示一栏。
 * 另外，站点真正的核心功能是**搜索**，搜索入口由 Vega 的搜索功能提供，
 * 不需要在这里占位。
 */
export const catalog = [{title: 'PornMD 热门', filter: 'popular'}];

export const genres: {title: string; filter: string}[] = [];