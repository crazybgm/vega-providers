/**
 * 站点首页是运营推荐位、自身不给翻页，所以首页只有第 1 页。
 * 深度浏览走 `/c/{Name}-{id}` 分类与搜索（见 posts.ts）。
 *
 * 这里只列一个可翻页的入口，避免出现「第 2 页恒空」的栏目。
 */
export const catalog = [{title: 'XVideos 推荐', filter: 'home'}];

export const genres: {title: string; filter: string}[] = [];