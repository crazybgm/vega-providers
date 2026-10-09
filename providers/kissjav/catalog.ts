export const catalog = [
  {title: 'KissJAV 最新更新', filter: 'latest'},
];

/**
 * 站点没有排行页，所以只有「最新」这一栏。
 * 不要用首页冒充热度榜（见需求文档第五章）。
 * 分类需要经 `genres`/catalog 的 filter 进入 `/categories/{slug}/`，
 * Vega 在没有可用分类时不显示分类栏，因此这里不列伪分类。
 */
export const genres: {title: string; filter: string}[] = [];