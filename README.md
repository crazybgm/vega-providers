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
| tube8 | 36 条 | ✅ | 4 条 | PASSED |
| kissjav | 30 条 | ✅ | 1 条（904Kbps） | PASSED |
| redtube | ✅ | ✅ | 4 条（720/480） | PASSED |
| youporn | ✅ | ✅ | 4 条（1080/720） | PASSED |
| xhamster | ✅ | ✅ | 1 条 | PASSED |
| pigav | ✅ | ✅ | 2 条（HLS + 1080） | PASSED |
| sexbjcam | 40 条 | ✅ | 2 条 | PASSED（站点间歇 502，见下） |

### 两项需要说明的测试状态

1. **SexBJCam 的 HLS 编号排序未验证**。实现按编号降序（依据参考卡的设备实测记录），但在尝试逐条请求 `hls2` / `hls3` 对比时，站点正处于持续 502 状态（一次连续 10 次采样，200 命中 0 次）。站点恢复后需补测。

2. **PornMD 未交付**。实测其搜索结果**完全由客户端 JS 渲染**：HTML 里没有视频卡片（`<img>` 只有 6 个，全是 logo 与徽章），内嵌 JSON 为 `{"crossSiteHostnames":[]}`，说明跨站源是运行时填充的。Vega 沙盒不执行页面脚本，静态抓取拿不到任何条目。详见 `../docs/site-availability.md`。

## 与官方模板的关系

本仓库基于官方 `providers-template`（基线提交 `7e1a577`，已移除示例 provider），
按官方 Provider 契约实现，**未修改** Vega 主应用的加载器、沙盒或 Provider 接口。
