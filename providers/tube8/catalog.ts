/**
 * Tube8 是本次核查中唯一实测存在排行页（`/top/page/{N}/`）的站点，
 * 所以可以列「热门排行」；不要把这份热度用在其余站点上。
 *
 * `categories` 索引页不是视频列表，因此不在 catalog 里列它
 * （Vega 会在首页为每个 filter 显示一栏，列出它会得到一个恒空的栏目）。
 */
export const catalog = [
  {title: 'Tube8 热门排行', filter: 'top'},
  {title: 'Tube8 最新视频', filter: 'newest'},
];

export const genres: {title: string; filter: string}[] = [];