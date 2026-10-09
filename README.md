# Vega 片源扩展（简体中文站点适配）

本仓库是 **Vega 官方 Provider 扩展**的独立项目，与主应用分开管理、分开测试、分开发布。

## 当前片源

| 片源 | providerValue | 列表 | 详情 | 播放源 | 下载 |
|---|---|---|---|---|---|
| XVideos | `xvideos` | ✅ | ✅ | 3 条（HLS + MP4×2） | ✅ |
| Tube8 | `tube8` | ✅ | ✅ | 4 条 | ✅ |
| KissJAV | `kissjav` | ✅ | ✅ | 1 条（MP4 直链） | ✅ |
| RedTube | `redtube` | ✅ | ✅ | 4 条（HLS + MP4） | ✅ |
| YouPorn | `youporn` | ✅ | ✅ | 4 条（HLS + MP4） | ✅ |
| xHamster | `xhamster` | ✅ | ✅ | 1 条（仅 HLS） | ❌ 见下 |
| PIGAV | `pigav` | ✅ | ✅ | 2 条（HLS + MP4） | ✅ |
| SexBJCam | `sexbjcam` | ✅ | ✅ | 最多 3 条（仅 HLS） | ❌ 见下 |
| PornMD | `pornmd` | ✅ | ✅ | 按源站分流，见下 | 视源站 |

### PornMD：跨站聚合搜索（与其他 8 个不同）

PornMD 自己**不托管视频**，它把各站结果汇到一起，每条给一个
`/out/?l=<base64>` 跳转链接。所以它没有详情页，也没有自己的播放器；
播放地址来自**原始站点**。

实测源站分布（230 条可解结果）：

| 源站 | 条数 | 占比 | 是否实现 |
|---|---|---|---|
| `www.eporner.com` | 154 | 67% | ✅ |
| `xh.partners` | 34 | 15% | ✅ |
| `xgroovy.com` | 6 | 3% | ❌ |
| 其余 18 个站 | 各 1~2 | ~15% | ❌ |

只实现前两个（合计 82%）。其余源站会明确报
`source site "xxx" is not supported yet`——**不猜地址**，
猜出来的地址只会让播放失败更难排查。

`/new` 与 `/rating` 实测 403（疑似需登录），因此未作为入口暴露。

「下载」列为 ❌ 的两项是**站点能力限制**，不是实现缺失：

- **xHamster**：明文只有 HLS 清单；`xplayerSettings.sources` 是加密十六进制、需用页面里的 `pk` 解密。**本项目不解密**——那是站点的访问控制机制。MP4 直链与 `/movies/…/download/` 服务端均返回 403。
- **SexBJCam**：站点只提供 HLS 多清晰度清单，没有整文件 MP4。

## 合规边界（重要）

迁移过程中**刻意没有**从 MultiVideo 搬以下机制：

| 未迁移 | 原因 |
|---|---|
| `BrowserSession`（常驻 WebView 自动取页） | 属于绕过站点反爬的自动化手段 |
| 验证通过后自动继续 | 同上；改为用 `openWebView` 让**用户自己**完成验证 |
| `CookieStore` 持久化会话 | 不代用户保管站点凭据 |
| xHamster 加密源解密 | 站点明确的访问控制机制 |
| `JsPacker` 的 eval 执行 | 只做**纯字符串还原**，不执行页面脚本 |

Provider 沙盒内只使用官方允许的 `axios` / `cheerio` / `commonHeaders` 等能力。

## 开发

```powershell
npm install
npm run build                 # 打包 providers/* → dist/<value>/*.js
npm test -- <providerValue>   # 端到端测试单个片源
```

出网需要系统代理时（本机为 `127.0.0.1:7890`）：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
```

注意：必须写 **字面量 IP**，不能写 `localhost`——代理只监听 IPv4，而 `localhost` 在本机会解析到 `::1`，导致连接失败。

## 目录结构

```
providers/
  shared/                 共用工具（所有片源共享，不单独打包）
    common.ts             失败分类、验证页判定、请求包装、base64 解码、JSON 取用
    mediaConfig.ts        Aylo 系媒体定义解析（videoUrl 锚点 + 320 字符窗口）
    ayloStream.ts         Aylo 系（RedTube / YouPorn / Tube8）网关二次解析
  <providerValue>/
    site.ts               站点常量、id 提取、URL 归一化
    catalog.ts            栏目定义
    posts.ts              getPosts / getSearchPosts
    meta.ts               getMeta
    stream.ts             getStream
    jsPacker.ts           （仅 sexbjcam）Dean Edwards 压缩包纯 JS 还原
  pornmd/                跨站聚合：/out/?l= 的 base64 二进制解码在 site.ts
tests/
  provider-test-context.js 沙盒环境模拟
  test-providers.js        端到端测试入口
```

## 各站点的关键实现要点

这些都是实测踩出来的，改动时请勿「顺手简化」：

### 通用

1. **一律按路径段取 id**，不要用 `/(\d{4,})/?$/` 啃整串 URL——外部搜索回来的地址常带 `?utm_source=…`，带 `$` 的正则必落空，会导致收藏与历史里同一部片出现两条。
2. `<script>` 内容必须用 `.html()` 取，`text()` 会跳过 script 标签。
3. 时长角标常混入前缀（实测见过「4K 02:07」「PT 14:47」），**只取时钟片段**。
4. 播放地址多带时效签名 → **不缓存**，每次播放重新解析。
5. 「页面在但 0 卡片」≠ 没有内容，要报「结构变了/验证页」，不能静默返回空。
6. 列表与详情**必须共用同一个 id 函数**，否则同一部片会被算成两条。

### KissJAV

- `flashvars` 里的 `video_url` / `video_url_hd` 是 **base64**，解码后才是地址。沙盒无 `Buffer`，用纯 JS 解码。
- `video_url_hd == "MQ=="` 是 base64 的 `"1"`，表示「没有高清」，**不是地址**。
- 真实地址形如 `…/853691.mp4/?br=675`——扩展名与 `?` 之间还有一个 `/`，只按 `\.mp4(\?|$)` 匹配会整条丢掉。
- 卡片真实 class 是 `thumb thumb_rel item`；封面真实地址在 `data-original` / `data-webp`（`src` 是 base64 占位 gif）。

### xHamster

- 唯一标识取地址末段**短码**（`…-xhoIcu3`）。页面上的数字 id（如 `27599547`）**在 URL 里根本不存在**，取它会让「外站搜到」与「自己浏览到」永远算两条。
- 卡片只认 `div.video-thumb--type-video`，别把 `--type-moment` 短片混进来。
- 卡片 href 是绝对地址，比较路径前要归一化。

### RedTube / YouPorn（Aylo 系）

- 网关地址必须**二次请求**才能拿到清晰度数组。
- **MP4 直链必须带 `Referer=详情页`**，否则站点回 410 Gone；HLS 不要求。
- 搜索零结果是 **HTTP 404，但 404 页里仍有推荐卡片** → 只能按 HTTP 状态判空，按卡片数会把推荐当搜索结果。
- 分类只认 `#video_tags_carousel a.video_carousel_category` / `div.js_categoriesWrapper`，按路径全取会把页头导航当成本片分类，下载目录会跟着错。

### PIGAV

- 是 **PeerTube 实例**，走公开 REST API 比抓 DOM 更稳。
- 分页用 `start` / `count`，不是页码。
- 搜索零结果是 **200 + 空数组**（与 Aylo 系相反）。
- 播放地址**只在详情接口**给；联邦视频在 `streamingPlaylists`，本地上传在顶层 `files`，**两处都要认**，否则换个来源的视频整条不可播。

### SexBJCam

- 压缩包还原的关键：`eval` 后紧跟的是**函数参数括号**，载荷在**函数体之后**；词典是独立参数（`radix, count, 'w1|w2|…'`），不是载荷自身。
- 替换必须**从大到小**，否则低编号的两位数词会被词边界先吃掉。
- HLS 按**编号从大到小**取，不要按扩展名挑。`.txt` 扩展名没问题——CDN 返回 `Content-Type: application/vnd.apple.mpegurl`，播放器按 type 建源。
- Vega 会把 `getMeta` 里 `directLinks` 的地址回传给 `getStream`，而这里放的是 **embed 地址**（详情页没有 `<video>`），所以 `getStream` 两种入口都要认。

## 测试结果

| 片源 | 列表 | 详情 | 播放源 | 结论 |
|---|---|---|---|---|
| xvideos | 48 条 | ✅ | 3 条 | PASSED |
| tube8 | 28 条 | ✅ | 4 条 | PASSED |
| kissjav | 30 条 | ✅ | 1 条（MP4 直链） | PASSED |
| redtube | 71 条 | ✅ | 4 条（720/480） | PASSED |
| youporn | 68 条 | ✅ | 4 条（1080/720） | PASSED |
| xhamster | 54 条 | ✅ | 1 条 | PASSED |
| pigav | 24 条 | ✅ | 2 条（HLS + 1080） | PASSED |
| sexbjcam | 40 条 | ✅ | 1 条 | 间歇（站点波动，见下） |
| pornmd | 109 条（搜索 115） | ✅ | 5/5（在已实现源站上） | PASSED |

### 需要说明的测试状态

1. **SexBJCam 站点本身不稳定**。列表解析始终正常（40 条），播放源也成功取到过
   （1 条 HLS，实测 HTTP 200），但它与自己的 embed/CDN `playrecord.biz` 是两套
   独立可用性——出现过「站点 200 而 embed 连不上」。开发全程它在 200 / 403 / 502 / 000
   之间波动，限流还会按站点轮转。这是站点侧行为，不是 Provider 代码缺陷。
   详见 `../docs/site-availability.md`。

2. **PornMD 的 HLS 排序结论已被实测推翻**（与早先的参考卡相反）。
   实测 `hls2` 返回 200（站点主源）、`hls3` 返回 404（失效备用），
   所以不能按编号降序取。现改为**逐条探测可用性**，只保留响应 2xx/3xx 的地址。
   连续 3 次运行均返回 `HLS 2` 且实测 200。

3. **PornMD 的播放源按源站分流**，只有 eporner 与 xh.partners 已实现
   （合计覆盖 82%）。未实现的源站会明确报「尚未支持」，这是设计行为，不是缺陷。

## 与官方模板的关系

本仓库基于官方 `providers-template`（基线提交 `7e1a577`，已移除示例 provider），
按官方 Provider 契约实现，**未修改** Vega 主应用的加载器、沙盒或 Provider 接口。
